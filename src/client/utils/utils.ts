import type { Word } from '../types.js';
import { languageInfo } from '../data/languages.js';

/**
 * For a `romanizedScript` language (Chinese): which script is the word slot's
 * primary form — the one shown by default and required by default when
 * typed. 'characters' is the literal spelling (hanzi); 'pinyin' is the
 * romanized reading (`linguistic.ipa`). Meaningless, and never consulted, for
 * any other language.
 */
export type ChineseScript = 'characters' | 'pinyin';

/**
 * Display/leniency options for a `romanizedScript` language, threaded through
 * rather than read from `Settings` directly so this stays pure and testable
 * — callers pass `Settings.getChineseDisplay()`.
 */
export interface ChineseDisplay {
  /** Which script is primary — see `ChineseScript`. */
  chineseScript:   ChineseScript;
  /**
   * Annotate the word slot's primary script with the other one in
   * parentheses (e.g. "的 (de)", or "de (的)" when pinyin is primary), and
   * accept either script as a typed answer rather than only the primary.
   */
  showBothScripts: boolean;
  /** Annotate the English gloss with the pinyin reading, e.g. "already (le)". */
  showPinyinGloss: boolean;
}

export const DEFAULT_CHINESE_DISPLAY: ChineseDisplay = {
  chineseScript:   'characters',
  showBothScripts: true,
  showPinyinGloss: true,
};

/** "spanish" -> "Spanish". Language codes and other plain-ASCII labels only. */
export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Normalise a string for loose comparison:
 * trim whitespace, collapse internal spaces, lowercase, strip accents.
 */
function normalise(str = ''): string {
  return str
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')  // strip diacritics
    .replace(/\s+/g, ' ');
}

/**
 * Strict normalise — same as normalise but keeps diacritics.
 * Used when the user has chosen strict answer matching in settings.
 */
