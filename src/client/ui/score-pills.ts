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

/** Settings.getProgressBarPercentMode() — which percentage(s) the progress
 *  bar's own label shows once a quiz is fully answered. See
 *  buildProgressStatsHtml below. */
export type ProgressBarPercentMode = 'correct' | 'missed' | 'all';

/** One colored chip inside the progress bar's own label — not `.score-pill`
 *  (that's the row of pills under the bar; this needs to sit inline in a
 *  single-line label, so its own smaller, borderless shape). */
type ProgressPctKind = 'correct' | 'revealed' | 'missed' | 'hinted-correct' | 'hinted-revealed' | 'hinted-missed';
function progressPctChip(kind: ProgressPctKind, pct: number, label: string): string {
  return `<span class="progress-pct progress-pct--${kind}">${pct}% ${label}</span>`;
}

/**
 * The progress bar's own label — "N / M · P%" (completion) while still in
 * progress. Once complete, a bare completion percentage is always 100 and
 * says nothing a learner doesn't already know from the full bar, so it
 * switches instead to whichever percentage(s) Settings.getProgressBarPercentMode()
 * picks: just percent correct (default), just percent missed, or a full
 * correct/revealed/missed breakdown (a category with nothing in it is
 * omitted from "all") — shared by Table's Standard and Recall/Double Recall
 * styles so the two can't quietly disagree about what "done" looks like.
 * Replaces this app's old separate end-of-quiz summary chip, which existed
 * solely to say the same "100%" the bar already showed. Returns HTML (each
 * percentage in its own colored chip) — the caller must set it via
 * `innerHTML`, not `textContent`.
 *
 * When `showHintBreakdown` is on (Settings.getProgressBarShowHintBreakdown),
 * Hinted → Solved / Hinted → Revealed / Hinted → Missed chips are appended
 * after whatever `mode` picked — these are subsets of correct/revealed/missed
 * (a word can be both "correct" and "hinted → solved"), not an alternative to
 * them, so they're additive regardless of which mode is active.
 */
export function buildProgressStatsHtml(
  { correct, revealed, missed, answered, total, hintedCorrect = 0, hintedRevealed = 0, hintedMissed = 0 }: {
    correct: number; revealed: number; missed: number; answered: number; total: number;
    hintedCorrect?: number; hintedRevealed?: number; hintedMissed?: number;
  },
  mode: ProgressBarPercentMode,
  showHintBreakdown = false,
): string {
  if (total <= 0) return '';
  if (answered < total) {
    const donePct = Math.round((answered / total) * 100);
    return `${answered} / ${total}  ·  ${donePct}%`;
  }
  const pct = (n: number): number => Math.round((n / total) * 100);
  const hintChips: string[] = [];
  if (showHintBreakdown) {
    if (hintedCorrect > 0)  hintChips.push(progressPctChip('hinted-correct', pct(hintedCorrect), 'Hinted → Solved'));
    if (hintedRevealed > 0) hintChips.push(progressPctChip('hinted-revealed', pct(hintedRevealed), 'Hinted → Revealed'));
    if (hintedMissed > 0)   hintChips.push(progressPctChip('hinted-missed', pct(hintedMissed), 'Hinted → Missed'));
  }
  const withHints = (chips: string[]): string => [...chips, ...hintChips].join(', ');
  if (mode === 'correct') return `${answered} / ${total}  ·  ${withHints([progressPctChip('correct', pct(correct), 'Correct')])}`;
  if (mode === 'missed')  return `${answered} / ${total}  ·  ${withHints([progressPctChip('missed', pct(missed), 'Missed')])}`;
  const chips = [progressPctChip('correct', pct(correct), 'Correct')];
  if (revealed > 0) chips.push(progressPctChip('revealed', pct(revealed), 'Revealed'));
  if (missed > 0) chips.push(progressPctChip('missed', pct(missed), 'Missed'));
  return `${answered} / ${total}  ·  ${withHints(chips)}`;
}
