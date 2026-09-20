/**
 * band.ts — CEFR band cutoffs and the one function that turns a rank into a
 * band name.
 *
 * The database has no band column: the pipeline used to write one and this
 * app never selected it, so it was a second copy of a derived value
 * maintained by hand across a project boundary, and the two disagreed for a
 * long time (500/1500/3000/5000/7000 here against 200/500/1000/2000/4000
 * there — see data-requirements.ts's own account of it). This is now the
 * single place a rank becomes a band, shared by the server (vocab-loader.ts,
 * admin/words.ts, admin/export.ts all re-export from here) and the Tauri
 * client, so there is nothing left to keep in step.
 */

export const BAND_CUTOFFS: ReadonlyArray<readonly [string, number]> = [
  ['A1', 500],
  ['A2', 1500],
  ['B1', 3000],
  ['B2', 5000],
  ['C1', 7000],
] as const;

export function bandFromRank(rank: number | null): string | null {
  if (rank == null) return null;
  for (const [band, max] of BAND_CUTOFFS) {
    if (rank <= max) return band;
  }
  return 'C2';
}
