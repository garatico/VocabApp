/**
 * missed-words.ts — the words the quiz that just finished got wrong.
 *
 * Held in memory only: it exists so the end-of-quiz strip can offer "add these
 * to a list" without every mode threading its own miss set through to the UI.
 * recordOutcome() (session-history.ts) already receives exactly that set at the
 * end of every word-based quiz, so it publishes here rather than each mode
 * doing so separately.
 *
 * The value is cleared when a quiz strip is cleared (a new quiz starting), so
 * it can never describe a session other than the one on screen.
 */

export interface LastMissed {
  lang:  string;
  words: string[];
}

let last: LastMissed | null = null;

export function setLastMissed(lang: string, words: Iterable<string>): void {
  const unique = [...new Set(words)];
  last = unique.length > 0 ? { lang, words: unique } : null;
}

export function getLastMissed(): LastMissed | null {
  return last;
}

export function clearLastMissed(): void {
  last = null;
}
