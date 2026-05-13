/**
 * Word Schema Definition
 *
 * Defines the structure of a word object used throughout the vocab-app.
 * This is the single source of truth for word data structure.
 *
 * Used by:
 * - vocab-practice: reads and displays
 * - corpus-builder: writes initial glosses, POS
 * - data-processor: enriches with CEFR, difficulty, domains
 * - backend: serves to clients
 */

/**
 * @typedef {Object} Word
 * @property {number} rank - Word frequency rank (1 = most common)
 * @property {string} word - The word itself (lowercase)
 * @property {string} display - User-friendly display (can include translations/definitions)
 * @property {string|null} pos - Part of speech (noun, verb, adjective, etc.)
 * @property {string[]} glosses - English definitions/translations
 * @property {number} difficulty - Difficulty score (1-5, where 1=easiest)
 * @property {Object} frequency - Frequency information
 * @property {string} frequency.band - CEFR band (A1, A2, B1, B2, C1, C2)
 * @property {number} frequency.rank - Frequency rank within CEFR band
 * @property {string[]} domains - Semantic domains (general, business, medical, etc.)
 * @property {string} register - Register level (neutral, formal, informal, colloquial, technical)
 * @property {Object} linguistic - Linguistic metadata
 * @property {string|null} linguistic.gender - Grammatical gender (for Romance languages)
 * @property {string|null} linguistic.number - Singular/plural forms
 * @property {string[]} linguistic.forms - Related word forms
 * @property {string|null} linguistic.etymology - Word etymology
 * @property {string[]} examples - Example usage sentences
 * @property {Object} metadata - Miscellaneous metadata
 * @property {string} metadata.language - ISO language code (es, pt, it, fr)
 * @property {string} metadata.source - Data source (wiktionary, news_corpus, manual)
 * @property {string} metadata.addedAt - ISO timestamp when word was added
 * @property {string|null} metadata.updatedAt - ISO timestamp of last update
 */

/**
 * Minimal word object (required fields only)
 * @type {Word}
 */
export const MIN_WORD = {
  rank: 1,
  word: 'example',
  display: 'example',
  pos: null,
  glosses: ['an example'],
  difficulty: 3,
  frequency: {
    band: 'A1',
    rank: 1
  },
  domains: ['general'],
  register: 'neutral',
  linguistic: {
    gender: null,
    number: null,
    forms: [],
    etymology: null
  },
  examples: [],
  metadata: {
    language: 'es',
    source: 'manual',
    addedAt: new Date().toISOString(),
    updatedAt: null
  }
};

/**
 * Validate that an object conforms to the Word schema
 * @param {any} word - Object to validate
 * @returns {Object} { valid: boolean, errors: string[] }
 */
export function validateWord(word) {
  const errors = [];

  if (!word || typeof word !== 'object') {
    errors.push('Word must be an object');
    return { valid: false, errors };
  }

  // Required fields
  if (typeof word.rank !== 'number' || word.rank < 1) {
    errors.push('rank must be a positive number');
  }
  if (typeof word.word !== 'string' || word.word.trim() === '') {
    errors.push('word must be a non-empty string');
  }
  if (typeof word.display !== 'string' || word.display.trim() === '') {
    errors.push('display must be a non-empty string');
  }
  if (!Array.isArray(word.glosses) || word.glosses.length === 0) {
    errors.push('glosses must be a non-empty array');
  }
  if (typeof word.difficulty !== 'number' || word.difficulty < 1 || word.difficulty > 5) {
    errors.push('difficulty must be a number between 1 and 5');
  }

  // Frequency object
  if (!word.frequency || typeof word.frequency !== 'object') {
    errors.push('frequency must be an object');
  } else {
    if (typeof word.frequency.band !== 'string') {
      errors.push('frequency.band must be a string');
    }
    if (typeof word.frequency.rank !== 'number') {
      errors.push('frequency.rank must be a number');
    }
  }

  // Arrays
  if (!Array.isArray(word.domains)) {
    errors.push('domains must be an array');
  }
  if (typeof word.register !== 'string') {
    errors.push('register must be a string');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Create a new word from partial data (fill in defaults)
 * @param {Partial<Word>} partial - Partial word object
 * @returns {Word} Complete word object with defaults
 */
export function createWord(partial) {
  return {
    ...MIN_WORD,
    ...partial,
    frequency: {
      ...MIN_WORD.frequency,
      ...(partial?.frequency || {})
    },
    linguistic: {
      ...MIN_WORD.linguistic,
      ...(partial?.linguistic || {})
    },
    metadata: {
      ...MIN_WORD.metadata,
      ...(partial?.metadata || {})
    }
  };
}

export default {
  MIN_WORD,
  validateWord,
  createWord
};
