/**
 * quiz-hidden.ts — words a learner has taken out of every quiz.
 *
 * Set from My Content's Word Editor ("Hide from all quizzes"). A hidden word is not deleted or edited:
 * it stays in the vocabulary, in My Lists and in the editor (so it can be brought back), it simply never
 * appears as a question — in Table, Picture, Conjugation, Guess the Blank, Sentence Scramble, a list's
 * Quiz, or the due-for-review queue.
 *
 * Kept as its own per-language set, beside (not inside) the word's data, like "Omit from Due" in srs.ts:
 * it is the learner's own preference, it can be set on a word they have never edited, and a later
 * resync of the real vocabulary can never overwrite it.
 */
import { readJson, writeJson, isStringArray } from './storage.ts';

const PREFIX = 'vq_hidden_';

const keyFor = (lang: string): string => PREFIX + lang.toLowerCase();

export function getQuizHidden(lang: string): Set<string> {
  return new Set(readJson<string[]>(keyFor(lang), [], isStringArray));
}

export function isQuizHidden(lang: string, word: string): boolean {
  return getQuizHidden(lang).has(word);
}

export function setQuizHidden(lang: string, word: string, hidden: boolean): void {
  const words = getQuizHidden(lang);
  if (hidden) words.add(word); else words.delete(word);
  writeJson(keyFor(lang), [...words].sort());
}
