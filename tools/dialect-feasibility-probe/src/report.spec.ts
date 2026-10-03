import { describe, expect, it } from "vitest";
import type { CorpusManifest } from "./corpus";
import { computeProviderWerResults, determineVerdict } from "./report";

const manifest: CorpusManifest = {
  corpusName: "test-corpus",
  isSyntheticPlaceholder: true,
  utterances: [
    {
      id: "u1",
      dialect: "najdi",
      speakerGender: "female",
      speakerAgeBracket: "30-44",
      audioPath: "x.wav",
      referenceTranscript: "hello there friend",
    },
    {
      id: "u2",
      dialect: "hijazi",
      speakerGender: "male",
      speakerAgeBracket: "18-29",
      audioPath: "y.wav",
      referenceTranscript: "good morning everyone",
    },
  ],
};

describe("computeProviderWerResults", () => {
  it("computes mean WER per provider across the utterances it transcribed", () => {
    const results = computeProviderWerResults(manifest, [
      { utteranceId: "u1", providerName: "provider-a", hypothesisText: "hello there friend" },
      { utteranceId: "u2", providerName: "provider-a", hypothesisText: "good morning everyone" },
      { utteranceId: "u1", providerName: "provider-b", hypothesisText: "hello there enemy" },
      { utteranceId: "u2", providerName: "provider-b", hypothesisText: "good morning everyone" },
    ]);

    const a = results.find((r) => r.providerName === "provider-a")!;
    const b = results.find((r) => r.providerName === "provider-b")!;
    expect(a.meanWer).toBe(0);
    expect(b.meanWer).toBeGreaterThan(0);
    // Sorted best (lowest WER) first.
    expect(results[0]?.providerName).toBe("provider-a");
  });
});

describe("determineVerdict", () => {
  it("NEVER returns PASS or FAIL for a synthetic placeholder corpus, regardless of computed WER", () => {
    const perfectResults = [{ providerName: "provider-a", utteranceCount: 2, meanWer: 0 }];
    const verdict = determineVerdict(manifest, perfectResults);
    expect(verdict.status).toBe("NOT_EVALUATED");
  });

  it("returns PASS for a real corpus when the best provider is at or below 15% WER", () => {
    const realManifest: CorpusManifest = { ...manifest, isSyntheticPlaceholder: false };
    const verdict = determineVerdict(realManifest, [{ providerName: "provider-a", utteranceCount: 500, meanWer: 0.12 }]);
    expect(verdict.status).toBe("PASS");
  });

  it("returns FAIL for a real corpus when every provider exceeds 15% WER", () => {
    const realManifest: CorpusManifest = { ...manifest, isSyntheticPlaceholder: false };
    const verdict = determineVerdict(realManifest, [{ providerName: "provider-a", utteranceCount: 500, meanWer: 0.22 }]);
    expect(verdict.status).toBe("FAIL");
  });

  it("returns NOT_EVALUATED when there are no results at all", () => {
    const realManifest: CorpusManifest = { ...manifest, isSyntheticPlaceholder: false };
    const verdict = determineVerdict(realManifest, []);
    expect(verdict.status).toBe("NOT_EVALUATED");
  });
});
