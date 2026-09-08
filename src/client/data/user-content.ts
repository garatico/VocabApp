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
import { getTriviaQuestions as getBuiltinTriviaQuestions, type TriviaQuestion } from './trivia-questions.ts';
import { getGuessBlankQuestions as getBuiltinGuessBlankQuestions, type GuessBlankQuestion } from './guess-blank-questions.ts';

const P = 'uc_';

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Recovers the creation time embedded in an id minted by `newId` above
 *  (its middle, base-36-encoded `Date.now()` segment) — used to backfill
 *  `createdAt` for a UserWord saved before that field existed, rather than
 *  defaulting every pre-existing word to "just now" and losing their actual
 *  relative order. Falls back to `Date.now()` only if the id doesn't match
 *  the expected shape at all (hand-edited import, foreign id). */
function decodeIdTimestamp(id: string): number {
  const ms = parseInt(id.split('-')[1] ?? '', 36);
  return Number.isFinite(ms) && ms > 0 ? ms : Date.now();
}

// ── Words ────────────────────────────────────────────────────────────────────

export interface UserWord {
  id:          string;
  word:        string;
  translation: string;
  /** Senses beyond `translation` — which stays the required, primary one
   *  (used for the word-row display, CSV export, etc.) so this is purely
   *  additive. Once a word has more than one, it's hideable/reorderable
   *  through the same "Edit an existing word" panel real words already use
   *  — that machinery works on any word's `glosses` array, custom or not,
   *  it's only ever had one entry to work with here before now. */
  extraGlosses: string[];
  pos:         string | null;
  domains:     string[];
  notes:       string;
  examples:    string[];
  difficulty:  number | null;
  tags:        string[];
  synonyms:    string[];
  antonyms:    string[];
  /** See Word.disambiguator in types.ts — same cosmetic parenthetical, just
   *  authored directly since a custom word has no server row to override. */
  disambiguator: string;
  /** See Word.meaningDisambiguators in types.ts — the meaning-side
   *  counterpart, keyed by gloss text (`translation`, or one of
   *  `extraGlosses`) — same reasoning as WordOverride.meaningDisambiguators. */
  meaningDisambiguators: Record<string, string>;
  /** When this word was added — lets My Content sort "added" words by
   *  newest/oldest. Optional only because a word saved before this field
   *  existed has none in storage; normalizeUserWord backfills it from the
   *  timestamp already embedded in `id` (see newId) rather than leaving it
   *  undefined, so an old entry still sorts sensibly. */
  createdAt?: number;
  /**
   * Curated frequency rank — same meaning as Word.rank, and read the same
   * way by toWord() below, so a custom word takes its place in a "Top N"
   * pool exactly like a real one instead of always being force-included
   * (which is what a hardcoded `rank: 0` here used to do). Always a real
   * number once normalized: addUserWord defaults an unspecified rank to
   * CUSTOM_WORD_RANK_BASE-and-up, in add order, so an unranked custom word
   * defaults to "less frequent than anything real" rather than "more
   * frequent than everything" — an explicit rank (typed in, or picked via a
   * CEFR level in the UI) overrides that placement either up or down.
   */
  rank: number;
}

/** Where an unranked custom word's default rank starts counting up from —
 *  comfortably past any real vocabulary's size (the biggest language tops
 *  out in the low thousands), so a custom word with no explicit rank always
 *  sorts after every real word, in the order it was added. See UserWord.rank. */
export const CUSTOM_WORD_RANK_BASE = 1_000_000;

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
/**
 * `rankFallbackIndex` backfills a rank for a word saved before this field
 * existed — CUSTOM_WORD_RANK_BASE plus this word's own position among this
 * language's stored words, so a legacy word still lands after every real
 * one, in the order it was originally added (the same rule addUserWord
 * applies going forward), rather than every legacy word colliding on one
 * fallback value.
 */
