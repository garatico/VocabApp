/**
 * Data Validation Utilities
 *
 * Used by: corpus-builder, data-processor, vocab-practice
 */

import {
  POS_VALUES,
  CEFR_LEVELS,
  REGISTERS,
  DOMAINS,
  LANGUAGE_CODES
} from '../constants/index.js';

import {
  validateWord
} from '../schemas/word-schema.js';

/**
 * Validate an array of words against the Word schema
 * @param {Array} words - Array of word objects
 * @returns {Object} { valid: boolean, errors: string[], count: number }
 */
export function validateWordArray(words) {
  const errors = [];

  if (!Array.isArray(words)) {
    return {
      valid: false,
      errors: ['Input must be an array of words'],
      count: 0
    };
  }

  let validCount = 0;

  words.forEach((word, index) => {
    const result = validateWord(word);
    if (!result.valid) {
      result.errors.forEach(err => {
        errors.push(`Word[${index}] "${word?.word || 'unknown'}": ${err}`);
      });
    } else {
      validCount++;
    }
  });

  return {
    valid: errors.length === 0,
    errors,
    count: validCount,
    total: words.length
  };
}

/**
 * Validate a CEFR level
 * @param {string} level - Level to validate (A1, A2, B1, etc.)
 * @returns {boolean}
 */
export function isValidCEFRLevel(level) {
  return CEFR_LEVELS.includes(level);
}

/**
 * Validate a register
 * @param {string} register - Register to validate
 * @returns {boolean}
 */
export function isValidRegister(register) {
  return REGISTERS.includes(register);
}

/**
 * Validate a domain
 * @param {string} domain - Domain to validate
 * @returns {boolean}
 */
export function isValidDomain(domain) {
  return DOMAINS.includes(domain);
}

/**
 * Validate an array of domains
 * @param {Array<string>} domains - Domains to validate
 * @returns {Object} { valid: boolean, invalid: string[] }
 */
export function validateDomains(domains) {
  if (!Array.isArray(domains)) {
    return {
      valid: false,
      invalid: ['domains must be an array']
    };
  }

  const invalid = domains.filter(d => !isValidDomain(d));

  return {
    valid: invalid.length === 0,
    invalid
  };
}

/**
 * Validate a part of speech
 * @param {string} pos - POS to validate
 * @returns {boolean}
 */
export function isValidPOS(pos) {
  return pos === null || POS_VALUES.includes(pos);
}

/**
 * Validate a language code
 * @param {string} langCode - Language code (es, pt, it, fr)
 * @returns {boolean}
 */
export function isValidLanguageCode(langCode) {
  return LANGUAGE_CODES.includes(langCode);
}

/**
 * Validate a difficulty score
 * @param {number} difficulty - Difficulty (1-5)
 * @returns {boolean}
 */
export function isValidDifficulty(difficulty) {
  return typeof difficulty === 'number' && difficulty >= 1 && difficulty <= 5;
}

/**
 * Validate a rank (positive integer)
 * @param {number} rank - Rank value
 * @returns {boolean}
 */
export function isValidRank(rank) {
  return typeof rank === 'number' && rank >= 1 && Number.isInteger(rank);
}

/**
 * Validate that a word string is non-empty
 * @param {string} word - Word to validate
 * @returns {boolean}
 */
export function isValidWordString(word) {
  return typeof word === 'string' && word.trim().length > 0;
}

/**
 * Check if an object has all required fields
 * @param {Object} obj - Object to check
 * @param {Array<string>} requiredFields - Required field names
 * @returns {Object} { valid: boolean, missing: string[] }
 */
export function checkRequiredFields(obj, requiredFields) {
  const missing = requiredFields.filter(field => !(field in obj));

  return {
    valid: missing.length === 0,
    missing
  };
}

/**
 * Sanitize a word string (trim, lowercase)
 * @param {string} word - Word to sanitize
 * @returns {string}
 */
export function sanitizeWord(word) {
  return (word || '').trim().toLowerCase();
}

/**
 * Sanitize a gloss/definition (trim whitespace)
 * @param {string} gloss - Gloss to sanitize
 * @returns {string}
 */
export function sanitizeGloss(gloss) {
  return (gloss || '').trim();
}

/**
 * Remove duplicate glosses from a word
 * @param {Array<string>} glosses - Array of glosses
 * @returns {Array<string>}
 */
export function deduplicateGlosses(glosses) {
  if (!Array.isArray(glosses)) return [];
  const seen = new Set();
  return glosses.filter(g => {
    const sanitized = sanitizeGloss(g).toLowerCase();
    if (seen.has(sanitized)) return false;
    seen.add(sanitized);
    return true;
  });
}

/**
 * Comprehensive word validation with auto-fixes
 * @param {Object} word - Word object
 * @param {boolean} autoFix - Auto-fix common issues
 * @returns {Object} { valid: boolean, word: Object, errors: string[] }
 */
export function validateAndFixWord(word, autoFix = true) {
  const errors = [];
  let fixed = { ...word };

  // Sanitize word field
  if (isValidWordString(fixed.word)) {
    fixed.word = sanitizeWord(fixed.word);
  } else {
    errors.push('word must be a non-empty string');
  }

  // Sanitize display
  if (!isValidWordString(fixed.display)) {
    if (autoFix) {
      fixed.display = fixed.word;
    } else {
      errors.push('display must be a non-empty string');
    }
  }

  // Validate glosses
  if (!Array.isArray(fixed.glosses) || fixed.glosses.length === 0) {
    errors.push('glosses must be a non-empty array');
  } else if (autoFix) {
    fixed.glosses = deduplicateGlosses(fixed.glosses);
  }

  // Validate POS
  if (fixed.pos && !isValidPOS(fixed.pos)) {
    if (autoFix) {
      fixed.pos = null;
    } else {
      errors.push(`pos must be one of: ${POS_VALUES.join(', ')} or null`);
    }
  }

  // Validate difficulty
  if (fixed.difficulty && !isValidDifficulty(fixed.difficulty)) {
    if (autoFix) {
      fixed.difficulty = 3; // default
    } else {
      errors.push('difficulty must be a number between 1 and 5');
    }
  }

  // Validate frequency band
  if (fixed.frequency?.band && !isValidCEFRLevel(fixed.frequency.band)) {
    if (autoFix) {
      fixed.frequency.band = 'B1'; // default
    } else {
      errors.push(`frequency.band must be one of: ${CEFR_LEVELS.join(', ')}`);
    }
  }

  // Validate domains
  if (Array.isArray(fixed.domains)) {
    const domainCheck = validateDomains(fixed.domains);
    if (!domainCheck.valid) {
      if (autoFix) {
        fixed.domains = fixed.domains.filter(d => isValidDomain(d));
        if (fixed.domains.length === 0) {
          fixed.domains = ['general'];
        }
      } else {
        errors.push(`invalid domains: ${domainCheck.invalid.join(', ')}`);
      }
    }
  }

  // Validate register
  if (fixed.register && !isValidRegister(fixed.register)) {
    if (autoFix) {
      fixed.register = 'neutral'; // default
    } else {
      errors.push(`register must be one of: ${REGISTERS.join(', ')}`);
    }
  }

  return {
    valid: errors.length === 0,
    word: fixed,
    errors
  };
}

export default {
  validateWordArray,
  isValidCEFRLevel,
  isValidRegister,
  isValidDomain,
  validateDomains,
  isValidPOS,
  isValidLanguageCode,
  isValidDifficulty,
  isValidRank,
  isValidWordString,
  checkRequiredFields,
  sanitizeWord,
  sanitizeGloss,
  deduplicateGlosses,
  validateAndFixWord
};