function normaliseStrict(str = ''): string {
  return str.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Strip parenthetical usage notes from a gloss before comparison.
 * e.g. "the (fem. sing.)"       → "the"
 *      "to be (permanent)"      → "to be"
 *      "you (indirect obj.)"    → "you"
 *      "a, an (masc. sing.)"   → "a, an"
 */
function stripParens(str: string): string {
  return str.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Accept an English infinitive with or without its "to".
 *
 * Which form a gloss happens to use is an accident of where it came from, not
 * a fact about the word: the Spanish set is written bare ("be", "is", "am"),
 * every other language's is written with "to" ("to be"). A learner typing
 * "buy" for *comprar* was being marked wrong for picking the other convention,
 * and 21% of verbs accepted only one of the two.
 *
 * Applied to every gloss rather than only to verbs on purpose. `pos` is null
 * on a fair number of mined rows, so gating on it would silently drop the bare
 * form for any verb that happens to be untagged or tagged wrong. The price of
 * being indiscriminate is that a noun also accepts "to <noun>", which is not a
 * string anyone types.
 *
 * Both directions, because the data goes both ways — and unlike the curated
 * files, nothing here is written to disk, so generating "to is" for the gloss
 * "is" costs nothing and is never shown to anyone.
 */
function withInfinitiveForms(token: string): string[] {
  if (token.startsWith('to ')) {
    const bare = token.slice(3).trim();
    return bare ? [token, bare] : [token];
  }
  return [token, `to ${token}`];
}

/**
 * Expand a single gloss into all matchable forms:
 * - strips parentheticals
 * - splits comma-separated alternatives ("a, an" → ["a", "an"])
 * - accepts an infinitive with or without "to" (see withInfinitiveForms)
 *
 * `norm` is a parameter so the strict matcher can reuse this with a normaliser
 * that keeps diacritics; the two used to be separate copies of the same chain
 * and only one of them ever got fixed.
 */
function glossToTokens(gloss: string, norm: (s?: string) => string = normalise): string[] {
  return stripParens(gloss)
    .split(/[,/]/)
    .map(t => norm(t))
    .filter(Boolean)
    .flatMap(withInfinitiveForms);
}

/**
 * Check whether the user's input matches any accepted gloss for a word entry.
 * Used in forward direction (target language shown, user types English).
 */
export function isCorrect(input: string, entry: Word): boolean {
  const attempt = normalise(input);
  if (!attempt) return false;

  if (Array.isArray(entry.glosses) && entry.glosses.length > 0) {
    return entry.glosses.some(g => glossToTokens(g).includes(attempt));
  }

  if (typeof entry.answers === 'string') {
    return entry.answers.split('|').some(a => glossToTokens(a).includes(attempt));
  }

  return false;
}

/**
 * The accepted forms of the target-language word itself, for the reverse
 * direction (English shown, user types the foreign word): the canonical word
 * form and the infinitive (if it differs, e.g. "hablar" for "habla").
 *
 * For a `romanizedScript` language (Chinese), the accepted set instead comes
 * from `display.chineseScript` — characters (+ infinitive) or the pinyin
 * reading — widened to include the other one too when `showBothScripts` is
 * on. `lang` is the word's own effective language (`w.language ??
 * quizLang`), since a merged multi-language table can mix a `romanizedScript`
 * language with others in the same quiz.
 */
function reverseTargets(
  entry: Word,
  norm: (s?: string) => string,
  lang?: string | null,
  display: ChineseDisplay = DEFAULT_CHINESE_DISPLAY,
): string[] {
  const wordForms = ([entry.word, entry.linguistic?.infinitive] as (string | null | undefined)[])
    .filter((w): w is string => typeof w === 'string' && w.length > 0)
    .map(w => norm(w));

  if (!lang || !languageInfo(lang).romanizedScript) return wordForms;

  const pinyin = entry.linguistic?.ipa ? norm(entry.linguistic.ipa) : null;
  if (display.chineseScript === 'pinyin') {
    if (!display.showBothScripts) return pinyin ? [pinyin] : [];
    return pinyin ? [pinyin, ...wordForms] : wordForms;
  }
  if (!display.showBothScripts) return wordForms;
  return pinyin ? [...wordForms, pinyin] : wordForms;
}

/**
 * Check whether the user's input matches the target-language word.
 * Used in reverse direction (English shown, user types the foreign word).
 * Accent-insensitive by default (same leniency as forward direction).
 */
export function isReverseCorrect(
  input: string,
  entry: Word,
  lang?: string | null,
  display: ChineseDisplay = DEFAULT_CHINESE_DISPLAY,
): boolean {
  const attempt = normalise(input);
  if (!attempt) return false;
  return reverseTargets(entry, normalise, lang, display).includes(attempt);
}

/**
 * Strict variants — diacritics are significant (e.g. "esta" ≠ "está").
 */
export function isCorrectStrict(input: string, entry: Word): boolean {
  const attempt = normaliseStrict(input);
  if (!attempt) return false;
  if (Array.isArray(entry.glosses) && entry.glosses.length > 0) {
    return entry.glosses.some(g => glossToTokens(g, normaliseStrict).includes(attempt));
  }
  if (typeof entry.answers === 'string') {
    return entry.answers.split('|').some(a => glossToTokens(a, normaliseStrict).includes(attempt));
  }
  return false;
}

export function isReverseCorrectStrict(
  input: string,
  entry: Word,
  lang?: string | null,
  display: ChineseDisplay = DEFAULT_CHINESE_DISPLAY,
): boolean {
  const attempt = normaliseStrict(input);
  if (!attempt) return false;
  return reverseTargets(entry, normaliseStrict, lang, display).includes(attempt);
}

/** Which way round the question is asked. */
export type AnswerDirection = 'target-en' | 'en-target';

/** Whether accents count. Mirrors Settings.getMatchMode(). */
export type AnswerMatchMode = 'fuzzy' | 'strict';

/**
 * The one entry point for "is this typed answer right?".
 *
 * Every typing quiz — table, picture, single word — asks the same question and
 * must answer it the same way, including whether the learner's Flexible/Strict
 * setting is honoured. It was previously a four-way `if` written out in table
 * mode, and picture mode had its own local matcher that ignored the setting
 * entirely: the same typo was accepted in one tab and rejected in the next.
 *
 * `mode` is a parameter rather than a `Settings` read so this stays pure and
 * testable; callers pass `Settings.getMatchMode()`. Same for `display`
 * (`Settings.getChineseDisplay()`) and `lang`, the word's effective language
 * (`w.language ?? quizLang`) — only consulted for `en-target`, and only
 * changes anything for a `romanizedScript` language (Chinese).
 */
export function matchesAnswer(
  input: string,
  entry: Word,
  dir:   AnswerDirection,
  mode:  AnswerMatchMode = 'fuzzy',
  lang?: string | null,
  display: ChineseDisplay = DEFAULT_CHINESE_DISPLAY,
): boolean {
  if (mode === 'strict') {
    return dir === 'en-target'
      ? isReverseCorrectStrict(input, entry, lang, display)
      : isCorrectStrict(input, entry);
  }
  return dir === 'en-target'
    ? isReverseCorrect(input, entry, lang, display)
    : isCorrect(input, entry);
}

/**
 * A quiz row shows or asks for one of two "sides" of an entry: the word
 * itself, or the English meaning. Table mode's Direction setting is a choice
 * of which one is shown and which is typed. For a `romanizedScript` language
 * (Chinese), the word slot's own text and matching are further governed by
 * `ChineseDisplay` — see `slotText`/`slotMatches`.
 */
export type QuizSlot = 'word' | 'english';

/**
 * The word slot's own text: for a `romanizedScript` language, the primary
 * script named by `display.chineseScript`, annotated with the other one in
 * parentheses when `display.showBothScripts` is on (e.g. "的 (de)", or
 * "de (的)" when pinyin is primary) — falling back to the other script, or
 * to `entry.word`, if the primary one is missing rather than showing blank
 * text. Every other language just returns `entry.word` untouched.
 */
export function chineseWordText(entry: Word, lang: string | null | undefined, display: ChineseDisplay): string {
  if (!lang || !languageInfo(lang).romanizedScript) return entry.word;
  const pinyin = entry.linguistic?.ipa || null;
  const primary   = display.chineseScript === 'pinyin' ? (pinyin ?? entry.word) : entry.word;
  const secondary = display.chineseScript === 'pinyin' ? entry.word : pinyin;
  if (!display.showBothScripts || !secondary || secondary === primary) return primary;
  return `${primary} (${secondary})`;
}

/**
 * The prompt or revealed-answer text for one slot of a quiz row. `glossCount`
 * only matters for the 'english' slot — see buildGlossDisplay. For a
 * `romanizedScript` language, an 'english' slot also gets the pinyin reading
 * appended when `display.showPinyinGloss` is on, e.g. "already (le)".
 */
export function slotText(
  entry: Word,
  slot: QuizSlot,
  lang: string | null | undefined,
  display: ChineseDisplay,
  glossCount = Infinity,
): string {
  if (slot === 'word') return chineseWordText(entry, lang, display);
  const base = buildGlossDisplay(entry, glossCount);
  if (!display.showPinyinGloss || !lang || !languageInfo(lang).romanizedScript) return base;
  const pinyin = entry.linguistic?.ipa;
  return pinyin ? `${base} (${pinyin})` : base;
}

/**
 * Whether `input` is an accepted answer for one slot of a quiz row. 'english'
 * reuses forward-direction gloss matching unchanged; 'word' reuses the same
 * matching (and script leniency) as the reverse-direction case above.
 */
export function slotMatches(
  input: string,
  entry: Word,
  slot: QuizSlot,
  mode: AnswerMatchMode = 'fuzzy',
  lang?: string | null,
  display: ChineseDisplay = DEFAULT_CHINESE_DISPLAY,
): boolean {
  if (slot === 'english') return mode === 'strict' ? isCorrectStrict(input, entry) : isCorrect(input, entry);
  return mode === 'strict'
    ? isReverseCorrectStrict(input, entry, lang, display)
    : isReverseCorrect(input, entry, lang, display);
}

/** Return prompt + hint for display. */
export function getDisplay(entry: Word): { prompt: string; hint: string | null } {
  return {
    prompt: entry.word,
    hint:   buildGlossDisplay(entry) || null,
  };
}

/** Return a short label for the part of speech badge. */
export function getPosLabel(entry: Word): string {
  const map: Record<string, string> = {
    verb:         'verb',
    noun:         'noun',
    adjective:    'adj',
    adverb:       'adv',
    pronoun:      'pron',
    preposition:  'prep',
    conjunction:  'conj',
    article:      'art',
    interjection: 'interj',
  };
  return map[entry.pos ?? ''] ?? entry.pos ?? '';
}

/** Return the accepted glosses for display, with parentheticals stripped. */
export function getGlosses(entry: Word): string[] {
  const raw: string[] = Array.isArray(entry.glosses)
    ? entry.glosses
    : typeof entry.answers === 'string'
      ? entry.answers.split('|')
      : [];
  return raw.map(stripParens).filter(Boolean);
}

/**
 * The full, ordered gloss list buildGlossDisplay draws from before slicing to
 * maxGlosses — verbs narrow to "to X" forms when any exist, everything else
 * keeps every sense. Its own function so extraMatchedGloss can search the
 * same list buildGlossDisplay would, and the two can never drift apart.
 */
function chosenGlosses(entry: Word): string[] {
  const glosses = getGlosses(entry);
  if (entry.pos === 'verb') {
    const toForms = glosses.filter(g => g.toLowerCase().startsWith('to '));
    if (toForms.length > 0) return toForms;
  }
  return glosses;
}

/**
 * Build the human-readable gloss string for a word entry.
 * - Verbs: filter to "to X" forms and join with " / "  (e.g. "to speak / to talk")
 * - Everything else: join all glosses with " / "        (e.g. "of / from")
 * Falls back to entry.translation, then entry.word.
 *
 * @param maxGlosses Cap on how many senses are joined in, keeping the first
 * N — callers that let a learner tune this (table mode's question/answer
 * gloss-count settings) pass it; everyone else gets every sense, unchanged.
 */
export function buildGlossDisplay(entry: Word, maxGlosses = Infinity): string {
  const chosen = chosenGlosses(entry);
  if (chosen.length === 0) return entry.translation ?? entry.word ?? '';
  return chosen.slice(0, maxGlosses).join(' / ');
}

/**
 * If `input` matches a sense buildGlossDisplay(entry, maxGlosses) would have
 * cut off — past the visible window, but still one of the word's accepted
 * senses — that sense's text; otherwise null (no match at all, or the match
 * was already within the shown set).
 *
 * table-mode.ts's "Show the sense you typed" setting uses this so an answer
 * like "prove" for *probar* — correct, but its 3rd sense when only 2 show —
 * gets added to the revealed answer instead of the learner having no idea
 * why an answer that isn't on screen anywhere was accepted.
 */
export function extraMatchedGloss(
  input: string, entry: Word, maxGlosses: number, mode: AnswerMatchMode = 'fuzzy',
): string | null {
  const norm    = mode === 'strict' ? normaliseStrict : normalise;
  const attempt = norm(input);
  if (!attempt) return null;
  const chosen = chosenGlosses(entry);
  const idx    = chosen.findIndex(g => glossToTokens(g, norm).includes(attempt));
  return idx >= maxGlosses ? chosen[idx] : null;
}
