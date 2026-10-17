// @vitest-environment jsdom
/**
 * match-mode.test.ts — Flexible/Strict answer matching per language (Settings.getMatchModeFor): the learner's
 * choice for a language, else that language's own default (Vietnamese: Strict), else the global setting.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { Settings } from '../../src/client/settings.ts';
import { languageInfo } from '../../src/client/data/languages.ts';

describe('Settings.getMatchModeFor', () => {
  beforeEach(() => localStorage.clear());

  it('follows the global setting for a language with no default of its own', () => {
    expect(Settings.getMatchModeFor('spanish')).toBe('fuzzy');
    localStorage.setItem('s_match_mode', 'strict');
    expect(Settings.getMatchModeFor('spanish')).toBe('strict');
  });

  it('is Strict for Vietnamese even when the global setting is Flexible', () => {
    expect(languageInfo('vietnamese').defaultMatchMode).toBe('strict');
    expect(Settings.getMatchModeFor('vietnamese')).toBe('strict');
  });

  it('lets the learner choose per language, over both defaults', () => {
    localStorage.setItem('s_match_mode_vietnamese', 'fuzzy');
    localStorage.setItem('s_match_mode_spanish', 'strict');
    expect(Settings.getMatchModeFor('vietnamese')).toBe('fuzzy');
    expect(Settings.getMatchModeFor('spanish')).toBe('strict');
    expect(Settings.getLanguageMatchMode('german')).toBeNull();
  });

  it('ignores a corrupt stored value and an unknown language', () => {
    localStorage.setItem('s_match_mode_vietnamese', 'banana');
    expect(Settings.getMatchModeFor('vietnamese')).toBe('strict');
    expect(Settings.getMatchModeFor('klingon')).toBe('fuzzy');      // not Spanish's (or anyone's) default
    expect(Settings.getMatchModeFor(null)).toBe('fuzzy');
  });
});
