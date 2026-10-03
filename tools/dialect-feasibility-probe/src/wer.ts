/**
 * Word Error Rate: WER = (substitutions + deletions + insertions) / |reference words|,
 * computed via the standard dynamic-programming edit distance over word
 * tokens (Levenshtein distance generalized to sequences of words rather
 * than characters). This is the metric A1.2/A1.4 are stated in terms of.
 */
export interface WerResult {
  readonly substitutions: number;
  readonly deletions: number;
  readonly insertions: number;
  readonly referenceWordCount: number;
  readonly wer: number;
}

function tokenize(text: string): string[] {
  return text
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token.length > 0);
}

export function computeWer(referenceText: string, hypothesisText: string): WerResult {
  const reference = tokenize(referenceText);
  const hypothesis = tokenize(hypothesisText);

  if (reference.length === 0) {
    return {
      substitutions: 0,
      deletions: 0,
      insertions: hypothesis.length,
      referenceWordCount: 0,
      wer: hypothesis.length > 0 ? 1 : 0,
    };
  }

  const rows = reference.length + 1;
  const cols = hypothesis.length + 1;
  // dp[i][j] = edit distance between reference[0..i) and hypothesis[0..j)
  const dp: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
  for (let i = 0; i < rows; i += 1) dp[i]![0] = i;
  for (let j = 0; j < cols; j += 1) dp[0]![j] = j;

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      if (reference[i - 1] === hypothesis[j - 1]) {
        dp[i]![j] = dp[i - 1]![j - 1]!;
      } else {
        dp[i]![j] = 1 + Math.min(dp[i - 1]![j - 1]!, dp[i]![j - 1]!, dp[i - 1]![j]!);
      }
    }
  }

  // Backtrack to classify operations (needed to report S/D/I separately, not just the total distance).
  let i = reference.length;
  let j = hypothesis.length;
  let substitutions = 0;
  let deletions = 0;
  let insertions = 0;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && reference[i - 1] === hypothesis[j - 1]) {
      i -= 1;
      j -= 1;
      continue;
    }
    const diagonal = i > 0 && j > 0 ? dp[i - 1]![j - 1]! : Number.POSITIVE_INFINITY;
    const up = i > 0 ? dp[i - 1]![j]! : Number.POSITIVE_INFINITY;
    const left = j > 0 ? dp[i]![j - 1]! : Number.POSITIVE_INFINITY;
    const best = Math.min(diagonal, up, left);

    if (best === diagonal && i > 0 && j > 0) {
      substitutions += 1;
      i -= 1;
      j -= 1;
    } else if (best === up && i > 0) {
      deletions += 1;
      i -= 1;
    } else {
      insertions += 1;
      j -= 1;
    }
  }

  const distance = dp[reference.length]![hypothesis.length]!;
  return {
    substitutions,
    deletions,
    insertions,
    referenceWordCount: reference.length,
    wer: distance / reference.length,
  };
}
