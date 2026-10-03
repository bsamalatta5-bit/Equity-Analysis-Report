import type { PrismaClient } from "@prisma/client";
import {
  ProviderFailureError,
  ProviderTimeoutError,
  THRESHOLDS,
  type CallDisposition,
  type KnowledgeLanguage,
} from "@voice-receptionist/shared";
import { withTenant } from "../common/prisma-client";
import { evaluateConfidence } from "../dialogue/clarification";
import { decideProviderFailureEscalation } from "../degradation/provider-failure";
import { checkSpendCircuitBreaker } from "../degradation/spend-circuit-breaker";
import { retrieveTopKnowledgeMatch } from "../knowledge/retrieval";
import { recordCallTurn } from "../pipeline/transcript";
import type { LanguageModelProvider } from "../providers/language-model.provider";
import { classifySafety, type SafetyClassification } from "../safety/safety-classifier";
import { containsClinicalContent } from "../safety/clinical-content-guard";
import { findNearestOpenSlots, isExactSlotOpen } from "./availability-lookup";
import { writeConfirmedAppointment } from "./booking-writer";
import type { BookingSlots, DialogueContext, OpenSlotCandidate, TurnEvent, TurnResult } from "./types";
import { createInitialContext } from "./types";

const SLOT_NAMES = ["serviceId", "staffMemberId", "requestedStartAt"] as const;
type SlotName = (typeof SLOT_NAMES)[number];

function missingSlotNames(slots: BookingSlots): SlotName[] {
  return SLOT_NAMES.filter((name) => slots[name as keyof BookingSlots] === undefined);
}

function withDefaultLanguage(language: KnowledgeLanguage | null): KnowledgeLanguage {
  return language ?? "en";
}

function conversationHistoryPlaceholder(): [] {
  // Full multi-turn history isn't threaded through provider calls yet;
  // each is evaluated on the current turn's utterance alone. Module 10
  // added CallTurn persistence (recordCallTurn, called from handleTurn
  // below) so the rows this would read from now exist — reassembling them
  // into LanguageModelInput.conversationHistory on every call is a
  // follow-up, not required by any acceptance criterion this build has
  // implemented.
  return [];
}

export interface DialogueStateMachineDeps {
  readonly languageModel: LanguageModelProvider;
  readonly prisma: PrismaClient;
  readonly tenantId: string;
  readonly locationId: string;
  readonly callId: string;
  readonly contactPhoneE164: string;
}

/**
 * Module 7: the ten states of Section 6 verbatim (DialogueState). A7.1's
 * database write happens only inside performWrite(), reached only from
 * handleConfirmation's "confirmed" branch — there is no other path in
 * this file that calls writeConfirmedAppointment.
 */
export class DialogueStateMachine {
  constructor(private readonly deps: DialogueStateMachineDeps) {}

  /**
   * A10.1: the assistant's very first utterance is the consent/recording
   * announcement, and this is the only place that marks
   * ConsentRecord.announcementPlayedAt. recordCallTurn (called from
   * handleTurn for every subsequent turn) refuses to persist any
   * caller-spoken text until that flag is set — so no caller speech can be
   * retained before this announcement plays, by construction: a
   * DialogueContext only ever comes from this method's own output or from
   * a prior handleTurn call, tracing back to this one.
   */
  async start(): Promise<TurnResult> {
    const context = createInitialContext();

    // A11.3: checked before anything else in the call, including the
    // consent announcement — a suspended call never reaches a provider,
    // and never collects caller speech to retain, so there is nothing for
    // A10.1's consent gate to protect here.
    const spendCheck = await withTenant(this.deps.prisma, this.deps.tenantId, (tx) =>
      checkSpendCircuitBreaker(tx, this.deps.tenantId, new Date()),
    );
    if (spendCheck.breached) {
      return this.handleSpendLimitSuspended(context);
    }

    await withTenant(this.deps.prisma, this.deps.tenantId, (tx) =>
      tx.consentRecord.update({
        where: { callId: this.deps.callId },
        data: { announcementPlayedAt: new Date() },
      }),
    );
    return {
      context: { ...context, state: "LanguageDetection" },
      assistantText:
        "This call may be recorded for quality and training purposes. Welcome — you may speak in Arabic or English. قد يتم تسجيل هذه المكالمة لأغراض الجودة والتدريب. مرحبًا، بإمكانك التحدث بالعربية أو الإنجليزية.",
      callShouldEnd: false,
      transferRequested: false,
    };
  }

