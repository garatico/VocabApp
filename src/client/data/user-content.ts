/**
 * user-content.ts — the "My Content" tab's storage layer.
 *
 * Everything here lives in `localStorage` only, via storage.ts, under the
 * `uc_` prefix (user content) — see that file's own prefix census, which
 * this adds a fifth entry to. Nothing in this module ever reaches the
 * server: there is no admin auth, no write route, and no path to the real
 * SQLite database (see CLAUDE.md's admin-panel gating) — this is a
 * client-only overlay a learner can use to try out their own words, trivia
 * questions and pictures without needing either.
 *
 * Because it's local storage, content added here is private to one browser
 * profile — not synced, not backed up server-side, and gone if site data is
 * cleared. exportUserContent()/applyUserContentImport() are this feature's
 * whole disaster-recovery story, mirroring my-lists/backup.ts's shape for
 * the same reason: one JSON file a learner can move to another browser or
 * keep as a safety net.
 */

import { readJson, writeJson, isRecord } from '../utils/storage.ts';
import { LANGUAGE_NAMES } from '../data/languages.ts';
import type { Word } from '../types.ts';
import type { TriviaQuestion } from './trivia-questions.ts';

const P = 'uc_';

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// ── Words ────────────────────────────────────────────────────────────────────

export interface UserWord {
  id:          string;
  word:        string;
  translation: string;
  pos:         string | null;
  domains:     string[];
  notes:       string;
}

function isUserWord(v: unknown): v is UserWord {
  return isRecord(v) && typeof v.id === 'string' && typeof v.word === 'string' && typeof v.translation === 'string';
}
function isUserWordArray(v: unknown): v is UserWord[] {
  return Array.isArray(v) && v.every(isUserWord);
}

/**
 * `isUserWord` only checks the fields that make a stored record recognizable
 * at all — matching storage.ts's own documented convention that a type guard
 * is a coarse shape check, not a schema, since a value written by an older
 * version of this feature (or a hand-edited import) is well-formed JSON of
 * the wrong shape. So `domains`/`notes`/`pos` are defaulted here, at every
 * read, rather than trusted — a `UserWord` handed to a caller is always
 * complete even if what was actually in storage wasn't.
 */
function normalizeUserWord(w: UserWord): UserWord {
  return {
    ...w,
    pos: w.pos ?? null,
    domains: Array.isArray(w.domains) ? w.domains : [],
    notes: typeof w.notes === 'string' ? w.notes : '',
  };
}

function wordsKey(lang: string): string { return `${P}words_${lang.toLowerCase()}`; }

export function getUserWords(lang: string): UserWord[] {
  return readJson<UserWord[]>(wordsKey(lang), [], isUserWordArray).map(normalizeUserWord);
}

export function addUserWord(lang: string, w: Omit<UserWord, 'id'>): UserWord {
  const entry = { ...w, id: newId('w') };
  writeJson(wordsKey(lang), [...getUserWords(lang), entry]);
  return entry;
}

export function removeUserWord(lang: string, id: string): void {
  writeJson(wordsKey(lang), getUserWords(lang).filter(w => w.id !== id));
}

/** Adapt a UserWord into the shape every quiz mode already reads. `rank: 0`
 *  puts it at the very front of any "Top N" slice, since a word the learner
 *  typed in themselves is exactly the one they want quizzed on — sizing it
 *  into the pool the same way a rank-9999-and-sinking real word would is not
 *  what "add your own word" means. */
export function toWord(uw: UserWord): Word {
  return {
    word:        uw.word,
    translation: uw.translation,
    pos:         uw.pos,
    difficulty:  null,
    notes:       uw.notes,
    glosses:     uw.translation ? [uw.translation] : [],
    examples:    [],
    svg_url:     null,
    emoji:       null,
    linguistic:  null,
    frequency:   null,
    domains:     uw.domains,
    tags:        [],
    rank:        0,
  };
}

// ── Trivia questions ─────────────────────────────────────────────────────────

function isTriviaQuestion(v: unknown): v is TriviaQuestion {
  return isRecord(v) && typeof v.id === 'string' && typeof v.questionTarget === 'string'
    && Array.isArray(v.answersTarget);
}
function isTriviaQuestionArray(v: unknown): v is TriviaQuestion[] {
  return Array.isArray(v) && v.every(isTriviaQuestion);
}

/** Same reasoning as normalizeUserWord: `isTriviaQuestion` only checks
 *  enough to be recognizable, so every other field — including the ones
 *  added after the first version of this feature shipped — is defaulted
 *  here rather than trusted, on every read. */
function normalizeTriviaQuestion(q: TriviaQuestion): TriviaQuestion {
  return {
    ...q,
    category: q.category ?? 'pop-culture',
    difficulty: q.difficulty ?? 'medium',
    readingDifficulty: q.readingDifficulty ?? 'medium',
    readingLength: q.readingLength ?? 'short',
    answerType: q.answerType ?? 'thing',
    domains: Array.isArray(q.domains) ? q.domains : [],
    questionEn: typeof q.questionEn === 'string' ? q.questionEn : q.questionTarget,
    answersEn: Array.isArray(q.answersEn) && q.answersEn.length ? q.answersEn : q.answersTarget,
  };
}

function triviaKey(lang: string): string { return `${P}trivia_${lang.toLowerCase()}`; }

export function getUserTriviaQuestions(lang: string): TriviaQuestion[] {
  return readJson<TriviaQuestion[]>(triviaKey(lang), [], isTriviaQuestionArray).map(normalizeTriviaQuestion);
}

