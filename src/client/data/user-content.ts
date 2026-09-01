/**
 * user-content.ts — the "My Content" tab's storage layer.
 *
 * Everything here lives in `localStorage` only, via storage.ts, under the
 * `uc_` prefix (user content) — see that file's own prefix census, which
 * this adds a fifth entry to. Nothing in this module ever reaches the
 * server: there is no admin auth, no write route, and no path to the real
 * SQLite database (see CLAUDE.md's admin-panel gating) — this is a
 * client-only overlay a learner can use to try out their own words, trivia
 * questions, pictures and word edits without needing either.
 *
 * Because it's local storage, content added here is private to one browser
 * profile — not synced, not backed up server-side, and gone if site data is
 * cleared. exportUserContent()/applyUserContentImport() are this feature's
 * whole disaster-recovery story, mirroring my-lists/backup.ts's shape for
 * the same reason: one JSON file a learner can move to another browser or
 * keep as a safety net.
 */

import { readJson, writeJson, isRecord, isStringArray, remove } from '../utils/storage.ts';
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

/** Shared by every per-word override in this file (pictures, gloss order):
 *  the word's own text, trimmed and lowercased, so a lookup never depends on
 *  capitalization or stray whitespace. */
function wordKey(word: string): string { return word.trim().toLowerCase(); }

/**
 * A plain `{}` from `JSON.parse` still has `Object.prototype` behind it, so
 * `record[key]` for an *absent* key isn't always `undefined` — a word whose
 * key happens to be `constructor`, `toString`, `hasOwnProperty` and so on
 * resolves to that inherited method instead. That's not a hypothetical: the
 * app's own vocabulary has "constructor" as a real Spanish word (see
 * visual-map.ts's lookup tables, which sidestep this the same way by using
 * `Object.create(null)`). Every override lookup here goes through this
 * instead of bare bracket access so an override record can stay a plain
 * JSON-shaped object without that risk.
 */
function ownGet<T>(record: Record<string, T>, key: string): T | undefined {
  return Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;
}

export function getPictureOverrides(lang: string): Record<string, string> {
  return readJson<Record<string, string>>(picsKey(lang), {}, isStringRecord);
}

export function getPictureOverride(lang: string, word: string): string | null {
  return ownGet(getPictureOverrides(lang), wordKey(word)) ?? null;
}

export function setPictureOverride(lang: string, word: string, dataUrlOrUrl: string): void {
  writeJson(picsKey(lang), { ...getPictureOverrides(lang), [wordKey(word)]: dataUrlOrUrl });
}

export function removePictureOverride(lang: string, word: string): void {
  const overrides = { ...getPictureOverrides(lang) };
  delete overrides[wordKey(word)];
  writeJson(picsKey(lang), overrides);
}

/**
 * An override is either an image URL/data-URI (a photo, an SVG icon, a
 * pasted link or an uploaded file — all rendered the same way, via `<img>`)
 * or a bare emoji character, stored as the same plain string with no schema
 * field to say which. This is the only place that distinction is made: how
 * it was picked (My Content's photo/icon/emoji buttons, a pasted URL, a
 * stock-image pick) always produces one of these two shapes, so recognizing
 * them by their own content is simpler than carrying a `kind` alongside
 * every stored value just to say what these three sources already imply.
 */
export function isImageOverride(value: string): boolean {
  return value.startsWith('http://') || value.startsWith('https://')
    || value.startsWith('/') || value.startsWith('data:');
}

// ── Word overrides ───────────────────────────────────────────────────────────
// A learner-chosen edit to one word: hide some of its glosses, reorder the
// rest, or override its translation/part of speech/notes/domains — every
// field optional, so setting one doesn't require touching the others. Table
// mode, multiple-choice, tooltips and My Lists all read the *effective* word
// (see applyWordOverride, applied once in data-loader.ts's loadWords) rather
// than each re-checking for an override themselves, the same reasoning as
// the picture overrides above.
//
// `hiddenGlosses`/`glossOrder` name glosses by their own text, not index, for
// the same reason as the picture overrides' word-text keys: a later pipeline
// resync that reorders, adds or removes glosses can't silently invalidate
// them the way an index would — applyGlossOrder just never matches a name
// that no longer exists, rather than pointing at the wrong sense.

export interface WordOverride {
  translation?:   string;
  pos?:           string | null;
  notes?:         string;
  domains?:       string[];
  hiddenGlosses?: string[];
  glossOrder?:    string[];
}