  /** A11.3. */
  private async handleSpendLimitSuspended(context: DialogueContext): Promise<TurnResult> {
    const decision = await withTenant(this.deps.prisma, this.deps.tenantId, (tx) =>
      decideProviderFailureEscalation(tx, { locationId: this.deps.locationId, now: new Date() }),
    );

    if (decision.kind === "transfer") {
      await this.recordDisposition("spend_limit_suspended");
      return {
        context: { ...context, state: "Escalation" },
        assistantText:
          "We're unable to continue this call automatically right now. Transferring you to our team. " +
          "لا يمكننا متابعة هذه المكالمة آليًا حاليًا. سيتم تحويلك إلى فريقنا.",
        callShouldEnd: false,
        transferRequested: true,
      };
    }

    await this.recordDisposition("spend_limit_suspended");
    return {
      context: { ...context, state: "Closure" },
      assistantText:
        "We're unable to continue this call automatically right now, and our team is unavailable. We'll call you back soon. " +
        "لا يمكننا متابعة هذه المكالمة آليًا حاليًا، وفريقنا غير متاح. سنتصل بك قريبًا.",
      callShouldEnd: true,
      transferRequested: false,
    };
  }

  async handleTurn(context: DialogueContext, event: TurnEvent): Promise<TurnResult> {
    if (context.state === "Closure" || context.state === "Escalation" || context.state === "EmergencyExit") {
      return this.terminalNoOp(context);
    }

    if (event.kind === "silence") {
      return this.handleSilence(context);
    }

    const contextAfterUtterance: DialogueContext = { ...context, consecutiveSilenceCount: 0 };

    // A10.1: recorded before dispatch, so a caller's own words are never
    // persisted ahead of the consent announcement that gates them.
    await withTenant(this.deps.prisma, this.deps.tenantId, (tx) =>
      recordCallTurn(tx, {
        callId: this.deps.callId,
        speaker: "caller",
        transcriptText: event.text,
        detectedLanguage: event.language,
        languageConfidence: event.confidence,
      }),
    );

    const result = await this.dispatchTurn(context, contextAfterUtterance, event);

    if (result.assistantText.length > 0) {
      await withTenant(this.deps.prisma, this.deps.tenantId, (tx) =>
        recordCallTurn(tx, {
          callId: this.deps.callId,
          speaker: "assistant",
          transcriptText: result.assistantText,
        }),
      );
    }

    return result;
  }

  private async dispatchTurn(
    originalContext: DialogueContext,
    contextAfterUtterance: DialogueContext,
    event: Extract<TurnEvent, { kind: "utterance" }>,
  ): Promise<TurnResult> {
    // A9.1: evaluated on every caller turn, from every state — checked
    // ahead of the per-state dispatch below so an emergency mid-booking
    // (e.g. during SlotCollection) is caught exactly as reliably as one
    // during IntentCapture. A9.3 treats every positive result identically,
    // regardless of dialogue state or SafetyCategory.
    const safety = classifySafety(event.text);
    if (safety.flagged) {
      return this.handleSafetyFlag(contextAfterUtterance, safety);
    }

    try {
      switch (contextAfterUtterance.state) {
        case "LanguageDetection":
          return await this.handleLanguageDetection(contextAfterUtterance, event);
        case "IntentCapture":
          return await this.handleIntentCapture(contextAfterUtterance, event);
        case "SlotCollection":
          return await this.handleSlotCollection(contextAfterUtterance, event);
        case "AvailabilityCheck":
          return await this.handleAvailabilityCheck(contextAfterUtterance, event);
        case "Confirmation":
          return await this.handleConfirmation(contextAfterUtterance, event);
        default:
          return this.terminalNoOp(contextAfterUtterance);
      }
    } catch (error) {
      // A9.5: a provider failure (a real AppError from a provider's own
      // timeout/failure path — see with-timeout.ts — not a bug in this
      // state machine) never surfaces as an unhandled rejection to the
      // caller; it always resolves to a transfer or a captured message.
      if (error instanceof ProviderFailureError || error instanceof ProviderTimeoutError) {
        return this.handleProviderFailure(
          contextAfterUtterance,
          withDefaultLanguage(originalContext.language),
        );
      }
      throw error;
    }
  }

