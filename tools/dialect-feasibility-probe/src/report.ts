import { z } from "zod";
import type { CorpusManifest } from "./corpus";
import { computeWer } from "./wer";
import type { VoiceRatingSummary } from "./rating";

export const hypothesisTranscriptSchema = z.object({
  utteranceId: z.string().min(1),
  providerName: z.string().min(1),
  hypothesisText: z.string(),
});
export type HypothesisTranscript = z.infer<typeof hypothesisTranscriptSchema>;

export interface ProviderWerResult {
  readonly providerName: string;
  readonly utteranceCount: number;
  readonly meanWer: number;
}

const DIALECT_WER_MAX = 0.15; // THRESHOLDS.DIALECT_WER_MAX (packages/shared) — duplicated here so this
// standalone tool (Module 1 runs before any production code, per Section 9's build order) has no
// dependency on the production workspace it is gating.

export function computeProviderWerResults(
  manifest: CorpusManifest,
  hypotheses: readonly HypothesisTranscript[],
): ProviderWerResult[] {
  const referenceById = new Map(manifest.utterances.map((u) => [u.id, u.referenceTranscript]));
  const byProvider = new Map<string, HypothesisTranscript[]>();
  for (const h of hypotheses) {
    const existing = byProvider.get(h.providerName) ?? [];
    existing.push(h);
    byProvider.set(h.providerName, existing);
  }

  const results: ProviderWerResult[] = [];
  for (const [providerName, entries] of byProvider) {
    const wers = entries
      .filter((entry) => referenceById.has(entry.utteranceId))
      .map((entry) => computeWer(referenceById.get(entry.utteranceId)!, entry.hypothesisText).wer);
    if (wers.length === 0) continue;
    const meanWer = wers.reduce((sum, w) => sum + w, 0) / wers.length;
    results.push({ providerName, utteranceCount: wers.length, meanWer });
  }

  return results.sort((a, b) => a.meanWer - b.meanWer);
}

export type Verdict =
  | { readonly status: "PASS"; readonly bestProvider: string; readonly meanWer: number }
  | { readonly status: "FAIL"; readonly bestProvider: string; readonly meanWer: number }
  | { readonly status: "NOT_EVALUATED"; readonly reason: string };

/**
 * A1.4: "A written verdict records whether any provider meets a word error
 * rate at or below 15%. A negative verdict halts the build and returns the
 * architecture for revision." A verdict computed from a manifest marked
 * `isSyntheticPlaceholder` is never PASS or FAIL — those numbers describe
 * fixture data, not real speech, and reporting them as if they answered
 * A1.4 would be fabricating the halt-gate's outcome.
 */
export function determineVerdict(manifest: CorpusManifest, results: readonly ProviderWerResult[]): Verdict {
  if (manifest.isSyntheticPlaceholder) {
    return {
      status: "NOT_EVALUATED",
      reason:
        `Corpus "${manifest.corpusName}" is a synthetic placeholder (isSyntheticPlaceholder: true). ` +
        "A1.1's real corpus (500 telephony-band utterances, human-transcribed, Najdi and Hijazi, mixed " +
        "gender and age) has not been supplied. See docs/adr/dialect-feasibility-verdict.md.",
    };
  }
  if (results.length === 0) {
    return { status: "NOT_EVALUATED", reason: "No provider hypothesis transcripts were supplied." };
  }
  const best = results[0]!;
  return best.meanWer <= DIALECT_WER_MAX
    ? { status: "PASS", bestProvider: best.providerName, meanWer: best.meanWer }
    : { status: "FAIL", bestProvider: best.providerName, meanWer: best.meanWer };
}

export function renderWerComparisonTable(results: readonly ProviderWerResult[]): string {
  const header = "| Provider | Utterances scored | Mean WER | Meets ≤15% (A1.4) |\n|---|---|---|---|";
  const rows = results.map(
    (r) =>
      `| ${r.providerName} | ${r.utteranceCount} | ${(r.meanWer * 100).toFixed(2)}% | ${
        r.meanWer <= DIALECT_WER_MAX ? "yes" : "no"
      } |`,
  );
  return [header, ...rows].join("\n");
}

export function renderVoiceRatingTable(summaries: readonly VoiceRatingSummary[]): string {
  const header = "| Voice | Listeners | Mean authenticity (1-5) |\n|---|---|---|";
  const rows = summaries.map((s) => `| ${s.voiceId} | ${s.listenerCount} | ${s.meanScore.toFixed(2)} |`);
  return [header, ...rows].join("\n");
}
