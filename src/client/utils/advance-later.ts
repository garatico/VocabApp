/**
 * advance-later.ts — the "show the feedback, then move on" step every one-question-at-a-time mode
 * takes after an answer.
 *
 * Each mode used a bare `setTimeout(() => advance(), delay)`. Their Back / Next buttons work during
 * that delay, so clicking Next straight after answering moved on once by hand and then again when the
 * timer fired — a question skipped without ever being shown — and Back to review was pulled forward
 * again a second later. The timer now only moves on if the learner is still where they answered.
 */
export function advanceLater(current: () => number, advance: () => void, ms: number): void {
  const answeredAt = current();
  setTimeout(() => { if (current() === answeredAt) advance(); }, ms);
}