  private terminalNoOp(context: DialogueContext): TurnResult {
    return {
      context,
      assistantText: "",
      callShouldEnd: context.state === "Closure",
      transferRequested: context.state === "Escalation" || context.state === "EmergencyExit",
    };
  }

  /** A7.4: 7s silence -> one re-prompt; a second consecutive silence closes the call with a callback offer. */
  private async handleSilence(context: DialogueContext): Promise<TurnResult> {
    const nextSilenceCount = context.consecutiveSilenceCount + 1;
    const language = withDefaultLanguage(context.language);

    if (nextSilenceCount >= 2) {
      await this.recordDisposition("abandoned");
      return {
        context: { ...context, state: "Closure", consecutiveSilenceCount: nextSilenceCount },
        assistantText:
          language === "ar"
            ? "لم نسمع ردًا. سنعاود الاتصال بك لاحقًا. مع السلامة."
            : "We didn't hear a response. We'll call you back. Goodbye.",
        callShouldEnd: true,
        transferRequested: false,
      };
    }

    return {
      context: { ...context, consecutiveSilenceCount: nextSilenceCount },
      assistantText: language === "ar" ? "هل ما زلت معي؟" : "Are you still there?",
      callShouldEnd: false,
      transferRequested: false,
    };
  }

  /**
   * A9.3: "A positive result interrupts within one turn, states the
   * emergency-services instruction, and attempts transfer within 3 seconds
   * of classification." The 3-second transfer attempt is the telephony
   * layer's responsibility once transferRequested is true (Module 5,
   * TelephonyProvider.transferCall) — this method's job ends at requesting
   * it immediately, in the same turn, with no further caller turns in
   * between.
   */
  private async handleSafetyFlag(
    context: DialogueContext,
    _safety: SafetyClassification,
  ): Promise<TurnResult> {
    const language = withDefaultLanguage(context.language);
    await this.recordDisposition("emergency_transfer");
    return {
      context: { ...context, state: "EmergencyExit" },
      assistantText:
        language === "ar"
          ? "إذا كانت هذه حالة طارئة تهدد الحياة، الرجاء الاتصال بالإسعاف فورًا. جارٍ تحويلك الآن."
          : "If this is a life-threatening emergency, please call emergency services now. Transferring you now.",
      callShouldEnd: false,
      transferRequested: true,
    };
  }

  /** A9.5. */
  private async handleProviderFailure(
    context: DialogueContext,
    language: KnowledgeLanguage,
  ): Promise<TurnResult> {
    const decision = await withTenant(this.deps.prisma, this.deps.tenantId, (tx) =>
      decideProviderFailureEscalation(tx, { locationId: this.deps.locationId, now: new Date() }),
    );

    if (decision.kind === "transfer") {
      await this.recordDisposition("provider_failure");
      return {
        context: { ...context, state: "Escalation" },
        assistantText:
          language === "ar"
            ? "نواجه مشكلة تقنية. سأقوم بتحويلك إلى أحد أفراد فريقنا الآن."
            : "We're experiencing a technical issue. Transferring you to our team now.",
        callShouldEnd: false,
        transferRequested: true,
      };
    }

    await this.recordDisposition("message_captured");
    return {
      context: { ...context, state: "Closure" },
      assistantText:
        language === "ar"
          ? "نواجه مشكلة تقنية خارج ساعات الدعم. سنتصل بك للمتابعة قريبًا."
          : "We're experiencing a technical issue outside our support hours. We'll call you back soon.",
      callShouldEnd: true,
      transferRequested: false,
    };
  }

  private async recordDisposition(disposition: CallDisposition): Promise<void> {
    await withTenant(this.deps.prisma, this.deps.tenantId, (tx) =>
      tx.call.update({ where: { id: this.deps.callId }, data: { disposition } }),
    );
  }

  private async handleLanguageDetection(
    context: DialogueContext,
    event: Extract<TurnEvent, { kind: "utterance" }>,
  ): Promise<TurnResult> {
    const language = event.language;
    return {
      context: { ...context, state: "IntentCapture", language },
      assistantText: language === "ar" ? "كيف يمكنني مساعدتك اليوم؟" : "How can I help you today?",
      callShouldEnd: false,
      transferRequested: false,
    };
  }

