const EMBEDDING_DIMENSIONS = 1536;

/**
 * Stands in for a real text embedding model until Module 1's halt gate
 * clears (docs/adr/dialect-feasibility-verdict.md) — no real embedding
 * provider has been selected for the same reason no speech/NLU provider
 * has. Tokenizes text into lowercase Unicode word/number runs (so Arabic
 * and English both tokenize correctly), hashes each token into one of
 * KnowledgeItem.embedding's 1536 dimensions via FNV-1a, accumulates term
 * counts, and L2-normalizes the result. This is a legitimate bag-of-words
 * cosine-similarity space — matching vocabulary scores higher than
 * unrelated text — but it is not semantic: it cannot recognize synonyms
 * or paraphrase, only shared words. Sufficient to exercise pgvector's
 * ivfflat index and the A8.2 similarity threshold gate against a real
 * database; never intended to ship as the production embedder.
 */
export function computeHashingEmbedding(text: string): number[] {
  const vector = new Array(EMBEDDING_DIMENSIONS).fill(0) as number[];
  const words = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  for (const word of words) {
    const index = hashToIndex(word);
    vector[index] = vector[index]! + 1;
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (norm === 0) {
    return vector;
  }
  return vector.map((value) => value / norm);
}

function hashToIndex(word: string): number {
  let hash = 2166136261;
  for (let i = 0; i < word.length; i++) {
    hash ^= word.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % EMBEDDING_DIMENSIONS;
}

/** pgvector's text input format for a `vector(N)` column/parameter: `[v1,v2,...]`. */
export function toVectorLiteral(vector: readonly number[]): string {
  return `[${vector.join(",")}]`;
}

/** Pure cosine similarity, used only to unit-test computeHashingEmbedding — retrieval itself compares vectors via pgvector's `<=>` operator in SQL, not this function. */
export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  if (normA === 0 || normB === 0) {
    return 0;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