function normalizeUserWord(w: UserWord, rankFallbackIndex: number): UserWord {
  return {
    ...w,
    pos: w.pos ?? null,
    extraGlosses: Array.isArray(w.extraGlosses) ? w.extraGlosses : [],
    disambiguator: typeof w.disambiguator === 'string' ? w.disambiguator : '',
    meaningDisambiguators: isStringRecord(w.meaningDisambiguators) ? w.meaningDisambiguators : {},
    domains: Array.isArray(w.domains) ? w.domains : [],
    notes: typeof w.notes === 'string' ? w.notes : '',
    examples: Array.isArray(w.examples) ? w.examples : [],
    difficulty: typeof w.difficulty === 'number' ? w.difficulty : null,
    tags: Array.isArray(w.tags) ? w.tags : [],
    synonyms: Array.isArray(w.synonyms) ? w.synonyms : [],
    antonyms: Array.isArray(w.antonyms) ? w.antonyms : [],
    createdAt: typeof w.createdAt === 'number' ? w.createdAt : decodeIdTimestamp(w.id),
    rank: typeof w.rank === 'number' ? w.rank : CUSTOM_WORD_RANK_BASE + rankFallbackIndex,
  };
}

function wordsKey(lang: string): string { return `${P}words_${lang.toLowerCase()}`; }

export function getUserWords(lang: string): UserWord[] {
  return readJson<UserWord[]>(wordsKey(lang), [], isUserWordArray).map(normalizeUserWord);
}

/**
 * `rank`, when omitted (or explicitly `null`, meaning "let it default"), is
 * CUSTOM_WORD_RANK_BASE plus how many words this language already has — the
 * next slot after the lowest-ranked word added so far, so a fresh custom
 * word starts out less frequent than every real word and every one already
 * added, without needing to know the real vocabulary's own size. An explicit
 * number places it anywhere the caller chooses instead (e.g. My Content's
 * own rank/CEFR picker).
 */
export function addUserWord(lang: string, w: Omit<UserWord, 'id' | 'createdAt' | 'rank'> & { rank?: number | null }): UserWord {
  const existing = getUserWords(lang);
  const rank = typeof w.rank === 'number' ? w.rank : CUSTOM_WORD_RANK_BASE + existing.length;
  const entry: UserWord = { ...w, rank, id: newId('w'), createdAt: Date.now() };
  writeJson(wordsKey(lang), [...existing, entry]);
  return entry;
}

export function removeUserWord(lang: string, id: string): void {
  writeJson(wordsKey(lang), getUserWords(lang).filter(w => w.id !== id));
}

/** Adapt a UserWord into the shape every quiz mode already reads. `rank`
 *  places it in a "Top N" pool exactly like a real word — see UserWord.rank
 *  and addUserWord's own default (lowest among added words, i.e. after
 *  every real one) unless a rank/CEFR level was explicitly chosen for it. */
