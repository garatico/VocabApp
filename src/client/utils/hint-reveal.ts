/**
 * hint-reveal.ts — a partial, letter-by-letter reveal of an answer.
 *
 * Shared by Trivia and Guess the Blank's "Show a letter" hint (both free-
 * text answer modes with no multiple-choice fallback to lean on) — one
 * implementation rather than two copies that could quietly diverge on how
 * spaces or punctuation are handled.
 */

/**
 * `answer` with the first `revealedCount` non-space characters shown and the
 * rest replaced by underscores — spaces pass through untouched, so a
 * multi-word answer's word count is visible (a legitimate part of the
 * clue — Table mode's own hints work the same way) without the *letters*
 * being given away past what was actually revealed.
 */
export function hintReveal(answer: string, revealedCount: number): string {
  let shown = 0;
  return [...answer].map(ch => {
    if (ch === ' ') return ' ';
    shown++;
    return shown <= revealedCount ? ch : '_';
  }).join(' ');
}

/** How many non-space characters `answer` has — the cap on how far a hint can go. */
export function hintableLength(answer: string): number {
  return [...answer].filter(ch => ch !== ' ').length;
}
