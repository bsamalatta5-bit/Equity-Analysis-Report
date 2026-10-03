#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { corpusManifestSchema, assertMeetsA11SampleSize } from "./corpus";
import { hypothesisTranscriptSchema, computeProviderWerResults, determineVerdict, renderWerComparisonTable } from "./report";
import { listenerRatingSchema, summarizeVoiceRatings } from "./rating";
import { renderVoiceRatingTable } from "./report";

interface CliArgs {
  readonly corpusPath: string;
  readonly hypothesesPath: string | undefined;
  readonly ratingsPath: string | undefined;
  readonly outPath: string | undefined;
}

function parseArgs(argv: readonly string[]): CliArgs {
  const get = (flag: string): string | undefined => {
    const index = argv.indexOf(flag);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const corpusPath = get("--corpus");
  if (!corpusPath) {
    throw new Error("Usage: run-benchmark --corpus <manifest.json> [--hypotheses <file.json>] [--ratings <file.json>] [--out <report.md>]");
  }
  return {
    corpusPath,
    hypothesesPath: get("--hypotheses"),
    ratingsPath: get("--ratings"),
    outPath: get("--out"),
  };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  const manifest = corpusManifestSchema.parse(JSON.parse(readFileSync(args.corpusPath, "utf-8")));
  assertMeetsA11SampleSize(manifest);

  const sections: string[] = [`# Dialect feasibility probe report\n\nCorpus: ${manifest.corpusName} (${manifest.utterances.length} utterances, synthetic placeholder: ${manifest.isSyntheticPlaceholder})\n`];

  let werResults: ReturnType<typeof computeProviderWerResults> = [];
  if (args.hypothesesPath) {
    const raw = JSON.parse(readFileSync(args.hypothesesPath, "utf-8"));
    const hypotheses = raw.map((entry: unknown) => hypothesisTranscriptSchema.parse(entry));
    werResults = computeProviderWerResults(manifest, hypotheses);
    sections.push("## A1.2: word error rate comparison\n\n" + renderWerComparisonTable(werResults) + "\n");
  }

  if (args.ratingsPath) {
    const raw = JSON.parse(readFileSync(args.ratingsPath, "utf-8"));
    const ratings = raw.map((entry: unknown) => listenerRatingSchema.parse(entry));
    const summaries = summarizeVoiceRatings(ratings, { enforceListenerCount: !manifest.isSyntheticPlaceholder });
    sections.push("## A1.3: accent authenticity ratings\n\n" + renderVoiceRatingTable(summaries) + "\n");
  }

  const verdict = determineVerdict(manifest, werResults);
  sections.push(
    "## A1.4: verdict\n\n" +
      (verdict.status === "NOT_EVALUATED"
        ? `**NOT_EVALUATED** — ${verdict.reason}`
        : `**${verdict.status}** — best provider "${verdict.bestProvider}" at ${(verdict.meanWer * 100).toFixed(2)}% WER (threshold: 15%).`),
  );

  const report = sections.join("\n\n");
  // eslint-disable-next-line no-console -- CLI tool output, not application logging
  console.log(report);
  if (args.outPath) {
    writeFileSync(args.outPath, report, "utf-8");
  }

  if (verdict.status === "FAIL") {
    // eslint-disable-next-line no-console -- CLI tool output
    console.error("\nA1.4 halt gate: no provider met the 15% WER threshold. Build halted per Section 9.");
    process.exitCode = 1;
  }
}

main();