  private async handleIntentCapture(
    context: DialogueContext,
    event: Extract<TurnEvent, { kind: "utterance" }>,
  ): Promise<TurnResult> {
    const language = withDefaultLanguage(context.language);
    const classification = await this.deps.languageModel.classifyIntent({
      callerUtterance: event.text,
      conversationHistory: conversationHistoryPlaceholder(),
      language,
    });

    const evaluation = evaluateConfidence(classification.confidence, context.consecutiveLowConfidenceCount);

    if (evaluation.outcome === "escalate") {
      return this.escalate(context, language);
    }
    if (evaluation.outcome === "clarify") {
      return {
        context: { ...context, consecutiveLowConfidenceCount: evaluation.nextConsecutiveLowConfidenceCount },
        assistantText:
          language === "ar"
            ? "عذرًا، لم أفهم ذلك. هل يمكنك التكرار؟"
            : "Sorry, I didn't catch that. Could you repeat it?",
        callShouldEnd: false,
        transferRequested: false,
      };
    }

    const resetContext = { ...context, consecutiveLowConfidenceCount: 0, intent: classification.intent };

    // No "emergency" branch here: Module 9's safety classifier
    // (classifySafety, checked in handleTurn before this method ever runs)
    // is what detects that now, on every turn from every state — not just
    // while IntentCapture happens to be classifying intent.

    if (classification.intent === "request_human" || classification.intent === "cancel_appointment") {
      return this.escalate(resetContext, language);
    }

    if (classification.intent === "book_appointment") {
      return {
        context: { ...resetContext, state: "SlotCollection" },
        assistantText:
          language === "ar"
            ? "بكل سرور. ما الخدمة التي ترغب بحجزها، ومع من، وفي أي تاريخ ووقت؟"
            : "Sure. What service would you like to book, with whom, and for what date and time?",
        callShouldEnd: false,
        transferRequested: false,
      };
    }

    if (classification.intent === "ask_question") {
      return this.answerQuestion(resetContext, language, event.text);
    }

    return this.escalate(resetContext, language);
  }

  /**
   * Module 8 (A8.1-A8.3). Retrieval runs under `withTenant`, so it is
   * confined to this call's own tenant both by RLS and by the explicit
   * predicate in retrieveTopKnowledgeMatch. Below the similarity
   * threshold, this never calls draftGroundedResponse at all — A8.2 says
   * "no drafted answer", not "a hedged answer" — and instead states the
   * answer is unavailable and offers escalation, the same
   * state/transferRequested shape as escalate() uses elsewhere.
   */
  private async answerQuestion(
    context: DialogueContext,
    language: KnowledgeLanguage,
    questionText: string,
  ): Promise<TurnResult> {
    const match = await withTenant(this.deps.prisma, this.deps.tenantId, (tx) =>
      retrieveTopKnowledgeMatch(tx, { tenantId: this.deps.tenantId, queryText: questionText, language }),
    );

    if (!match || match.similarity < THRESHOLDS.KNOWLEDGE_SIMILARITY_MIN) {
      return this.escalateWithUnavailableAnswer(context, language);
    }

    const drafted = await this.deps.languageModel.draftGroundedResponse({
      callerUtterance: questionText,
      conversationHistory: conversationHistoryPlaceholder(),
      language,
      retrievedKnowledge: [{ questionText: match.questionText, answerText: match.answerText }],
    });

    // A9.4: a second, structural guard on the one output path this codebase
    // doesn't fully control the contents of (see clinical-content-guard.ts).
    // Refuses to speak the drafted text at all if it looks clinical —
    // escalates instead, same as an unavailable answer.
    if (containsClinicalContent(drafted.responseText)) {
      return this.escalateWithUnavailableAnswer(context, language);
    }

    return {
      context: { ...context, state: "IntentCapture" },
      assistantText: drafted.responseText,
      callShouldEnd: false,
      transferRequested: false,
    };
  }

  private async escalateWithUnavailableAnswer(
    context: DialogueContext,
    language: KnowledgeLanguage,
  ): Promise<TurnResult> {
    await this.recordDisposition("escalated");
    return {
      context: { ...context, state: "Escalation" },
      assistantText:
        language === "ar"
          ? "ليس لدي إجابة على ذلك. دعني أحولك إلى أحد أفراد فريقنا."
          : "I don't have an answer for that. Let me connect you with a member of our team.",
      callShouldEnd: false,
      transferRequested: true,
    };
  }

