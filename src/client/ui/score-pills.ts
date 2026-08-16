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
  // Each pill carries a solid swatch in its own colour. The pill text and
  // border were already tinted, but at pill size that reads as four similar
  // outlines; the filled square is what makes "this is the green one" legible
  // at a glance, and it is the same green as its segment of the bar above.
  const sw = '<i class="score-swatch" aria-hidden="true"></i>';
  return (
    `<span class="score-pill score-correct">${sw}✓ ${correct} Correct</span>` +
    `<span class="score-pill score-revealed">${sw}👁 ${revealed} Revealed</span>` +
    `<span class="score-pill score-missed">${sw}✗ ${missed} Missed</span>` +
    `<span class="score-pill score-left">${sw}${left} Left</span>`
  );
}

/** Percentage of `total`, rounded to two decimals for tidy style attributes. */
export function scorePct(n: number, total: number): number {
  return total > 0 ? Math.round((n / total) * 10000) / 100 : 0;
}
