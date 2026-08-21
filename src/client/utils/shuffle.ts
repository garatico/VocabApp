/**
 * shuffle.ts — Fisher–Yates, once.
 *
 * The same six lines existed five times over: `shuffle` in picture mode,
 * `fisherYates` in the quiz controls and again inside the Quiz class, and
 * inline loops in the start handler and in session-history's word ordering.
 * They agreed, but only because nobody had touched one of them yet.
 *
 * Deliberately unseeded. A fresh order every session is the point — a stable
 * one teaches positions instead of words.
 */

/** A new array holding the same items in random order. Input is not mutated. */
export function shuffle<T>(items: readonly T[]): T[] {
  const out = [...items];
  shuffleInPlace(out);
  return out;
}

/**
 * Shuffle an array you already own.
 *
 * For callers that have just built a working copy and would otherwise pay for
 * a second one — `orderWords` and the pagination deck builder both do.
 */
export function shuffleInPlace<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]] as [T, T];
  }
  return items;
}

/** A shuffled `[0, 1, … length-1]`. Handy for shuffling indices, not items. */
export function shuffledIndices(length: number): number[] {
  return shuffleInPlace(Array.from({ length }, (_, i) => i));
}