export function addUserTriviaQuestion(lang: string, q: Omit<TriviaQuestion, 'id'>): TriviaQuestion {
  const entry = { ...q, id: newId('tq') };
  writeJson(triviaKey(lang), [...getUserTriviaQuestions(lang), entry]);
  return entry;
}

export function removeUserTriviaQuestion(lang: string, id: string): void {
  writeJson(triviaKey(lang), getUserTriviaQuestions(lang).filter(q => q.id !== id));
}

// ── Picture overrides ────────────────────────────────────────────────────────
// A user-set image URL or data: URI (a picked file, converted client-side via
// FileReader — there is no upload path), keyed by the word's own text
// lowercased. Applies to real vocabulary words and user-added words alike,
// since picture-mode.ts looks words up by the same key either way.

function picsKey(lang: string): string { return `${P}pics_${lang.toLowerCase()}`; }

function isStringRecord(v: unknown): v is Record<string, string> {
  return isRecord(v) && Object.values(v).every(x => typeof x === 'string');
}

function pictureKey(word: string): string { return word.trim().toLowerCase(); }

export function getPictureOverrides(lang: string): Record<string, string> {
  return readJson<Record<string, string>>(picsKey(lang), {}, isStringRecord);
}

export function getPictureOverride(lang: string, word: string): string | null {
  return getPictureOverrides(lang)[pictureKey(word)] ?? null;
}

export function setPictureOverride(lang: string, word: string, dataUrlOrUrl: string): void {
  writeJson(picsKey(lang), { ...getPictureOverrides(lang), [pictureKey(word)]: dataUrlOrUrl });
}

export function removePictureOverride(lang: string, word: string): void {
  const overrides = { ...getPictureOverrides(lang) };
  delete overrides[pictureKey(word)];
  writeJson(picsKey(lang), overrides);
}

// ── Export / import ──────────────────────────────────────────────────────────

const BACKUP_VERSION = 1;

interface UserContentBackup {
  version:    number;
  exportedAt: string;
  words:      Record<string, UserWord[]>;
  trivia:     Record<string, TriviaQuestion[]>;
  pictures:   Record<string, Record<string, string>>;
}

function buildUserContentBackup(): UserContentBackup {
  const backup: UserContentBackup = { version: BACKUP_VERSION, exportedAt: new Date().toISOString(), words: {}, trivia: {}, pictures: {} };
  for (const l of LANGUAGE_NAMES) {
    const words = getUserWords(l);
    const trivia = getUserTriviaQuestions(l);
    const pics = getPictureOverrides(l);
    if (words.length)                     backup.words[l]    = words;
    if (trivia.length)                    backup.trivia[l]   = trivia;
    if (Object.keys(pics).length)         backup.pictures[l] = pics;
  }
  return backup;
}

export function downloadUserContent(): void {
  const blob = new Blob([JSON.stringify(buildUserContentBackup(), null, 2)], { type: 'application/json;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `vocabapp-my-content-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

/**
 * Merge an exported file back in. Every item gets a fresh id so importing
 * the same file twice (or onto a browser that already has some of these)
 * duplicates rather than collides or silently overwrites. Returns a short
 * human summary.
 *
 * Writes once per language per category (via writeJson directly) rather than
 * through addUserWord/addUserTriviaQuestion in a loop — those each read,
 * parse, spread and re-write the *entire* existing array, so calling them
 * per imported item made restoring an N-word backup O(n²) localStorage
 * round-trips against an array growing 1→N.
 */
export function applyUserContentImport(raw: string): string {
  const data = JSON.parse(raw) as UserContentBackup;
  if (!data || typeof data !== 'object' || (!data.words && !data.trivia && !data.pictures)) {
    throw new Error('That file does not look like a My Content export.');
  }
  let words = 0, trivia = 0, pics = 0;

  for (const [l, arr] of Object.entries(data.words ?? {})) {
    if (!Array.isArray(arr)) continue;
    const imported: UserWord[] = [];
    arr.forEach(w => {
      if (!w || typeof w.word !== 'string') return;
      const { id: _id, ...rest } = w;
      imported.push({ ...rest, id: newId('w') });
      words++;
    });
    if (imported.length) writeJson(wordsKey(l), [...getUserWords(l), ...imported]);
  }
  for (const [l, arr] of Object.entries(data.trivia ?? {})) {
    if (!Array.isArray(arr)) continue;
    const imported: TriviaQuestion[] = [];
    arr.forEach(q => {
      if (!q || typeof q.questionTarget !== 'string') return;
      const { id: _id, ...rest } = q;
      imported.push({ ...rest, id: newId('tq') });
      trivia++;
    });
    if (imported.length) writeJson(triviaKey(l), [...getUserTriviaQuestions(l), ...imported]);
  }
  for (const [l, rec] of Object.entries(data.pictures ?? {})) {
    if (!rec || typeof rec !== 'object') continue;
    const overrides = { ...getPictureOverrides(l) };
    let any = false;
    Object.entries(rec).forEach(([word, url]) => {
      if (typeof url === 'string') { overrides[pictureKey(word)] = url; pics++; any = true; }
    });
    if (any) writeJson(picsKey(l), overrides);
  }

  return `Imported ${words} word${words === 1 ? '' : 's'}, ${trivia} trivia question${trivia === 1 ? '' : 's'}, ${pics} picture${pics === 1 ? '' : 's'}`;
}
