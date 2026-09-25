/**
 * quiz-resume.ts — an unfinished Table quiz, saved so a reload can pick it up.
 *
 * Table quizzes can be a thousand words long and are the mode people leave
 * half-done; before this, closing the tab (or a phone killing it in the
 * background) threw away every answer. The quiz itself already keeps all of its
 * state in two plain structures — the ordered word list and a per-word answer
 * snapshot — so saving is just serialising those.
 *
 * Only what is needed to rebuild is stored: word *identities* (not the word
 * objects, which are re-read from the vocabulary so edits and overrides still
 * apply), the answers, the page and the clock. Everything here is pure or
 * storage-only, no DOM, so it is unit-testable; table-controls.ts does the
 * capturing and rebuilding.
 */

import { readJson, writeJson, remove, isRecord } from './storage.ts';

const KEY     = 'vq_resume_table';
const VERSION = 1;

/** A saved quiz older than this is not offered — it's a different day's study. */
export const RESUME_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface ResumeWordRef { word: string; language?: string }

/** Structural copy of table-mode's InputSnapshot; kept loose on purpose so a
 *  field added there later doesn't invalidate saves. */
export type ResumeAnswer = Record<string, unknown>;

export interface SavedTableQuiz {
  v:         number;
  savedAt:   number;
  /** The quiz's primary language (Compare-mode words carry their own). */
  lang:      string;
  columns:   number;
  direction: string;
  pageIndex: number;
  elapsed:   number;   // seconds on the clock when saved
  words:     ResumeWordRef[];
  /** rowKey -> answer snapshot, exactly as the quiz holds it. */
  state:     [string, ResumeAnswer][];
}

function isSaved(v: unknown): v is SavedTableQuiz {
  return isRecord(v) && v.v === VERSION
    && typeof v.savedAt === 'number' && typeof v.lang === 'string'
    && typeof v.columns === 'number' && typeof v.direction === 'string'
    && typeof v.pageIndex === 'number' && typeof v.elapsed === 'number'
    && Array.isArray(v.words) && Array.isArray(v.state);
}

export function saveResume(q: Omit<SavedTableQuiz, 'v'>): boolean {
  return writeJson(KEY, { ...q, v: VERSION });
}

export function clearResume(): void {
  remove(KEY);
}

/** The saved quiz, if there is one and it is still worth offering. */
export function loadResume(now = Date.now()): SavedTableQuiz | null {
  const q = readJson<SavedTableQuiz | null>(KEY, null, v => v === null || isSaved(v));
  if (!q) return null;
  if (now - q.savedAt > RESUME_MAX_AGE_MS) { clearResume(); return null; }
  // A hand-edited or half-written save must not be able to break the quiz
  // render: keep only answers shaped the way the quiz reads them.
  const okClass = new Set(['correct', 'incorrect', 'peeked', '']);
  const state = q.state.filter(([k, a]) => typeof k === 'string' && isRecord(a)
    && typeof a.value === 'string' && typeof a.disabled === 'boolean'
    && typeof a.stateClass === 'string' && okClass.has(a.stateClass) && typeof a.dir === 'string');
  return { ...q, state };
}

/** How many of the saved words already have an answer on record. */
export function answeredCount(q: Pick<SavedTableQuiz, 'state'>): number {
  return q.state.filter(([, a]) => a.disabled === true || (typeof a.value === 'string' && a.value !== '')).length;
}

/**
 * Turn saved word references back into live word objects, in the saved order.
 * Words no longer in the vocabulary are dropped (and reported) rather than
 * failing the whole resume.
 */
export function resolveWords<T extends { word: string; language?: string }>(
  refs: readonly ResumeWordRef[],
  vocabByLang: ReadonlyMap<string, readonly T[]>,
  fallbackLang: string,
): { words: T[]; missing: number } {
  const index = new Map<string, Map<string, T>>();
  for (const [lang, list] of vocabByLang) index.set(lang, new Map(list.map(w => [w.word, w])));

  const words: T[] = [];
  let missing = 0;
  for (const r of refs) {
    const lang = r.language ?? fallbackLang;
    const w = index.get(lang)?.get(r.word);
    if (w) words.push(r.language ? { ...w, language: r.language } : w);
    else missing++;
  }
  return { words, missing };
}
