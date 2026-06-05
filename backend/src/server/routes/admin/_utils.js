/**
 * Shared utilities for admin routes.
 */

export const SUPPORTED_LANGUAGES = ['spanish', 'portuguese', 'italian', 'french'];

/**
 * Normalise and validate a language parameter.
 * Returns the lowercase language string if valid, or null if not.
 */
export function validateLanguage(lang) {
  const l = lang?.toLowerCase();
  return SUPPORTED_LANGUAGES.includes(l) ? l : null;
}
