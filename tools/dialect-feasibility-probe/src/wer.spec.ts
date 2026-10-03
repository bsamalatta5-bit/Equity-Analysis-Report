import { describe, expect, it } from "vitest";
import { computeWer } from "./wer";

describe("computeWer", () => {
  it("is zero for an identical transcript", () => {
    const result = computeWer("hello there friend", "hello there friend");
    expect(result.wer).toBe(0);
    expect(result.substitutions).toBe(0);
    expect(result.deletions).toBe(0);
    expect(result.insertions).toBe(0);
  });

  it("counts a single substitution", () => {
    const result = computeWer("the cat sat", "the dog sat");
    expect(result.substitutions).toBe(1);
    expect(result.deletions).toBe(0);
    expect(result.insertions).toBe(0);
    expect(result.wer).toBeCloseTo(1 / 3);
  });

  it("counts a single deletion", () => {
    const result = computeWer("the cat sat down", "the cat down");
    expect(result.deletions).toBe(1);
    expect(result.wer).toBeCloseTo(1 / 4);
  });

  it("counts a single insertion", () => {
    const result = computeWer("the cat sat", "the fluffy cat sat");
    expect(result.insertions).toBe(1);
    expect(result.wer).toBeCloseTo(1 / 3);
  });

  it("is case-insensitive and whitespace-normalized", () => {
    const result = computeWer("Hello   There", "hello there");
    expect(result.wer).toBe(0);
  });

  it("is 100% when the hypothesis is empty but reference is not", () => {
    const result = computeWer("hello there", "");
    expect(result.wer).toBe(1);
  });

  it("is 0% when both are empty", () => {
    const result = computeWer("", "");
    expect(result.wer).toBe(0);
  });

  it("handles a completely different hypothesis of equal length as all substitutions", () => {
    const result = computeWer("one two three", "four five six");
    expect(result.substitutions).toBe(3);
    expect(result.wer).toBe(1);
  });
});
