import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { evaluateClassifier, determineSafetyVerdict } from "./safety-classifier-evaluation";
import { assertMeetsA92SampleSize, safetyCorpusManifestSchema, type SafetyCase } from "./safety-corpus";

const CORPUS_PATH = join(
  __dirname,
  "../../../../tests/voice/corpora/emergency-clinical.synthetic-example.json",
);

function loadCorpus() {
  return safetyCorpusManifestSchema.parse(JSON.parse(readFileSync(CORPUS_PATH, "utf-8")));
}

describe("evaluateClassifier", () => {
  it("computes recall and false-positive rate from labeled cases", () => {
    const cases: SafetyCase[] = [
      { id: "1", text: "chest pain", language: "en", label: "positive" },
      { id: "2", text: "I'd like to book an appointment", language: "en", label: "positive" }, // false negative
      { id: "3", text: "what are your hours", language: "en", label: "negative" },
      { id: "4", text: "chest pain", language: "en", label: "negative" }, // false positive (mislabeled on purpose)
    ];
    const metrics = evaluateClassifier(cases);
    expect(metrics.truePositives).toBe(1);
    expect(metrics.falseNegatives).toBe(1);
    expect(metrics.trueNegatives).toBe(1);
    expect(metrics.falsePositives).toBe(1);
    expect(metrics.recall).toBeCloseTo(0.5);
    expect(metrics.falsePositiveRate).toBeCloseTo(0.5);
  });

  it("the repository's own synthetic placeholder corpus loads and every case is classified consistently with its label", () => {
    const manifest = loadCorpus();
    expect(manifest.isSyntheticPlaceholder).toBe(true);
    const metrics = evaluateClassifier(manifest.cases);
    // Not an A9.2 claim (see determineSafetyVerdict below) — just proving the
    // classifier and this small hand-picked placeholder set agree with each
    // other, i.e. the harness itself is wired correctly.
    expect(metrics.recall).toBe(1);
    expect(metrics.falsePositiveRate).toBe(0);
  });
});

describe("determineSafetyVerdict (A9.2)", () => {
  it("never returns PASS or FAIL for a manifest marked isSyntheticPlaceholder, however good its metrics look", () => {
    const manifest = loadCorpus();
    const metrics = evaluateClassifier(manifest.cases);
    const verdict = determineSafetyVerdict(manifest, metrics);
    expect(verdict.status).toBe("NOT_EVALUATED");
  });

  it("would return PASS for a non-placeholder manifest meeting both thresholds", () => {
    const verdict = determineSafetyVerdict(
      {
        corpusName: "hypothetical-real-corpus",
        isSyntheticPlaceholder: false,
        cases: [{ id: "1", text: "x", language: "en", label: "positive" }],
      },
      {
        truePositives: 1,
        falseNegatives: 0,
        trueNegatives: 1,
        falsePositives: 0,
        recall: 1,
        falsePositiveRate: 0,
      },
    );
    expect(verdict.status).toBe("PASS");
  });

  it("would return FAIL when recall falls below the threshold on a non-placeholder manifest", () => {
    const verdict = determineSafetyVerdict(
      {
        corpusName: "hypothetical-real-corpus",
        isSyntheticPlaceholder: false,
        cases: [{ id: "1", text: "x", language: "en", label: "positive" }],
      },
      {
        truePositives: 90,
        falseNegatives: 10,
        trueNegatives: 100,
        falsePositives: 0,
        recall: 0.9,
        falsePositiveRate: 0,
      },
    );
    expect(verdict.status).toBe("FAIL");
  });
});

describe("assertMeetsA92SampleSize", () => {
  it("does not throw for a manifest marked isSyntheticPlaceholder regardless of size", () => {
    expect(() => assertMeetsA92SampleSize(loadCorpus())).not.toThrow();
  });

  it("throws for a non-placeholder manifest below the 200/400 case requirement", () => {
    expect(() =>
      assertMeetsA92SampleSize({
        corpusName: "too-small",
        isSyntheticPlaceholder: false,
        cases: [{ id: "1", text: "x", language: "en", label: "positive" }],
      }),
    ).toThrow(/A9.2 requires 200/);
  });
});
