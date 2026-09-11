/**
 * languages.test.ts — the app's language list and per-language capabilities
 * (data/languages.ts)
 */
import { describe, it, expect } from 'vitest';
import {
  languageInfo, isoCode, supportsConjugation, conjugationUnavailableReason,
  flagUrl, LANGUAGES, LANGUAGE_NAMES,
} from '../../src/client/data/languages.js';

describe('languageInfo', () => {
  it('finds a known language by name', () => {
    expect(languageInfo('german').label).toBe('German');
  });

  it('falls back to Spanish for null/undefined/unknown', () => {
    expect(languageInfo(null).name).toBe('spanish');
    expect(languageInfo(undefined).name).toBe('spanish');
    expect(languageInfo('klingon').name).toBe('spanish');
  });
});

describe('isoCode', () => {
  it('returns the ISO 639-1 code for a known language', () => {
    expect(isoCode('japanese')).toBe('ja');
  });

  it('falls back to Spanish\'s code for an unknown language', () => {
    expect(isoCode('klingon')).toBe('es');
  });
});

describe('supportsConjugation', () => {
  it('is true for the four languages with conjugation data', () => {
    expect(supportsConjugation('spanish')).toBe(true);
    expect(supportsConjugation('french')).toBe(true);
    expect(supportsConjugation('german')).toBe(true);
    expect(supportsConjugation('dutch')).toBe(true);
  });

  it('is false for the two without any conjugation source', () => {
    expect(supportsConjugation('chinese')).toBe(false);
    expect(supportsConjugation('japanese')).toBe(false);
  });
});

describe('conjugationUnavailableReason', () => {
  it('is empty for a language that supports the mode', () => {
    expect(conjugationUnavailableReason('spanish')).toBe('');
  });

  it('names the language for one that does not', () => {
    expect(conjugationUnavailableReason('chinese')).toContain('Chinese');
  });
});

describe('flagUrl', () => {
  it('points at the flags directory', () => {
    expect(flagUrl('es')).toBe('/flags/es.svg');
  });
});

describe('LANGUAGES / LANGUAGE_NAMES', () => {
  it('every language has at least one flag option, and its default is one of them', () => {
    for (const lang of LANGUAGES) {
      expect(lang.flagOptions.length).toBeGreaterThan(0);
      expect(lang.flagOptions.map(o => o.country)).toContain(lang.flagCountry);
    }
  });

  it('LANGUAGE_NAMES mirrors LANGUAGES in the same order', () => {
    expect(LANGUAGE_NAMES).toEqual(LANGUAGES.map(l => l.name));
  });

  it('has no duplicate language names', () => {
    expect(new Set(LANGUAGE_NAMES).size).toBe(LANGUAGE_NAMES.length);
  });
});
