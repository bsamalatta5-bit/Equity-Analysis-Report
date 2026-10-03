export type SafetyCategory = "emergency" | "clinical";

export interface SafetyClassification {
  readonly flagged: boolean;
  /** Present only when flagged — informational (corpus labeling, telemetry), never used to vary the FSM's response: A9.3 treats every positive result identically. */
  readonly category: SafetyCategory | null;
}

/**
 * Life-threatening or acutely dangerous caller statements. English and
 * Saudi-dialect/MSA Arabic phrasing side by side, not translations of one
 * canonical list — the two do not share cognates, so each needs its own
 * patterns.
 */
const EMERGENCY_PATTERNS: readonly RegExp[] = [
  /chest pain/i,
  /can'?t breathe/i,
  /difficulty breathing/i,
  /trouble breathing/i,
  /unconscious/i,
  /unresponsive/i,
  /not breathing/i,
  /severe bleeding/i,
  /heavy bleeding/i,
  /won'?t stop bleeding/i,
  /\bstroke\b/i,
  /face (is )?drooping/i,
  /slurred speech/i,
  /\bseizure\b/i,
  /convulsing/i,
  /suicidal/i,
  /kill myself/i,
  /end my life/i,
  /overdose/i,
  /anaphylaxis/i,
  /throat (is )?closing/i,
  /هذه حالة طارئة/,
  /حالة طارئة/,
  /طارئ/,
  /لا أستطيع التنفس/,
  /صعوبة في التنفس/,
  /فقدان الوعي/,
  /فاقد( ال)?وعي/,
  /نزيف شديد/,
  /لا يتوقف النزيف/,
  /سكتة دماغية/,
  /تشنج/,
  /انتحار/,
  /جرعة زائدة/,
];

/** Requests directed at the assistant for a diagnosis or treatment plan — not itself life-threatening, but out of scope for anything but a human. */
const CLINICAL_PATTERNS: readonly RegExp[] = [
  /do i have (cancer|diabetes|covid|an infection)/i,
  /is this (cancer|a tumor|serious)/i,
  /what medication should i take/i,
  /what should i take for/i,
  /how many (mg|milligrams)/i,
  /diagnose me/i,
  /what'?s wrong with me/i,
  /هل هذا (سرطان|خطير|ورم)/,
  /هل أنا مصاب/,
  /وش الدواء المناسب/,
  /ايش الدواء اللي يناسبني/,
  /كم جرعة/,
  /شخّص حالتي/,
  /شخصلي حالتي/,
];

/**
 * A9.1: called for every caller turn, from every dialogue state — see
 * dialogue-state-machine.ts's handleTurn, which checks this before
 * dispatching to any state-specific handler. A9.2's recall/false-positive
 * rate against a real labeled corpus is measured by
 * safety-classifier-evaluation.ts, not by this function; this is a
 * deterministic rule-based implementation, not a fixture standing in for
 * a blocked provider — it needs no ASR/TTS/LLM vendor to run, so it is
 * not blocked by Module 1's halt gate. Its real-world recall against
 * actual telephony speech is exactly what A9.2's still-unresolved corpus
 * requirement would measure (see docs/adr/safety-classifier-verdict.md).
 */
export function classifySafety(callerUtterance: string): SafetyClassification {
  for (const pattern of EMERGENCY_PATTERNS) {
    if (pattern.test(callerUtterance)) {
      return { flagged: true, category: "emergency" };
    }
  }
  for (const pattern of CLINICAL_PATTERNS) {
    if (pattern.test(callerUtterance)) {
      return { flagged: true, category: "clinical" };
    }
  }
  return { flagged: false, category: null };
}
