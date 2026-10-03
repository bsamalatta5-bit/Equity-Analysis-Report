import type { KnowledgeLanguage } from "@voice-receptionist/shared";

/** Module 7: Section 6, states listed verbatim. */
export const DIALOGUE_STATES = [
  "Greeting",
  "LanguageDetection",
  "IntentCapture",
  "SlotCollection",
  "AvailabilityCheck",
  "Confirmation",
  "Write",
  "Closure",
  "Escalation",
  "EmergencyExit",
] as const;
export type DialogueState = (typeof DIALOGUE_STATES)[number];

export interface OpenSlotCandidate {
  readonly staffMemberId: string;
  readonly startAt: Date;
  readonly endAt: Date;
}

export interface BookingSlots {
  serviceId?: string;
  staffMemberId?: string;
  /** ISO 8601 string, as extracted from the caller's utterance — parsed to a Date only where needed. */
  requestedStartAt?: string;
}

export interface DialogueContext {
  readonly state: DialogueState;
  readonly language: KnowledgeLanguage | null;
  readonly intent: string | null;
  readonly slots: BookingSlots;
  /** A7.2: consecutive low-confidence recognitions, reset to 0 on any accepted (>=0.65) result. */
  readonly consecutiveLowConfidenceCount: number;
  /** A7.4: consecutive silence events, reset to 0 on any caller utterance. */
  readonly consecutiveSilenceCount: number;
  readonly proposedAlternatives: readonly OpenSlotCandidate[];
}

export function createInitialContext(): DialogueContext {
  return {
    state: "Greeting",
    language: null,
    intent: null,
    slots: {},
    consecutiveLowConfidenceCount: 0,
    consecutiveSilenceCount: 0,
    proposedAlternatives: [],
  };
}

/** One recognized caller turn, or the absence of one. Caller speech is data, never instruction (Constraint 2.4) — carried only in `text`. */
export type TurnEvent =
  | {
      readonly kind: "utterance";
      readonly text: string;
      readonly confidence: number;
      readonly language: KnowledgeLanguage;
    }
  | { readonly kind: "silence" };

export type BookingOutcome =
  | { readonly kind: "booked"; readonly appointmentId: string }
  | { readonly kind: "contention"; readonly alternatives: readonly OpenSlotCandidate[] };

export interface TurnResult {
  readonly context: DialogueContext;
  readonly assistantText: string;
  readonly bookingOutcome?: BookingOutcome;
  readonly callShouldEnd: boolean;
  readonly transferRequested: boolean;
}
