import { describe, expect, it } from "vitest";
import { computeHashingEmbedding, cosineSimilarity, toVectorLiteral } from "./hashing-embedder";

describe("computeHashingEmbedding", () => {
  it("is deterministic for the same text", () => {
    const a = computeHashingEmbedding("What are your opening hours?");
    const b = computeHashingEmbedding("What are your opening hours?");
    expect(a).toEqual(b);
  });

  it("produces a unit-length (L2-normalized) vector of 1536 dimensions", () => {
    const vector = computeHashingEmbedding("hello world");
    expect(vector).toHaveLength(1536);
    const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    expect(norm).toBeCloseTo(1, 5);
  });

  it("returns an all-zero vector for empty text, without dividing by zero", () => {
    const vector = computeHashingEmbedding("");
    expect(vector.every((v) => v === 0)).toBe(true);
  });

  it("scores near-identical questions with much higher cosine similarity than unrelated ones", () => {
    const hours = computeHashingEmbedding("What are your opening hours?");
    const hoursParaphrase = computeHashingEmbedding("What are your hours of operation?");
    const unrelated = computeHashingEmbedding("Do you accept walk-in appointments without booking?");

    const similarityToParaphrase = cosineSimilarity(hours, hoursParaphrase);
    const similarityToUnrelated = cosineSimilarity(hours, unrelated);

    expect(similarityToParaphrase).toBeGreaterThan(similarityToUnrelated);
  });

  it("tokenizes Arabic text (word-overlap similarity, not byte similarity)", () => {
    const a = computeHashingEmbedding("متى ساعات العمل لديكم؟");
    const b = computeHashingEmbedding("ما هي ساعات العمل؟");
    const unrelated = computeHashingEmbedding("هل يمكنني الدفع عند الوصول؟");
    expect(cosineSimilarity(a, b)).toBeGreaterThan(cosineSimilarity(a, unrelated));
  });
});

describe("toVectorLiteral", () => {
  it("formats a vector as pgvector's text input syntax", () => {
    expect(toVectorLiteral([1, 2.5, -3])).toBe("[1,2.5,-3]");
  });
});

describe("cosineSimilarity", () => {
  it("is 1 for identical vectors and 0 for a zero vector", () => {
    const v = computeHashingEmbedding("test");
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 10);
    expect(cosineSimilarity(v, new Array(1536).fill(0))).toBe(0);
  });
});
