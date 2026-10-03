import { z } from "zod";

/**
 * A1.1: "A corpus of 500 telephony-band utterances with human reference
 * transcripts is assembled across Najdi and Hijazi speakers, mixed gender
 * and age." This schema defines the manifest format that real corpus
 * belongs in; corpora/manifest.synthetic-example.json is a small,
 * clearly-labeled placeholder for exercising the tooling, NOT the real
 * corpus — see docs/adr/dialect-feasibility-verdict.md.
 */
export const dialectSchema = z.enum(["najdi", "hijazi"]);
export type Dialect = z.infer<typeof dialectSchema>;

export const genderSchema = z.enum(["male", "female"]);
export const ageBracketSchema = z.enum(["18-29", "30-44", "45-59", "60+"]);

export const utteranceSchema = z.object({
  id: z.string().min(1),
  dialect: dialectSchema,
  speakerGender: genderSchema,
  speakerAgeBracket: ageBracketSchema,
  /** Path (relative to the corpus manifest) to the telephony-band (8kHz) audio recording. */
  audioPath: z.string().min(1),
  referenceTranscript: z.string().min(1),
});
export type Utterance = z.infer<typeof utteranceSchema>;

export const corpusManifestSchema = z.object({
  corpusName: z.string().min(1),
  /** Explicit, mandatory: a real corpus must say so; a placeholder must say so too. Never left implicit. */
  isSyntheticPlaceholder: z.boolean(),
  utterances: z.array(utteranceSchema).min(1),
});
export type CorpusManifest = z.infer<typeof corpusManifestSchema>;

export function assertMeetsA11SampleSize(manifest: CorpusManifest): void {
  if (manifest.isSyntheticPlaceholder) {
    return; // A1.1's 500-utterance requirement applies to the real corpus, not tooling fixtures.
  }
  if (manifest.utterances.length < 500) {
    throw new Error(
      `A1.1 requires 500 utterances; "${manifest.corpusName}" has ${manifest.utterances.length}.`,
    );
  }
  const dialects = new Set(manifest.utterances.map((u) => u.dialect));
  if (!dialects.has("najdi") || !dialects.has("hijazi")) {
    throw new Error(`A1.1 requires both Najdi and Hijazi speakers; found: ${[...dialects].join(", ")}.`);
  }
  const genders = new Set(manifest.utterances.map((u) => u.speakerGender));
  if (genders.size < 2) {
    throw new Error("A1.1 requires mixed gender speakers.");
  }
  const ages = new Set(manifest.utterances.map((u) => u.speakerAgeBracket));
  if (ages.size < 2) {
    throw new Error("A1.1 requires mixed age speakers.");
  }
}
