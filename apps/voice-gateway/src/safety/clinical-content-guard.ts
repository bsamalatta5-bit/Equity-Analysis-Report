/**
 * A9.4: a second, structural line of defense on the one output path that
 * isn't a fixed template string this codebase wrote itself — grounded
 * knowledge-base answers (dialogue-state-machine.ts's answerQuestion).
 * Every other assistant utterance in the FSM is a literal string in this
 * repository, already guaranteed clinical-content-free by inspection; this
 * guard exists for the one path where the text comes from a tenant-authored
 * KnowledgeItem plus LanguageModelProvider.draftGroundedResponse, neither of
 * which this codebase controls the contents of.
 */
const CLINICAL_OUTPUT_PATTERNS: readonly RegExp[] = [
  /you (have|might have|likely have|probably have) (cancer|diabetes|a tumor|an infection|a stroke)/i,
  /take \d+\s?(mg|milligrams|mL)/i,
  /the diagnosis is/i,
  /i diagnose/i,
  /you should take (\w+\s){0,3}(medication|medicine|pills|antibiotics)/i,
  /recommended (dose|dosage)/i,
  /يعاني من (سرطان|السكري|عدوى)/,
  /تناول \d+\s?(مجم|ملغم)/,
  /التشخيص هو/,
  /الجرعة الموصى بها/,
];

export function containsClinicalContent(text: string): boolean {
  return CLINICAL_OUTPUT_PATTERNS.some((pattern) => pattern.test(text));
}
