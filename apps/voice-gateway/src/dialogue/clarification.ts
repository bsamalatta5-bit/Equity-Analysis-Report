import { THRESHOLDS } from "@voice-receptionist/shared";

export type ConfidenceOutcome = "accept" | "clarify" | "escalate";

export interface ConfidenceEvaluation {
  readonly outcome: ConfidenceOutcome;
  readonly nextConsecutiveLowConfidenceCount: number;
}

/**
 * A7.2: "Recognition confidence below 0.65 triggers one clarification per
 * slot, with a maximum of two consecutive clarifications before
 * escalation." Read as: up to
 * THRESHOLDS.MAX_CONSECUTIVE_CLARIFICATIONS (2) consecutive low-confidence
 * results each get a clarification re-prompt; a third consecutive
 * low-confidence result escalates instead of asking a third time.
 */
export function evaluateConfidence(
  confidence: number,
  priorConsecutiveLowConfidenceCount: number,
): ConfidenceEvaluation {
  if (confidence >= THRESHOLDS.SLOT_CONFIDENCE_MIN) {
    return { outcome: "accept", nextConsecutiveLowConfidenceCount: 0 };
  }
  const count = priorConsecutiveLowConfidenceCount + 1;
  return {
    outcome: count > THRESHOLDS.MAX_CONSECUTIVE_CLARIFICATIONS ? "escalate" : "clarify",
    nextConsecutiveLowConfidenceCount: count,
  };
}
