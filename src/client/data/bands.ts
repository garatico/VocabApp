/**
 * bands.ts — the CEFR levels, in one place.
 *
 * Matches the cutoffs `bandFromRank` (src/server/lib/vocab-loader.ts) stamps
 * onto every word's `frequency.band` server-side. Single source so the list
 * of levels can't drift between the places that render a band chip row
 * (My Lists' filter, the main controls bar's Level pool selector).
 */
export const BANDS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;

export type Band = (typeof BANDS)[number];