function wordOverrideKey(lang: string): string { return `${P}wordoverride_${lang.toLowerCase()}`; }

function isWordOverrideRecord(v: unknown): v is Record<string, WordOverride> {
  return isRecord(v) && Object.values(v).every(isRecord);
}

function legacyGlossOrderKey(lang: string): string { return `${P}glossorder_${lang.toLowerCase()}`; }

/**
 * `uc_glossorder_<lang>` was this feature's first cut — just the gloss
 * reorder, before it grew into the wider word-override record. Migrated
 * rather than dropped: a reorder saved under the old key minutes before this
 * change shipped shouldn't quietly vanish. Runs on every read of a
 * language's overrides but is a no-op after the first, since it deletes the
 * legacy key once folded in.
 */
function migrateLegacyGlossOrders(lang: string): void {
  const isLegacy = (v: unknown): v is Record<string, string[]> =>
    isRecord(v) && Object.values(v).every(isStringArray);
  const legacy = readJson<Record<string, string[]>>(legacyGlossOrderKey(lang), {}, isLegacy);
  if (Object.keys(legacy).length === 0) { remove(legacyGlossOrderKey(lang)); return; }

  const overrides = readJson<Record<string, WordOverride>>(wordOverrideKey(lang), {}, isWordOverrideRecord);
  for (const [word, order] of Object.entries(legacy)) {
    overrides[word] = { ...ownGet(overrides, word), glossOrder: order };
  }
  writeJson(wordOverrideKey(lang), overrides);
  remove(legacyGlossOrderKey(lang));
}

export function getWordOverrides(lang: string): Record<string, WordOverride> {
  migrateLegacyGlossOrders(lang);
  return readJson<Record<string, WordOverride>>(wordOverrideKey(lang), {}, isWordOverrideRecord);
}

export function getWordOverride(lang: string, word: string): WordOverride | null {
  return ownGet(getWordOverrides(lang), wordKey(word)) ?? null;
}

/** Merges `patch` into whatever override already exists for the word — each
 *  field in `patch` replaces that field only, leaving the others (and any
 *  field `patch` doesn't mention) untouched. */
function mergeWordOverride(lang: string, word: string, patch: Partial<WordOverride>): void {
  const overrides = getWordOverrides(lang);
  const current = ownGet(overrides, wordKey(word)) ?? {};
  writeJson(wordOverrideKey(lang), { ...overrides, [wordKey(word)]: { ...current, ...patch } });
}

/**
 * Replaces the translation/pos/notes/domains portion of a word's override
 * wholesale: a field missing from `fields` means "no override for this
 * field," clearing one that existed before rather than leaving it in place.
 * That's what lets My Content's word editor's "Save changes" button treat
 * editing a field back to its original value as un-overriding just that
 * field — the caller (my-content-mode.ts) only includes a key here when its
 * new value actually differs from the word's real one, so this is always
 * given the complete, current set of four to keep and nothing else.
 * Distinct from the per-gloss actions below, which each apply immediately
 * on their own.
 */
export function setWordFields(
  lang: string, word: string,
  fields: Pick<WordOverride, 'translation' | 'pos' | 'notes' | 'domains'>,
): void {
  const current = getWordOverride(lang, word) ?? {};
  const next: WordOverride = { ...current, ...fields };
  (['translation', 'pos', 'notes', 'domains'] as const).forEach(k => {
    if (!(k in fields)) delete next[k];
  });
  writeJson(wordOverrideKey(lang), { ...getWordOverrides(lang), [wordKey(word)]: next });
}

export function setGlossHidden(lang: string, word: string, gloss: string, hidden: boolean): void {
  const current = getWordOverride(lang, word);
  const hiddenSet = new Set(current?.hiddenGlosses ?? []);
  if (hidden) hiddenSet.add(gloss); else hiddenSet.delete(gloss);
  mergeWordOverride(lang, word, { hiddenGlosses: [...hiddenSet] });
}

export function setGlossOrderOverride(lang: string, word: string, order: string[]): void {
  mergeWordOverride(lang, word, { glossOrder: order });
}

export function removeWordOverride(lang: string, word: string): void {
  const overrides = { ...getWordOverrides(lang) };
  delete overrides[wordKey(word)];
  writeJson(wordOverrideKey(lang), overrides);
}

/** Reorders `glosses` to match `order` where they agree on the gloss text,
 *  appending any gloss `order` doesn't mention (new since the override was
 *  saved) at the end, and silently dropping any entry in `order` that no
 *  longer appears in `glosses` (removed since) rather than losing the rest
 *  of the ordering over one stale name. */
