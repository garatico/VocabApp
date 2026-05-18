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
 * Check whether the user's input matches any accepted gloss for a word entry.
 */
export function isCorrect(input: string, entry: Word): boolean {
  const attempt = normalise(input);
  if (!attempt) return false;

  if (Array.isArray(entry.glosses) && entry.glosses.length > 0) {
    return entry.glosses.some(g => normalise(g) === attempt);
  }

  if (typeof entry.answers === 'string') {
    return entry.answers.split('|').some(a => normalise(a) === attempt);
  }

  return false;
}

/** Return prompt + hint for display. */
export function getDisplay(entry: Word): { prompt: string; hint: string | null } {
  return {
    prompt: entry.word,
    hint:   entry.display ?? null,
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

/** Return the accepted glosses for display. */
export function getGlosses(entry: Word): string[] {
  if (Array.isArray(entry.glosses)) return entry.glosses;
  if (typeof entry.answers === 'string') return entry.answers.split('|');
  return [];
}

/** Return a difficulty label for a word entry. */
export function getDifficultyLabel(entry: Word): string {
  const labels: Record<number, string> = {
    1: 'beginner', 2: 'elementary', 3: 'intermediate', 4: 'advanced', 5: 'expert',
  };
  return labels[entry.difficulty as number] ?? 'unknown';
}
