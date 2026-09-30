/**
 * merged-pool.ts — the "Words: N" pool when several languages are combined.
 *
 * The count is over the *combined* frequency order, not a share per language: the pool is every
 * chosen language's words (after the Part of Speech filter) merged by rank, lowest first, and the
 * first N of that. So the next word in is always the most frequent one left in any of the languages —
 * "Top 300 verbs" across Spanish, Portuguese and French is the 300 most frequent of the three together,
 * however unevenly they fall. (Splitting N evenly gave each language its own top N/3, which skipped
 * frequent words in one language while including rarer ones in another.)
 */

import type { Word } from '../types.ts';

/** A word's rank for ordering; unranked words sort last, as in ensureLoaded(). */
const rankOf = (w: Word): number => w.rank ?? 9999;

/**
 * `pools` is one array per language, each already tagged with `.language` and sorted by rank.
 * `selectedPos` empty means no Part of Speech filter (a word with no `pos` always passes one).
 * Ties keep the languages' order, so the primary language wins a tie.
 */
export function mergedSizedSlice(pools: Word[][], size: number, isMax: boolean, selectedPos: string[]): Word[] {
  const passes = (w: Word): boolean => selectedPos.length === 0 || w.pos == null || selectedPos.includes(w.pos);
  const merged = pools.flatMap(pool => pool.filter(passes));
  merged.sort((a, b) => rankOf(a) - rankOf(b));          // Array.prototype.sort is stable
  return isMax ? merged : merged.slice(0, size);
}
