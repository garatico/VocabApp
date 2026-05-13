/**
 * CEFR (Common European Framework of Reference) Language Levels
 *
 * A1: Beginner - absolute beginner
 * A2: Elementary - false beginner
 * B1: Intermediate - intermediate
 * B2: Upper Intermediate - upper intermediate
 * C1: Advanced - advanced
 * C2: Proficient - proficient/native
 */

export const CEFR_LEVELS = [
  'A1',
  'A2',
  'B1',
  'B2',
  'C1',
  'C2'
];

export const CEFR_LABELS = {
  A1: 'Beginner',
  A2: 'Elementary',
  B1: 'Intermediate',
  B2: 'Upper Intermediate',
  C1: 'Advanced',
  C2: 'Proficient'
};

export const CEFR_DESCRIPTIONS = {
  A1: 'Can understand and use very basic everyday expressions',
  A2: 'Can handle simple everyday tasks',
  B1: 'Can understand main points of clear standard input',
  B2: 'Can interact with native speakers with ease',
  C1: 'Can understand long, demanding texts',
  C2: 'Has near-native proficiency'
};

/**
 * Get CEFR level index (for ordering/comparison)
 * @param {string} level - CEFR level (A1-C2)
 * @returns {number} Index 0-5
 */
export const cefrIndex = (level) => CEFR_LEVELS.indexOf(level);

/**
 * Check if level1 is easier/lower than level2
 * @param {string} level1
 * @param {string} level2
 * @returns {boolean}
 */
export const isEasierThan = (level1, level2) => cefrIndex(level1) < cefrIndex(level2);

export const isValidCEFR = (level) => CEFR_LEVELS.includes(level);

export default {
  CEFR_LEVELS,
  CEFR_LABELS,
  CEFR_DESCRIPTIONS,
  cefrIndex,
  isEasierThan,
  isValidCEFR
};
