import { withTimeout } from "../../common/with-timeout";
import type { LanguageModelProvider } from "../language-model.provider";
import type {
  GroundedResponseInput,
  GroundedResponseResult,
  IntentClassification,
  LanguageModelInput,
  SlotExtractionInput,
  SlotExtractionResult,
} from "../types";

const PROVIDER_NAME = "fixture";
const TIMEOUT_MS = 5_000;

/**
 * A6.2: deterministic, keyword-based fixture — no real language model
 * call. Good enough to drive the dialogue pipeline's control flow in
 * tests; not a claim about real intent-classification quality.
 */
export class FixtureLanguageModelProvider implements LanguageModelProvider {
  readonly providerName = PROVIDER_NAME;

  async classifyIntent(input: LanguageModelInput): Promise<IntentClassification> {
    return withTimeout(this.doClassifyIntent(input), TIMEOUT_MS, PROVIDER_NAME, "classifyIntent");
  }

  private async doClassifyIntent(input: LanguageModelInput): Promise<IntentClassification> {
    const text = input.callerUtterance.toLowerCase();
    // Checked first: a mechanical stub only. Real clinical/emergency
    // detection is Module 9's safety classifier (not built — see
    // docs/adr/dialect-feasibility-verdict.md); this exists so
    // EmergencyExit's state-machine *mechanics* (interrupt within one
    // turn, transfer requested) are exercisable in tests.
    if (text.includes("emergency") || text.includes("طارئ") || text.includes("chest pain")) {
      return { intent: "emergency", confidence: 0.99 };
    }
    // Checked before the booking keywords: "cancel my appointment" contains
    // "appointment" too, and cancellation is the more specific intent.
    if (text.includes("الغ") || text.includes("cancel")) {
      return { intent: "cancel_appointment", confidence: 0.9 };
    }
    if (text.includes("موعد") || text.includes("appointment") || text.includes("book")) {
      return { intent: "book_appointment", confidence: 0.9 };
    }
    if (text.includes("انسان") || text.includes("human") || text.includes("موظف")) {
      return { intent: "request_human", confidence: 0.95 };
    }
    return { intent: "unknown", confidence: 0.3 };
  }

  async extractSlots(input: SlotExtractionInput): Promise<SlotExtractionResult> {
    return withTimeout(this.doExtractSlots(input), TIMEOUT_MS, PROVIDER_NAME, "extractSlots");
  }

  private async doExtractSlots(input: SlotExtractionInput): Promise<SlotExtractionResult> {
    // Test-only convention, not real NLU: a scripted utterance can embed
    // `slotName:value` tokens (e.g. "book serviceId:abc-123
    // staffMemberId:def-456 requestedStartAt:2030-06-01T09:00:00.000Z")
    // and this fixture extracts them at high confidence, the same way
    // FixtureSpeechRecognitionProvider takes a canned script instead of
    // doing real audio recognition. Anything not embedded this way comes
    // back low-confidence, exercising A7.2's clarification path.
    const found = new Map<string, string>();
    for (const match of input.callerUtterance.matchAll(/(\w+):(\S+)/g)) {
      found.set(match[1]!, match[2]!);
    }

    const slots: Record<string, string | undefined> = {};
    const confidencePerSlot: Record<string, number> = {};
    for (const slotName of input.slotNames) {
      const value = found.get(slotName);
      slots[slotName] = value;
      confidencePerSlot[slotName] = value ? 0.9 : 0.3;
    }
    return { slots, confidencePerSlot };
  }

  async draftGroundedResponse(input: GroundedResponseInput): Promise<GroundedResponseResult> {
    return withTimeout(
      this.doDraftGroundedResponse(input),
      TIMEOUT_MS,
      PROVIDER_NAME,
      "draftGroundedResponse",
    );
  }

  private async doDraftGroundedResponse(input: GroundedResponseInput): Promise<GroundedResponseResult> {
    // Constraint 2.2: with no retrieved record, state the answer is
    // unavailable rather than inventing one — the fixture models this
    // exactly like a real provider is required to.
    if (input.retrievedKnowledge.length === 0) {
      return {
        responseText:
          input.language === "ar"
            ? "عذرًا، لا تتوفر لدي إجابة على هذا السؤال الآن."
            : "Sorry, I don't have an answer to that available right now.",
        groundedInRetrievedKnowledge: false,
      };
    }
    const [first] = input.retrievedKnowledge;
    return { responseText: first!.answerText, groundedInRetrievedKnowledge: true };
  }
}
