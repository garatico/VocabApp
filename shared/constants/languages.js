/**
 * Supported Languages Configuration
 */

export const LANGUAGES = {
  spanish: {
    code: 'es',
    name: 'Spanish',
    nativeName: 'Español',
    locale: 'es-ES',
    flag: '🇪🇸'
  },
  portuguese: {
    code: 'pt',
    name: 'Portuguese',
    nativeName: 'Português',
    locale: 'pt-PT',
    flag: '🇵🇹'
  },
  italian: {
    code: 'it',
    name: 'Italian',
    nativeName: 'Italiano',
    locale: 'it-IT',
    flag: '🇮🇹'
  },
  french: {
    code: 'fr',
    name: 'French',
    nativeName: 'Français',
    locale: 'fr-FR',
    flag: '🇫🇷'
  }
};

export const LANGUAGE_CODES = Object.values(LANGUAGES).map(l => l.code);
export const LANGUAGE_KEYS = Object.keys(LANGUAGES);

export const isValidLanguage = (lang) => LANGUAGE_KEYS.includes(lang) || LANGUAGE_CODES.includes(lang);

/**
 * Get language config by key or code
 * @param {string} identifier - Language key (spanish) or code (es)
 * @returns {Object|null}
 */
export const getLanguage = (identifier) => {
  return LANGUAGES[identifier] || Object.values(LANGUAGES).find(l => l.code === identifier) || null;
};

export default {
  LANGUAGES,
  LANGUAGE_CODES,
  LANGUAGE_KEYS,
  isValidLanguage,
  getLanguage
};