  private async handleSlotCollection(
    context: DialogueContext,
    event: Extract<TurnEvent, { kind: "utterance" }>,
  ): Promise<TurnResult> {
    const language = withDefaultLanguage(context.language);
    const missing = missingSlotNames(context.slots);

    const extraction = await this.deps.languageModel.extractSlots({
      callerUtterance: event.text,
      conversationHistory: conversationHistoryPlaceholder(),
      language,
      slotNames: missing,
    });

    let lowestConfidence = 1;
    const nextSlots: BookingSlots = { ...context.slots };
    for (const slotName of missing) {
      const confidence = extraction.confidencePerSlot[slotName] ?? 0;
      const value = extraction.slots[slotName];
      if (value !== undefined) {
        (nextSlots as Record<string, string | undefined>)[slotName] = value;
      }
      lowestConfidence = Math.min(lowestConfidence, confidence);
    }

    const stillMissing = missingSlotNames(nextSlots);
    if (stillMissing.length > 0) {
      const evaluation = evaluateConfidence(lowestConfidence, context.consecutiveLowConfidenceCount);
      if (evaluation.outcome === "escalate") {
        return this.escalate({ ...context, slots: nextSlots }, language);
      }
      return {
        context: {
          ...context,
          slots: nextSlots,
          consecutiveLowConfidenceCount: evaluation.nextConsecutiveLowConfidenceCount,
        },
        assistantText:
          language === "ar"
            ? "لم أفهم كل التفاصيل. هل يمكنك التوضيح؟"
            : "I didn't catch all of that. Could you clarify?",
        callShouldEnd: false,
        transferRequested: false,
      };
    }

    const requestedStartAt = new Date(nextSlots.requestedStartAt!);
    if (Number.isNaN(requestedStartAt.getTime())) {
      return {
        context: { ...context, slots: nextSlots },
        assistantText:
          language === "ar"
            ? "لم أفهم التاريخ والوقت. هل يمكنك إعادة ذكره؟"
            : "I didn't understand the date and time. Could you say it again?",
        callShouldEnd: false,
        transferRequested: false,
      };
    }

    return this.checkAvailability(
      { ...context, slots: nextSlots, state: "AvailabilityCheck", consecutiveLowConfidenceCount: 0 },
      language,
    );
  }

  private async handleAvailabilityCheck(
    context: DialogueContext,
    event: Extract<TurnEvent, { kind: "utterance" }>,
  ): Promise<TurnResult> {
    const language = withDefaultLanguage(context.language);

    if (context.proposedAlternatives.length > 0) {
      const choiceMatch = event.text.match(/choice:(\d+)/);
      const choiceIndex = choiceMatch ? Number(choiceMatch[1]) - 1 : -1;
      const chosen = context.proposedAlternatives[choiceIndex];
      if (!chosen) {
        return {
          context,
          assistantText:
            language === "ar"
              ? "من فضلك اختر الخيار الأول أو الثاني."
              : "Please choose the first or second option.",
          callShouldEnd: false,
          transferRequested: false,
        };
      }
      const nextSlots: BookingSlots = {
        ...context.slots,
        staffMemberId: chosen.staffMemberId,
        requestedStartAt: chosen.startAt.toISOString(),
      };
      return this.promptConfirmation({ ...context, slots: nextSlots, proposedAlternatives: [] }, language);
    }

    // Re-entered AvailabilityCheck without pending alternatives and with a
    // caller utterance in hand (e.g. after SlotCollection) — re-run the check.
    return this.checkAvailability(context, language);
  }

  private async checkAvailability(
    context: DialogueContext,
    language: KnowledgeLanguage,
  ): Promise<TurnResult> {
    const requestedStartAt = new Date(context.slots.requestedStartAt!);
    const staffMemberId = context.slots.staffMemberId!;
    const serviceId = context.slots.serviceId!;

    const open = await withTenant(this.deps.prisma, this.deps.tenantId, (tx) =>
      isExactSlotOpen(tx, { staffMemberId, serviceId, startAt: requestedStartAt }),
    );

    if (open) {
      return this.promptConfirmation(context, language);
    }

    return this.offerAlternatives(context, language, requestedStartAt);
  }

  private async offerAlternatives(
    context: DialogueContext,
    language: KnowledgeLanguage,
    after: Date,
  ): Promise<TurnResult> {
    const staffMemberId = context.slots.staffMemberId!;
    const serviceId = context.slots.serviceId!;

    const alternatives = await withTenant(this.deps.prisma, this.deps.tenantId, (tx) =>
      findNearestOpenSlots(tx, { staffMemberId, serviceId, after, count: 2 }),
    );

    return {
      context: { ...context, state: "AvailabilityCheck", proposedAlternatives: alternatives },
      assistantText: this.describeAlternatives(alternatives, language),
      callShouldEnd: false,
      transferRequested: false,
    };
  }

