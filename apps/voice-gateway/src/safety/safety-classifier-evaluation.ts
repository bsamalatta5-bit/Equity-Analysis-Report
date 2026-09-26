import { THRESHOLDS } from "@voice-receptionist/shared";
import { classifySafety } from "./safety-classifier";
import type { SafetyCase, SafetyCorpusManifest } from "./safety-corpus";

export interface ClassifierMetrics {
  readonly truePositives: number;
  readonly falseNegatives: number;
  readonly trueNegatives: number;
  readonly falsePositives: number;
  readonly recall: number;
  readonly falsePositiveRate: number;
}

export function evaluateClassifier(cases: readonly SafetyCase[]): ClassifierMetrics {
  let truePositives = 0;
  let falseNegatives = 0;
  let trueNegatives = 0;
  let falsePositives = 0;

  for (const testCase of cases) {
    const { flagged } = classifySafety(testCase.text);
    if (testCase.label === "positive") {
      if (flagged) truePositives++;
      else falseNegatives++;
    } else {
      if (flagged) falsePositives++;
      else trueNegatives++;
    }
  }

  const positiveCount = truePositives + falseNegatives;
  const negativeCount = falsePositives + trueNegatives;
  return {
    truePositives,
    falseNegatives,
    trueNegatives,
    falsePositives,
    recall: positiveCount > 0 ? truePositives / positiveCount : 0,
    falsePositiveRate: negativeCount > 0 ? falsePositives / negativeCount : 0,
  };
}

export type SafetyVerdict =
  | { readonly status: "PASS"; readonly recall: number; readonly falsePositiveRate: number }
  | { readonly status: "FAIL"; readonly recall: number; readonly falsePositiveRate: number }
  | { readonly status: "NOT_EVALUATED"; readonly reason: string };

/**
 * A9.2: "Both values are measured per build and recorded. A build below the
 * recall threshold fails." A verdict computed from a manifest marked
 * `isSyntheticPlaceholder` is never PASS or FAIL — those numbers describe
 * fixture data, not real recorded/transcribed calls, and reporting them as
 * if they answered A9.2 would be fabricating this gate's outcome, exactly
 * as tools/dialect-feasibility-probe/src/report.ts's determineVerdict()
 * refuses to for Module 1.
 */
export function determineSafetyVerdict(
  manifest: SafetyCorpusManifest,
  metrics: ClassifierMetrics,
): SafetyVerdict {
  if (manifest.isSyntheticPlaceholder) {
    return {
      status: "NOT_EVALUATED",
      reason:
        `Corpus "${manifest.corpusName}" is a synthetic placeholder (isSyntheticPlaceholder: true). ` +
        "A9.2's real corpus (200 labeled emergency/clinical cases, 400 labeled non-emergency cases, " +
        "drawn from real or realistically simulated calls) has not been supplied. See " +
        "docs/adr/safety-classifier-verdict.md.",
    };
  }
  const meetsRecall = metrics.recall >= THRESHOLDS.SAFETY_CLASSIFIER_RECALL_MIN;
  const meetsFalsePositiveRate = metrics.falsePositiveRate <= THRESHOLDS.SAFETY_CLASSIFIER_FALSE_POSITIVE_MAX;
  return meetsRecall && meetsFalsePositiveRate
    ? { status: "PASS", recall: metrics.recall, falsePositiveRate: metrics.falsePositiveRate }
    : { status: "FAIL", recall: metrics.recall, falsePositiveRate: metrics.falsePositiveRate };
}
