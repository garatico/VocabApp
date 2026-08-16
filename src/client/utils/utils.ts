import type { Word } from '../types.js';

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
 * Check whether the user's input matches the target-language word.
 * Used in reverse direction (English shown, user types the foreign word).
 * Accent-insensitive by default (same leniency as forward direction).
 */
export function isReverseCorrect(input: string, entry: Word): boolean {
  const attempt = normalise(input);
  if (!attempt) return false;
  // Accept the canonical word form and the infinitive (if it differs, e.g. "hablar" for "habla")
  const targets = ([entry.word, entry.linguistic?.infinitive] as (string | null | undefined)[])
    .filter((w): w is string => typeof w === 'string' && w.length > 0)
    .map(w => normalise(w));
  return targets.includes(attempt);
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

export function isReverseCorrectStrict(input: string, entry: Word): boolean {
  const attempt = normaliseStrict(input);
  if (!attempt) return false;
  const targets = ([entry.word, entry.linguistic?.infinitive] as (string | null | undefined)[])
    .filter((w): w is string => typeof w === 'string' && w.length > 0)
    .map(w => normaliseStrict(w));
  return targets.includes(attempt);
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
 * Build the human-readable gloss string for a word entry.
 * - Verbs: filter to "to X" forms and join with " / "  (e.g. "to speak / to talk")
 * - Everything else: join all glosses with " / "        (e.g. "of / from")
 * Falls back to entry.translation, then entry.word.
 */
export function buildGlossDisplay(entry: Word): string {
  const glosses = getGlosses(entry);
  if (glosses.length === 0) return entry.translation ?? entry.word ?? '';
  if (entry.pos === 'verb') {
    const toForms = glosses.filter(g => g.toLowerCase().startsWith('to '));
    return (toForms.length > 0 ? toForms : glosses).join(' / ');
  }
  return glosses.join(' / ');
}