  private describeAlternatives(
    alternatives: readonly OpenSlotCandidate[],
    language: KnowledgeLanguage,
  ): string {
    if (alternatives.length === 0) {
      return language === "ar"
        ? "عذرًا، لا تتوفر مواعيد قريبة. هل تودين التحدث إلى أحد الموظفين؟"
        : "Sorry, there are no nearby openings. Would you like to speak with our staff?";
    }
    const formatted = alternatives
      .map((slot, index) => `${index + 1}) ${slot.startAt.toISOString()}`)
      .join(", ");
    return language === "ar"
      ? `هذا الموعد غير متاح. الخيارات المتاحة: ${formatted}. أيهما تفضل؟`
      : `That time isn't available. Here are two options: ${formatted}. Which would you prefer?`;
  }

  private promptConfirmation(context: DialogueContext, language: KnowledgeLanguage): TurnResult {
    const requestedStartAt = new Date(context.slots.requestedStartAt!);
    const summary =
      language === "ar"
        ? `لتأكيد الحجز: الخدمة ${context.slots.serviceId}، مع ${context.slots.staffMemberId}، بتاريخ ووقت ${requestedStartAt.toISOString()}. هل تؤكد؟`
        : `To confirm: service ${context.slots.serviceId}, with ${context.slots.staffMemberId}, on ${requestedStartAt.toISOString()}. Shall I confirm this booking?`;
    return {
      context: { ...context, state: "Confirmation" },
      assistantText: summary,
      callShouldEnd: false,
      transferRequested: false,
    };
  }

  private async handleConfirmation(
    context: DialogueContext,
    event: Extract<TurnEvent, { kind: "utterance" }>,
  ): Promise<TurnResult> {
    const language = withDefaultLanguage(context.language);
    const text = event.text.toLowerCase();
    const confirmed = text.includes("yes") || text.includes("نعم") || text.includes("confirm:yes");
    const declined = text.includes("no") || text.includes("لا") || text.includes("confirm:no");

    if (!confirmed && !declined) {
      return {
        context,
        assistantText:
          language === "ar" ? "هل تؤكد الحجز؟ نعم أم لا؟" : "Shall I confirm the booking — yes or no?",
        callShouldEnd: false,
        transferRequested: false,
      };
    }

    if (declined) {
      return this.escalate(context, language);
    }

    // A7.1: the write happens here and only here — after this explicit
    // spoken confirmation of service, staff, date, and time.
    return this.performWrite(context, language);
  }

  private async performWrite(context: DialogueContext, language: KnowledgeLanguage): Promise<TurnResult> {
    const writingContext: DialogueContext = { ...context, state: "Write" };
    const requestedStartAt = new Date(context.slots.requestedStartAt!);

    const outcome = await writeConfirmedAppointment(this.deps.prisma, {
      tenantId: this.deps.tenantId,
      locationId: this.deps.locationId,
      staffMemberId: context.slots.staffMemberId!,
      serviceId: context.slots.serviceId!,
      startAt: requestedStartAt,
      callId: this.deps.callId,
      contactPhoneE164: this.deps.contactPhoneE164,
    });

    if (outcome.kind === "contention") {
      // A7.3: slot contention during confirmation returns to
      // AvailabilityCheck with two stated alternatives.
      return this.offerAlternatives(writingContext, language, requestedStartAt);
    }

    await this.recordDisposition("contained");
    return {
      context: { ...writingContext, state: "Closure" },
      bookingOutcome: outcome,
      assistantText:
        language === "ar"
          ? "تم تأكيد موعدك. شكرًا لاتصالك، مع السلامة."
          : "Your appointment is confirmed. Thank you for calling, goodbye.",
      callShouldEnd: true,
      transferRequested: false,
    };
  }

  private async escalate(context: DialogueContext, language: KnowledgeLanguage): Promise<TurnResult> {
    await this.recordDisposition("escalated");
    return {
      context: { ...context, state: "Escalation" },
      assistantText:
        language === "ar"
          ? "دعني أحولك إلى أحد أفراد فريقنا."
          : "Let me connect you with a member of our team.",
      callShouldEnd: false,
      transferRequested: true,
    };
  }
}
