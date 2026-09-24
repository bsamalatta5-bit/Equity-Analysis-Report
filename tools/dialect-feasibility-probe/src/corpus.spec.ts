import { describe, expect, it } from "vitest";
import { assertMeetsA11SampleSize, type CorpusManifest, type Utterance } from "./corpus";

function makeUtterance(overrides: Partial<Utterance>): Utterance {
  return {
    id: "u",
    dialect: "najdi",
    speakerGender: "female",
    speakerAgeBracket: "30-44",
    audioPath: "x.wav",
    referenceTranscript: "text",
    ...overrides,
  };
}

describe("assertMeetsA11SampleSize", () => {
  it("does not throw for a synthetic placeholder regardless of size", () => {
    const manifest: CorpusManifest = {
      corpusName: "fixture",
      isSyntheticPlaceholder: true,
      utterances: [makeUtterance({})],
    };
    expect(() => assertMeetsA11SampleSize(manifest)).not.toThrow();
  });

  it("throws for a real corpus with fewer than 500 utterances", () => {
    const manifest: CorpusManifest = {
      corpusName: "real-but-small",
      isSyntheticPlaceholder: false,
      utterances: Array.from({ length: 10 }, (_, i) => makeUtterance({ id: `u${i}` })),
    };
    expect(() => assertMeetsA11SampleSize(manifest)).toThrow(/500/);
  });

  it("throws for a real corpus missing one of the two dialects", () => {
    const utterances = Array.from({ length: 500 }, (_, i) =>
      makeUtterance({ id: `u${i}`, dialect: "najdi", speakerGender: i % 2 === 0 ? "male" : "female" }),
    );
    const manifest: CorpusManifest = { corpusName: "one-dialect", isSyntheticPlaceholder: false, utterances };
    expect(() => assertMeetsA11SampleSize(manifest)).toThrow(/Najdi and Hijazi/);
  });

  it("passes for a real corpus meeting every A1.1 requirement", () => {
    const utterances = Array.from({ length: 500 }, (_, i) =>
      makeUtterance({
        id: `u${i}`,
        dialect: i % 2 === 0 ? "najdi" : "hijazi",
        speakerGender: i % 2 === 0 ? "male" : "female",
        speakerAgeBracket: i % 4 === 0 ? "18-29" : "45-59",
      }),
    );
    const manifest: CorpusManifest = { corpusName: "complete", isSyntheticPlaceholder: false, utterances };
    expect(() => assertMeetsA11SampleSize(manifest)).not.toThrow();
  });
});
