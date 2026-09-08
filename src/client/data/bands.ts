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

/**
 * Same cutoffs as the server's BAND_CUTOFFS (src/server/lib/data-requirements.ts)
 * — duplicated rather than imported, since that file lives on the other side
 * of the client/server split CLAUDE.md documents, and this is a much smaller
 * fact than the schema/producer statements that file is about keeping
 * independent. Used only for My Content's own "pick a CEFR level" convenience
 * when setting a custom word's frequency rank — not for computing
 * `Word.frequency.band` itself, which stays server-only and authoritative.
 */
const CLIENT_BAND_CUTOFFS: ReadonlyArray<readonly [Band, number]> = [
  ['A1',  500],
  ['A2', 1500],
  ['B1', 3000],
  ['B2', 5000],
  ['C1', 7000],
];

/** A representative rank inside `band`'s range — the midpoint between it and
 *  the previous cutoff, or a round number past C1 for C2 (which has no
 *  upper bound). Only ever used to *seed* a rank number a learner can still
 *  fine-tune afterward, never stored or compared against directly. */
export function representativeRankForBand(band: Band): number {
  const idx = CLIENT_BAND_CUTOFFS.findIndex(([b]) => b === band);
  if (idx === -1) return 8500; // C2
  const prevMax = idx === 0 ? 0 : CLIENT_BAND_CUTOFFS[idx - 1][1];
  const [, max] = CLIENT_BAND_CUTOFFS[idx];
  return Math.round((prevMax + max) / 2);
}

/** The band a rank falls into, for a "~B1" style hint next to a rank input —
 *  display only, same reasoning as representativeRankForBand above. */
export function bandForRank(rank: number | null): Band | null {
  if (rank == null) return null;
  for (const [band, max] of CLIENT_BAND_CUTOFFS) if (rank <= max) return band;
  return 'C2';
}
