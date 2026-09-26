import type { PrismaClient } from "@prisma/client";
import { THRESHOLDS, type KnowledgeLanguage } from "@voice-receptionist/shared";
import { withTenant } from "../common/prisma-client";
import { evaluateConfidence } from "../dialogue/clarification";
import { retrieveTopKnowledgeMatch } from "../knowledge/retrieval";
import type { LanguageModelProvider } from "../providers/language-model.provider";
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
  // Full multi-turn history isn't threaded through this call yet; each
  // provider call is evaluated on the current turn's utterance alone.
  // Sufficient for Module 7's state-machine mechanics — a real deployment
  // would carry CallTurn rows here once Module 5's transcript persistence
  // (out of this session's scope) exists.
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

  /** The assistant speaks first; call this once before any caller turn. */
  start(): TurnResult {
    const context = createInitialContext();
    return {
      context: { ...context, state: "LanguageDetection" },
      assistantText:
        "Welcome. مرحبًا. You may speak in Arabic or English. بإمكانك التحدث بالعربية أو الإنجليزية.",
      callShouldEnd: false,
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

    switch (contextAfterUtterance.state) {
      case "LanguageDetection":
        return this.handleLanguageDetection(contextAfterUtterance, event);
      case "IntentCapture":
        return this.handleIntentCapture(contextAfterUtterance, event);
      case "SlotCollection":
        return this.handleSlotCollection(contextAfterUtterance, event);
      case "AvailabilityCheck":
        return this.handleAvailabilityCheck(contextAfterUtterance, event);
      case "Confirmation":
        return this.handleConfirmation(contextAfterUtterance, event);
      default:
        return this.terminalNoOp(contextAfterUtterance);
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
  private handleSilence(context: DialogueContext): TurnResult {
    const nextSilenceCount = context.consecutiveSilenceCount + 1;
    const language = withDefaultLanguage(context.language);

    if (nextSilenceCount >= 2) {
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

    if (classification.intent === "emergency") {
      return {
        context: { ...resetContext, state: "EmergencyExit" },
        assistantText:
          language === "ar"
            ? "إذا كانت هذه حالة طارئة تهدد الحياة، الرجاء الاتصال بالإسعاف فورًا. جارٍ تحويلك الآن."
            : "If this is a life-threatening emergency, please call emergency services now. Transferring you now.",
        callShouldEnd: false,
        transferRequested: true,
      };
    }

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

    return {
      context: { ...context, state: "IntentCapture" },
      assistantText: drafted.responseText,
      callShouldEnd: false,
      transferRequested: false,
    };
  }

  private escalateWithUnavailableAnswer(context: DialogueContext, language: KnowledgeLanguage): TurnResult {
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

  private escalate(context: DialogueContext, language: KnowledgeLanguage): TurnResult {
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
