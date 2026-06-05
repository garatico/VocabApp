/**
 * Shared utilities for admin routes.
 */

import { getSupportedLanguages } from '../../lib/vocab-loader.js';

/**
 * Normalise and validate a language parameter.
 * Returns the lowercase language string if valid, or null if not.
 */
export function validateLanguage(lang) {
  const l = lang?.toLowerCase();
  return getSupportedLanguages().includes(l) ? l : null;
}
