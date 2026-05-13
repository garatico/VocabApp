/**
 * Normalise a string for loose comparison:
 * trim whitespace, collapse internal spaces, lowercase, strip accents.
 */
function normalise(str = '') {
  return str
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // strip diacritics
    .replace(/\s+/g, ' ');
}

/**
 * Check whether the user's input matches any accepted gloss for a word entry.
 *
 * The new schema stores accepted answers in `entry.glosses` (string[]).
 * Each gloss is checked with loose normalisation so accent errors and
 * leading/trailing whitespace are forgiven.
 *
 * Falls back to the old `entry.answers` pipe-delimited string if present,
 * so existing in-progress quizzes don't break during a data migration.
 *
 * @param {string}  input  - raw text the user typed
 * @param {object}  entry  - word object from spanish.json
 * @returns {boolean}
 */
export function isCorrect(input, entry) {
  const attempt = normalise(input);
  if (!attempt) return false;

  // ── New schema: glosses array ──────────────────────────
  if (Array.isArray(entry.glosses) && entry.glosses.length > 0) {
    return entry.glosses.some(g => normalise(g) === attempt);
  }

  // ── Legacy fallback: pipe-delimited answers string ─────
  if (typeof entry.answers === 'string') {
    return entry.answers.split('|').some(a => normalise(a) === attempt);
  }

  return false;
}

/**
 * Return the string to display as the prompt for a word entry.
 *
 * New schema: always use `entry.word` (the target-language form).
 * `entry.display` is the human-readable gloss shown as a subtitle/hint,
 * not the primary prompt — so we expose both separately.
 *
 * @param {object} entry
 * @returns {{ prompt: string, hint: string|null }}
 */
export function getDisplay(entry) {
  return {
    prompt: entry.word,
    hint:   entry.display ?? null,
  };
}

/**
 * Return a short label for the part of speech badge.
 * Falls back gracefully if pos is missing.
 *
 * @param {object} entry
 * @returns {string}
 */
export function getPosLabel(entry) {
  const map = {
    verb:        'verb',
    noun:        'noun',
    adjective:   'adj',
    adverb:      'adv',
    pronoun:     'pron',
    preposition: 'prep',
    conjunction: 'conj',
    article:     'art',
    interjection:'interj',
  };
  return map[entry.pos] ?? entry.pos ?? '';
}

/**
 * Return the accepted glosses for display (e.g. hint reveals, table headers).
 *
 * @param {object} entry
 * @returns {string[]}
 */
export function getGlosses(entry) {
  if (Array.isArray(entry.glosses)) return entry.glosses;
  if (typeof entry.answers === 'string') return entry.answers.split('|');
  return [];
}

/**
 * Return a difficulty label for a word entry.
 *
 * @param {object} entry
 * @returns {string}
 */
export function getDifficultyLabel(entry) {
  const labels = { 1: 'beginner', 2: 'elementary', 3: 'intermediate', 4: 'advanced', 5: 'expert' };
  return labels[entry.difficulty] ?? 'unknown';
}