export function toWord(uw: UserWord): Word {
  return {
    word:        uw.word,
    translation: uw.translation,
    pos:         uw.pos,
    difficulty:  uw.difficulty,
    notes:       uw.notes,
    glosses:     [uw.translation, ...uw.extraGlosses].filter(Boolean),
    examples:    uw.examples,
    svg_url:     null,
    emoji:       null,
    disambiguator: uw.disambiguator || undefined,
    meaningDisambiguators: Object.keys(uw.meaningDisambiguators).length ? uw.meaningDisambiguators : undefined,
    linguistic:  null,
    frequency:   null,
    domains:     uw.domains,
    tags:        uw.tags,
    relations:   (uw.synonyms.length || uw.antonyms.length) ? { synonyms: uw.synonyms, antonyms: uw.antonyms } : undefined,
    rank:        uw.rank,
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

export function updateUserTriviaQuestion(lang: string, id: string, patch: Partial<Omit<TriviaQuestion, 'id'>>): void {
  writeJson(triviaKey(lang), getUserTriviaQuestions(lang).map(q => q.id === id ? { ...q, ...patch } : q));
}

// ── Trivia question overrides (the hand-written bank) ───────────────────────
// Same idea as WordOverride below, scaled down: My Content can't delete or
// add to data/trivia-questions.ts (it's shipped source, not a database), but
// a learner can still patch any field of one of its questions — a typo fix,
// a friendlier reading level, a different accepted answer — the same way a
// word override sits on top of a real vocabulary word without touching it.
// Keyed by the built-in question's own `id` (e.g. 'es-h1'), one full-question
// patch per entry rather than per-field, since the editor that writes this
// always shows (and submits) every field at once — unlike WordOverride, whose
// caller only includes a field when it actually changed.

export type TriviaQuestionOverride = Partial<Omit<TriviaQuestion, 'id'>> & { updatedAt: number };

function triviaOverrideKey(lang: string): string { return `${P}triviaoverride_${lang.toLowerCase()}`; }

function isTriviaQuestionOverrideRecord(v: unknown): v is Record<string, TriviaQuestionOverride> {
  return isRecord(v) && Object.values(v).every(isRecord);
}

export function getTriviaQuestionOverrides(lang: string): Record<string, TriviaQuestionOverride> {
  return readJson<Record<string, TriviaQuestionOverride>>(triviaOverrideKey(lang), {}, isTriviaQuestionOverrideRecord);
}

export function getTriviaQuestionOverride(lang: string, id: string): TriviaQuestionOverride | null {
  return ownGet(getTriviaQuestionOverrides(lang), id) ?? null;
}

/** Replaces a built-in question's override wholesale — same "always the
 *  complete, current set" reasoning as setWordFields, since the editor this
 *  feeds always shows every field pre-filled with its current effective
 *  value, not just the ones that differ. */
export function setTriviaQuestionOverride(lang: string, id: string, fields: Partial<Omit<TriviaQuestion, 'id'>>): void {
  const overrides = getTriviaQuestionOverrides(lang);
  writeJson(triviaOverrideKey(lang), { ...overrides, [id]: { ...fields, updatedAt: Date.now() } });
}

export function removeTriviaQuestionOverride(lang: string, id: string): void {
  const overrides = getTriviaQuestionOverrides(lang);
  if (!(id in overrides)) return;
  const next = { ...overrides };
  delete next[id];
  writeJson(triviaOverrideKey(lang), next);
}

/** The built-in bank's own questions for `lang`, with any saved override
 *  patched in — data/trivia-questions.ts itself untouched. */
export function getBuiltinTriviaQuestionsWithOverrides(lang: string): TriviaQuestion[] {
  const overrides = getTriviaQuestionOverrides(lang);
  return getBuiltinTriviaQuestions(lang).map(q => {
    const o = overrides[q.id];
    return o ? { ...q, ...o } : q;
  });
}

/** What a quiz should actually draw from: the built-in bank (overrides
 *  applied) plus every question a learner has added of their own — the same
 *  two-layer merge trivia-mode.ts used to do inline, moved here so the My
 *  Content editor and the quiz itself can never drift apart on how the two
 *  layers combine. */
export function getEffectiveTriviaQuestions(lang: string): TriviaQuestion[] {
  return [...getBuiltinTriviaQuestionsWithOverrides(lang), ...getUserTriviaQuestions(lang)];
}

// ── Guess the Blank questions ────────────────────────────────────────────────
// Same shape as Trivia above: a user-written question layered on top of the
// hand-written bank (data/guess-blank-questions.ts) the same way
// getUserTriviaQuestions() layers onto data/trivia-questions.ts — see
// guess-blank-mode.ts's own merge.

function isGuessBlankQuestion(v: unknown): v is GuessBlankQuestion {
  return isRecord(v) && typeof v.id === 'string' && typeof v.answerTarget === 'string'
    && Array.isArray(v.cluesTarget);
}
function isGuessBlankQuestionArray(v: unknown): v is GuessBlankQuestion[] {
  return Array.isArray(v) && v.every(isGuessBlankQuestion);
}

/** Same reasoning as normalizeTriviaQuestion: only enough to be recognizable
 *  is checked by the type guard, so every other field is defaulted here. */
function normalizeGuessBlankQuestion(q: GuessBlankQuestion): GuessBlankQuestion {
  return {
    ...q,
    category: q.category ?? 'object',
    difficulty: q.difficulty ?? 'medium',
    cluesTarget: Array.isArray(q.cluesTarget) ? q.cluesTarget : [],
    cluesEn: Array.isArray(q.cluesEn) ? q.cluesEn : [],
    answerEn: typeof q.answerEn === 'string' ? q.answerEn : q.answerTarget,
  };
}

function guessBlankKey(lang: string): string { return `${P}guessblank_${lang.toLowerCase()}`; }

export function getUserGuessBlankQuestions(lang: string): GuessBlankQuestion[] {
  return readJson<GuessBlankQuestion[]>(guessBlankKey(lang), [], isGuessBlankQuestionArray).map(normalizeGuessBlankQuestion);
}

export function addUserGuessBlankQuestion(lang: string, q: Omit<GuessBlankQuestion, 'id'>): GuessBlankQuestion {
  const entry = { ...q, id: newId('gb') };
  writeJson(guessBlankKey(lang), [...getUserGuessBlankQuestions(lang), entry]);
  return entry;
}

export function removeUserGuessBlankQuestion(lang: string, id: string): void {
  writeJson(guessBlankKey(lang), getUserGuessBlankQuestions(lang).filter(q => q.id !== id));
}

export function updateUserGuessBlankQuestion(lang: string, id: string, patch: Partial<Omit<GuessBlankQuestion, 'id'>>): void {
  writeJson(guessBlankKey(lang), getUserGuessBlankQuestions(lang).map(q => q.id === id ? { ...q, ...patch } : q));
}

// ── Guess the Blank question overrides (the hand-written bank) ─────────────
// Same reasoning as the trivia overrides above, for data/guess-blank-questions.ts.

export type GuessBlankQuestionOverride = Partial<Omit<GuessBlankQuestion, 'id'>> & { updatedAt: number };

function guessBlankOverrideKey(lang: string): string { return `${P}guessblankoverride_${lang.toLowerCase()}`; }

function isGuessBlankQuestionOverrideRecord(v: unknown): v is Record<string, GuessBlankQuestionOverride> {
  return isRecord(v) && Object.values(v).every(isRecord);
}

export function getGuessBlankQuestionOverrides(lang: string): Record<string, GuessBlankQuestionOverride> {
  return readJson<Record<string, GuessBlankQuestionOverride>>(guessBlankOverrideKey(lang), {}, isGuessBlankQuestionOverrideRecord);
}

export function getGuessBlankQuestionOverride(lang: string, id: string): GuessBlankQuestionOverride | null {
  return ownGet(getGuessBlankQuestionOverrides(lang), id) ?? null;
}

export function setGuessBlankQuestionOverride(lang: string, id: string, fields: Partial<Omit<GuessBlankQuestion, 'id'>>): void {
  const overrides = getGuessBlankQuestionOverrides(lang);
  writeJson(guessBlankOverrideKey(lang), { ...overrides, [id]: { ...fields, updatedAt: Date.now() } });
}

export function removeGuessBlankQuestionOverride(lang: string, id: string): void {
  const overrides = getGuessBlankQuestionOverrides(lang);
  if (!(id in overrides)) return;
  const next = { ...overrides };
  delete next[id];
  writeJson(guessBlankOverrideKey(lang), next);
}

export function getBuiltinGuessBlankQuestionsWithOverrides(lang: string): GuessBlankQuestion[] {
  const overrides = getGuessBlankQuestionOverrides(lang);
  return getBuiltinGuessBlankQuestions(lang).map(q => {
    const o = overrides[q.id];
    return o ? { ...q, ...o } : q;
  });
}

export function getEffectiveGuessBlankQuestions(lang: string): GuessBlankQuestion[] {
  return [...getBuiltinGuessBlankQuestionsWithOverrides(lang), ...getUserGuessBlankQuestions(lang)];
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
  /** Brand-new senses typed in by the learner — the one thing hide/reorder
   *  above can't do, since both only operate on glosses the real vocabulary
   *  already has. Merged in ahead of hiddenGlosses/glossOrder in
   *  applyWordOverride, so an added gloss can be repositioned the same way a
   *  real one can; there's no hiding one, since deleting it outright (see
   *  removeAddedGloss) already covers that. */
  addedGlosses?:  string[];
  examples?:      string[];
  difficulty?:    number | null;
  /** See Word.rank in types.ts. Overrides which "Top N" pool position a real
   *  word takes — absent means "use the real word's own rank," same
   *  undefined-means-inherit convention as every other field here. */
  rank?:          number;
  tags?:          string[];
  synonyms?:      string[];
  antonyms?:      string[];
  /** See Word.disambiguator in types.ts. Overrides (or, for a custom word
   *  authors) the cosmetic sense annotation shown next to the word. */
  disambiguator?: string;
  /**
   * See Word.meaningDisambiguators in types.ts — the meaning-side
   * counterpart, independent of disambiguator above. Keyed by gloss text,
   * same convention as hiddenGlosses/glossOrder: a key absent here means "no
   * override for this sense," inheriting whatever note the word itself
   * already carries (always none, for a real word) rather than clearing it —
   * see applyWordOverride, which merges rather than replaces this map. A
   * learner only ever writes an entry for the senses that actually need one.
   */
  meaningDisambiguators?: Record<string, string>;
  /** When this word's override was last written — stamped by every write
   *  path below (mergeWordOverride, setWordFields) — lets My Content sort
   *  "edited" words by newest/oldest. Absent only on an override saved
   *  before this field existed; normalizeWordOverride below backfills it. */
  updatedAt?: number;
}

function wordOverrideKey(lang: string): string { return `${P}wordoverride_${lang.toLowerCase()}`; }

/** Same reasoning as normalizeUserWord: backfills a field added after this
 *  feature's first version, so every caller sees a complete record. There's
 *  no id to decode a real timestamp out of here (a word-override record is
 *  keyed by the word's own text, not an id from newId), so an override
 *  written before this field existed backfills to 0 — sorts as "oldest,"
 *  which is honest (its real edit time is simply unknown) rather than a
 *  fabricated "now" that would drift a little on every read. */
function normalizeWordOverride(o: WordOverride): WordOverride {
  return typeof o.updatedAt === 'number' ? o : { ...o, updatedAt: 0 };
}

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
  const raw = readJson<Record<string, WordOverride>>(wordOverrideKey(lang), {}, isWordOverrideRecord);
  const out: Record<string, WordOverride> = {};
  for (const [word, o] of Object.entries(raw)) out[word] = normalizeWordOverride(o);
  return out;
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
  writeJson(wordOverrideKey(lang), { ...overrides, [wordKey(word)]: { ...current, ...patch, updatedAt: Date.now() } });
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
  fields: Pick<WordOverride,
    'translation' | 'pos' | 'notes' | 'domains' | 'examples' | 'difficulty' | 'rank' | 'tags' | 'synonyms' | 'antonyms' | 'disambiguator'>,
): void {
  const current = getWordOverride(lang, word) ?? {};
  const next: WordOverride = { ...current, ...fields };
  (['translation', 'pos', 'notes', 'domains', 'examples', 'difficulty', 'rank', 'tags', 'synonyms', 'antonyms', 'disambiguator'] as const)
    .forEach(k => {
      if (!(k in fields)) delete next[k];
    });
  next.updatedAt = Date.now();
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

/**
 * Sets (or, if blanked out, clears) one gloss's meaning-disambiguator note —
 * independent of every other gloss's, so a learner only ever has to
 * annotate the senses that actually need one. Clearing an entry here means
 * "no override for this sense," not "no note at all": applyWordOverride
 * merges this map with the word's own (always empty, for a real word), so a
 * custom word's own authored note for a gloss still shows through.
 */
export function setGlossMeaningNote(lang: string, word: string, gloss: string, note: string): void {
  const current = { ...(getWordOverride(lang, word)?.meaningDisambiguators ?? {}) };
  const trimmed = note.trim();
  if (trimmed) current[gloss] = trimmed; else delete current[gloss];
  mergeWordOverride(lang, word, { meaningDisambiguators: current });
}

/** Adds a brand-new sense to a word's gloss list. Silently ignored if blank
 *  or already added — not checked against the word's real glosses too, since
 *  typing in a sense that happens to match one already there is harmless. */
export function addGlossOverride(lang: string, word: string, gloss: string): void {
  const trimmed = gloss.trim();
  if (!trimmed) return;
  const added = getWordOverride(lang, word)?.addedGlosses ?? [];
  if (added.includes(trimmed)) return;
  mergeWordOverride(lang, word, { addedGlosses: [...added, trimmed] });
}

/** Removes a gloss the learner added — the delete counterpart to
 *  addGlossOverride, since an added gloss (unlike a real one) has nothing to
 *  hide instead. */
export function removeAddedGloss(lang: string, word: string, gloss: string): void {
  const added = getWordOverride(lang, word)?.addedGlosses;
  if (!added) return;
  mergeWordOverride(lang, word, { addedGlosses: added.filter(g => g !== gloss) });
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
  const withAdded = o.addedGlosses?.length ? [...w.glosses, ...o.addedGlosses] : w.glosses;
  const visible = o.hiddenGlosses?.length ? withAdded.filter(g => !o.hiddenGlosses!.includes(g)) : withAdded;
  const synonyms = o.synonyms ?? w.relations?.synonyms;
  const antonyms = o.antonyms ?? w.relations?.antonyms;
  // Merged rather than replaced: a gloss the override doesn't mention keeps
  // whatever note the word itself already carries (always none, for a real
  // word — but a custom UserWord's own authored note survives an override
  // that only touches a *different* gloss). See setGlossMeaningNote.
  const meaningDisambiguators = (w.meaningDisambiguators || o.meaningDisambiguators)
    ? { ...w.meaningDisambiguators, ...o.meaningDisambiguators }
    : undefined;
  return {
    ...w,
    translation: o.translation ?? w.translation,
    pos:         o.pos !== undefined ? o.pos : w.pos,
    notes:       o.notes ?? w.notes,
    domains:     o.domains ?? w.domains,
    glosses:     o.glossOrder ? applyGlossOrder(visible, o.glossOrder) : visible,
    examples:    o.examples ?? w.examples,
    difficulty:  o.difficulty !== undefined ? o.difficulty : w.difficulty,
    rank:        o.rank !== undefined ? o.rank : w.rank,
    tags:        o.tags ?? w.tags,
    relations:   (synonyms?.length || antonyms?.length) ? { synonyms, antonyms } : w.relations,
    disambiguator: o.disambiguator ?? w.disambiguator,
    meaningDisambiguators,
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
  guessBlank?:    Record<string, GuessBlankQuestion[]>;
  /** @deprecated pre-word-override export shape — read on import, never written. */
  glossOrders?:   Record<string, Record<string, string[]>>;
}

function buildUserContentBackup(): UserContentBackup {
  const backup: UserContentBackup = {
    version: BACKUP_VERSION, exportedAt: new Date().toISOString(),
    words: {}, trivia: {}, pictures: {}, wordOverrides: {}, guessBlank: {},
  };
  for (const l of LANGUAGE_NAMES) {
    const words         = getUserWords(l);
    const trivia         = getUserTriviaQuestions(l);
    const pics           = getPictureOverrides(l);
    const wordOverrides  = getWordOverrides(l);
    const guessBlank     = getUserGuessBlankQuestions(l);
    if (words.length)                      backup.words[l]          = words;
    if (trivia.length)                     backup.trivia[l]         = trivia;
    if (Object.keys(pics).length)          backup.pictures[l]       = pics;
    if (Object.keys(wordOverrides).length) backup.wordOverrides![l] = wordOverrides;
    if (guessBlank.length)                 backup.guessBlank![l]    = guessBlank;
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
      || (!data.words && !data.trivia && !data.pictures && !data.wordOverrides && !data.glossOrders && !data.guessBlank)) {
    throw new Error('That file does not look like a My Content export.');
  }
  let words = 0, trivia = 0, pics = 0, wordOverrides = 0, guessBlank = 0;

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
  for (const [l, arr] of Object.entries(data.guessBlank ?? {})) {
    if (!Array.isArray(arr)) continue;
    const imported: GuessBlankQuestion[] = [];
    arr.forEach(q => {
      if (!q || typeof q.answerTarget !== 'string') return;
      const { id: _id, ...rest } = q;
      imported.push({ ...rest, id: newId('gb') });
      guessBlank++;
    });
    if (imported.length) writeJson(guessBlankKey(l), [...getUserGuessBlankQuestions(l), ...imported]);
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
       + `${guessBlank} Guess the Blank question${guessBlank === 1 ? '' : 's'}, `
       + `${pics} picture${pics === 1 ? '' : 's'}, ${wordOverrides} word override${wordOverrides === 1 ? '' : 's'}`;
}
