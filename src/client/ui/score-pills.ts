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

/**
 * The progress bar's own text label — "N / M · P%" (completion) while still
 * in progress. Once complete, a bare completion percentage is always 100
 * and says nothing a learner doesn't already know from the full bar, so it
 * switches to either "N / M · X% correct" (default) or, with the Settings
 * breakdown option on, "N / M · X% correct, Y% revealed, Z% missed" (a
 * category with nothing in it is omitted) — shared by Table's Standard and
 * Recall/Double Recall styles so the two can't quietly disagree about what
 * "done" looks like. Replaces this app's old separate end-of-quiz summary
 * chip, which existed solely to say the same "100%" the bar already showed.
 */
export function buildProgressStatsText(
  { correct, revealed, missed, answered, total }: {
    correct: number; revealed: number; missed: number; answered: number; total: number;
  },
  breakdown: boolean,
): string {
  if (total <= 0) return '';
  if (answered < total) {
    const donePct = Math.round((answered / total) * 100);
    return `${answered} / ${total}  ·  ${donePct}%`;
  }
  const pct = (n: number): number => Math.round((n / total) * 100);
  if (!breakdown) return `${answered} / ${total}  ·  ${pct(correct)}% correct`;
  const parts = [`${pct(correct)}% correct`];
  if (revealed > 0) parts.push(`${pct(revealed)}% revealed`);
  if (missed > 0) parts.push(`${pct(missed)}% missed`);
  return `${answered} / ${total}  ·  ${parts.join(', ')}`;
}