export function applyGlossOrder(glosses: string[], order: string[]): string[] {
  const rank = new Map(order.map((g, i) => [g, i]));
  const known   = glosses.filter(g => rank.has(g)).sort((a, b) => rank.get(a)! - rank.get(b)!);
  const unknown = glosses.filter(g => !rank.has(g));
  return [...known, ...unknown];
}

/** Applies every field of a word's override, if it has one, producing the
 *  word every client-side quiz mode should actually see. Hiding runs before
 *  reordering so `glossOrder` (saved against whatever was visible at the
 *  time) never has to account for glosses that aren't shown at all. */
export function applyWordOverride(lang: string, w: Word): Word {
  const o = getWordOverride(lang, w.word);
  if (!o) return w;
  const visible = o.hiddenGlosses?.length ? w.glosses.filter(g => !o.hiddenGlosses!.includes(g)) : w.glosses;
  return {
    ...w,
    translation: o.translation ?? w.translation,
    pos:         o.pos !== undefined ? o.pos : w.pos,
    notes:       o.notes ?? w.notes,
    domains:     o.domains ?? w.domains,
    glosses:     o.glossOrder ? applyGlossOrder(visible, o.glossOrder) : visible,
  };
}

// ── Export / import ──────────────────────────────────────────────────────────

const BACKUP_VERSION = 1;

interface UserContentBackup {
  version:        number;
  exportedAt:     string;
  words:          Record<string, UserWord[]>;
  trivia:         Record<string, TriviaQuestion[]>;
  pictures:       Record<string, Record<string, string>>;
  wordOverrides?: Record<string, Record<string, WordOverride>>;
  /** @deprecated pre-word-override export shape — read on import, never written. */
  glossOrders?:   Record<string, Record<string, string[]>>;
}

function buildUserContentBackup(): UserContentBackup {
  const backup: UserContentBackup = {
    version: BACKUP_VERSION, exportedAt: new Date().toISOString(),
    words: {}, trivia: {}, pictures: {}, wordOverrides: {},
  };
  for (const l of LANGUAGE_NAMES) {
    const words         = getUserWords(l);
    const trivia         = getUserTriviaQuestions(l);
    const pics           = getPictureOverrides(l);
    const wordOverrides  = getWordOverrides(l);
    if (words.length)                      backup.words[l]          = words;
    if (trivia.length)                     backup.trivia[l]         = trivia;
    if (Object.keys(pics).length)          backup.pictures[l]       = pics;
    if (Object.keys(wordOverrides).length) backup.wordOverrides![l] = wordOverrides;
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
  if (!data || typeof data !== 'object'
      || (!data.words && !data.trivia && !data.pictures && !data.wordOverrides && !data.glossOrders)) {
    throw new Error('That file does not look like a My Content export.');
  }
  let words = 0, trivia = 0, pics = 0, wordOverrides = 0;

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
      if (typeof url === 'string') { overrides[wordKey(word)] = url; pics++; any = true; }
    });
    if (any) writeJson(picsKey(l), overrides);
  }
  for (const [l, rec] of Object.entries(data.wordOverrides ?? {})) {
    if (!rec || typeof rec !== 'object') continue;
    const overrides = { ...getWordOverrides(l) };
    let any = false;
    Object.entries(rec).forEach(([word, override]) => {
      if (isRecord(override)) { overrides[wordKey(word)] = override as WordOverride; wordOverrides++; any = true; }
    });
    if (any) writeJson(wordOverrideKey(l), overrides);
  }
  // Pre-word-override exports only ever held a gloss reorder — folded straight
  // into the same wordOverrides bucket importing above just populated.
  for (const [l, rec] of Object.entries(data.glossOrders ?? {})) {
    if (!rec || typeof rec !== 'object') continue;
    const overrides = { ...getWordOverrides(l) };
    let any = false;
    Object.entries(rec).forEach(([word, order]) => {
      if (isStringArray(order)) {
        overrides[wordKey(word)] = { ...ownGet(overrides, wordKey(word)), glossOrder: order };
        wordOverrides++; any = true;
      }
    });
    if (any) writeJson(wordOverrideKey(l), overrides);
  }

  return `Imported ${words} word${words === 1 ? '' : 's'}, ${trivia} trivia question${trivia === 1 ? '' : 's'}, `
       + `${pics} picture${pics === 1 ? '' : 's'}, ${wordOverrides} word override${wordOverrides === 1 ? '' : 's'}`;
}
