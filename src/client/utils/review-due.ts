/**
 * review-due.ts — "review what's due today", from anywhere in the app.
 *
 * srs.ts already knows which words are due; the only way to act on that used
 * to be History → "Study these". This is that same mechanism, lifted out so
 * the header's due-badge and History share one implementation instead of two
 * copies drifting apart.
 *
 * It works by filling a "Due for Review" list with the due words and starting
 * a Focus-filtered quiz on it — the existing quiz pipeline (sizes, sorting,
 * per-mode setup) then runs untouched, rather than a parallel review pipeline.
 */

import { srsDueWords } from './srs.ts';
import {
  createList, addToList, removeFromList, getList,
  saveListFilterState, refreshFilterSelect,
} from './word-lists.ts';
import { readString } from './storage.ts';
import type { FilterScope } from '../filters/filter-scope.ts';

/** The list due words are collected into. */
export const REVIEW_LIST_NAME = 'Due for Review';

/** Quiz modes a due-word list makes sense in. */
const REVIEW_MODES = new Set(['table', 'picture']);

/** Make the review list hold exactly `words`, then start a quiz on it. */
export function studyWords(lang: string, words: string[]): void {
  createList(lang, REVIEW_LIST_NAME);

  const current = new Set(getList(lang, REVIEW_LIST_NAME));
  const wanted  = new Set(words);
  current.forEach(w => { if (!wanted.has(w)) removeFromList(lang, REVIEW_LIST_NAME, w); });
  words.forEach(w => { if (!current.has(w)) addToList(lang, REVIEW_LIST_NAME, w); });

  const savedMode  = readString('vq_mode');
  const targetMode = savedMode && REVIEW_MODES.has(savedMode) ? savedMode : 'table';

  saveListFilterState(
    lang,
    { active: true, mode: 'focus', selected: [REVIEW_LIST_NAME] },
    targetMode as FilterScope,
  );
  refreshFilterSelect(lang);
  document.querySelector<HTMLElement>(`.mode-tab[data-mode="${targetMode}"]`)?.click();
  (document.getElementById('startBtn') as HTMLButtonElement | null)?.click();
}

/** Start a review of everything currently due in `lang`. No-op if nothing is. */
export function startDueReview(lang: string): boolean {
  const words = srsDueWords(lang);
  if (words.length === 0) return false;
  studyWords(lang, words);
  return true;
}
