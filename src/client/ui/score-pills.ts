/**
 * score-pills.ts
 *
 * The live score block shown under a quiz progress bar: Correct / Revealed /
 * Missed / Left as coloured pills. Shared by table mode and conjugation mode so
 * both read identically.
 *
 * Pair it with a three-segment bar — green `.bar`, yellow `.bar-revealed`,
 * red `.bar-missed` — laid out end to end by the caller.
 */

export interface ScoreCounts {
  correct:  number;
  revealed: number;
  missed:   number;
  left:     number;
  total:    number;
}

export function buildScorePills({ correct, revealed, missed, left, total }: ScoreCounts): string {
  if (total <= 0) return '';
  return (
    `<span class="score-pill score-correct">✓ ${correct} Correct</span>` +
    `<span class="score-pill score-revealed">👁 ${revealed} Revealed</span>` +
    `<span class="score-pill score-missed">✗ ${missed} Missed</span>` +
    `<span class="score-pill score-left">${left} Left</span>`
  );
}

/** Percentage of `total`, rounded to two decimals for tidy style attributes. */
export function scorePct(n: number, total: number): number {
  return total > 0 ? Math.round((n / total) * 10000) / 100 : 0;
}
