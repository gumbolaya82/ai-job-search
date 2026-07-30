/**
 * Subsequence fuzzy match, for the ⌘K palette and nothing else.
 *
 * Pure and dependency-free: "sfe" should reach "Senior Frontend Engineer", and
 * a contiguous run or a word-start hit should outrank a scattered one, which is
 * the whole difference between a palette that feels sharp and one that feels
 * random. Returns null when the needle is not a subsequence at all.
 */

export function fuzzyScore(haystack: string, needle: string): number | null {
  if (!needle) return 0;
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();

  let score = 0;
  let hi = 0;
  let previousHit = -2;

  for (const ch of n) {
    const at = h.indexOf(ch, hi);
    if (at === -1) return null;
    // Adjacent characters are worth far more than scattered ones, and a match at
    // a word boundary is worth more than one buried mid-word.
    if (at === previousHit + 1) score += 6;
    else if (at === 0 || /[\s/\-_.·]/.test(h[at - 1])) score += 4;
    else score += 1;
    previousHit = at;
    hi = at + 1;
  }

  // Shorter haystacks win ties: "Jobs" should beat "Job postings archive".
  return score - h.length * 0.01;
}

export function fuzzyMatches(haystack: string, needle: string): boolean {
  return fuzzyScore(haystack, needle) !== null;
}

/** Rank `items` by their best-scoring searchable text, dropping non-matches. */
export function fuzzyRank<T>(
  items: T[],
  needle: string,
  text: (item: T) => string,
  limit = 8,
): T[] {
  if (!needle.trim()) return items.slice(0, limit);
  const scored: { item: T; score: number }[] = [];
  for (const item of items) {
    const score = fuzzyScore(text(item), needle.trim());
    if (score !== null) scored.push({ item, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.item);
}
