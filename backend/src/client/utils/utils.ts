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
 * Expand a single gloss into all matchable forms:
 * - strips parentheticals
 * - splits comma-separated alternatives ("a, an" → ["a", "an"])
 * Each token is normalised before returning.
 */
function glossToTokens(gloss: string): string[] {
  const cleaned = stripParens(gloss);
  return cleaned
    .split(/[,/]/)
    .map(t => normalise(t))
    .filter(Boolean);
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
 * Falls back to entry.display, then entry.word.
 */
export function buildGlossDisplay(entry: Word): string {
  const glosses = getGlosses(entry);
  if (glosses.length === 0) return entry.display ?? entry.word ?? '';
  if (entry.pos === 'verb') {
    const toForms = glosses.filter(g => g.toLowerCase().startsWith('to '));
    return (toForms.length > 0 ? toForms : glosses).join(' / ');
  }
  return glosses.join(' / ');
}

/** Return a difficulty label for a word entry. */
export function getDifficultyLabel(entry: Word): string {
  const labels: Record<number, string> = {
    1: 'beginner', 2: 'elementary', 3: 'intermediate', 4: 'advanced', 5: 'expert',
  };
  return labels[entry.difficulty as number] ?? 'unknown';
}
