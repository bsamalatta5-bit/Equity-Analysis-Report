import { z } from "zod";

/**
 * A9.2/A9.6: the manifest format for the real labeled corpora that belong
 * under tests/voice/corpora/ — 200 positive (emergency-or-clinical) cases
 * and 400 negative (ordinary, non-emergency) cases, versioned and reviewed
 * on every classifier change. The two *.synthetic-example.json files next
 * to this schema are small, clearly-labeled placeholders for exercising
 * this tooling, not the real corpus — see
 * docs/adr/safety-classifier-verdict.md.
 */
export const safetyLabelSchema = z.enum(["positive", "negative"]);
export type SafetyLabel = z.infer<typeof safetyLabelSchema>;

export const safetyCaseSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  language: z.enum(["ar", "en"]),
  label: safetyLabelSchema,
});
export type SafetyCase = z.infer<typeof safetyCaseSchema>;

export const safetyCorpusManifestSchema = z.object({
  corpusName: z.string().min(1),
  isSyntheticPlaceholder: z.boolean(),
  cases: z.array(safetyCaseSchema).min(1),
});
export type SafetyCorpusManifest = z.infer<typeof safetyCorpusManifestSchema>;

export function assertMeetsA92SampleSize(manifest: SafetyCorpusManifest): void {
  if (manifest.isSyntheticPlaceholder) {
    return; // A9.2's 200/400-case requirement applies to the real corpus, not tooling fixtures.
  }
  const positives = manifest.cases.filter((c) => c.label === "positive").length;
  const negatives = manifest.cases.filter((c) => c.label === "negative").length;
  if (positives < 200) {
    throw new Error(
      `A9.2 requires 200 positive (emergency/clinical) cases; "${manifest.corpusName}" has ${positives}.`,
    );
  }
  if (negatives < 400) {
    throw new Error(
      `A9.2 requires 400 negative (non-emergency) cases; "${manifest.corpusName}" has ${negatives}.`,
    );
  }
}

/**
 * A9.6: the 50-prompt adversarial set proving no assistant output contains
 * diagnostic or treatment content. Deliberately a separate, smaller schema
 * from the recall/FPR corpus above — these prompts aren't labeled
 * positive/negative, they are inputs the whole pipeline is run against,
 * with the assertion made on the *output* (see
 * clinical-content-guard.spec.ts and the adversarial integration test).
 */
export const adversarialPromptSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  language: z.enum(["ar", "en"]),
});
export type AdversarialPrompt = z.infer<typeof adversarialPromptSchema>;

export const adversarialPromptSetSchema = z.object({
  corpusName: z.string().min(1),
  isSyntheticPlaceholder: z.boolean(),
  prompts: z.array(adversarialPromptSchema).min(1),
});
export type AdversarialPromptSet = z.infer<typeof adversarialPromptSetSchema>;

export function assertMeetsA94SampleSize(manifest: AdversarialPromptSet): void {
  if (manifest.isSyntheticPlaceholder) {
    return; // A9.4's 50-prompt requirement applies to the real set, not tooling fixtures.
  }
  if (manifest.prompts.length < 50) {
    throw new Error(
      `A9.4 requires 50 adversarial prompts; "${manifest.corpusName}" has ${manifest.prompts.length}.`,
    );
  }
}
