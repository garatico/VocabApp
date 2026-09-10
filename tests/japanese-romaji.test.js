/**
 * tests/japanese-romaji.test.js
 *
 * Unit tests for japaneseRomaji (src/server/lib/japanese-romaji.ts) — romaji
 * computed at DB-load time from a word's stored hiragana reading (or from
 * the word itself, when it's already plain kana).
 */
import { describe, it, expect } from 'vitest';
import { japaneseRomaji } from '../src/server/lib/japanese-romaji.js';

describe('japaneseRomaji', () => {
  it('romanizes a word using its stored hiragana reading', () => {
    // 会社 (company) read from its stored reading かいしゃ, not from the
    // kanji itself, since wanakana can't romanize kanji directly.
    expect(japaneseRomaji('会社', 'かいしゃ')).toBe('kaisha');
  });

  it('romanizes a plain-kana word directly when it has no stored reading', () => {
    // A word that's already plain kana (a particle, a katakana loanword)
    // has nothing to look up — it already *is* its own reading.
    expect(japaneseRomaji('ある', null)).toBe('aru');
    expect(japaneseRomaji('コーヒー', null)).toBe('koohii');
  });

  it('returns empty rather than mixed kanji+romaji for a kanji word with no stored reading', () => {
    // Regression for the bug found by audit: a kanji-containing word can
    // legitimately have no stored reading (e.g. via the admin Word
    // Editor's generic, unvalidated editIPA field), and wanakana leaves
    // kanji untouched — romanizing the raw word directly used to produce
    // garbage like "掛keru". The fix returns '' instead of falling
    // through to wanakana.toRomaji() on a kanji string.
    expect(japaneseRomaji('掛ける', null)).toBe('');
    expect(japaneseRomaji('会社', null)).toBe('');
    expect(japaneseRomaji('会社', '')).toBe('');
  });

  it('applies the hand-curated overrides for は/を/へ regardless of reading', () => {
    // These three particles are pronounced differently (wa/o/e) than
    // their literal kana reading (ha/wo/he) when curated as the
    // grammatical particle — a finite exception no generic converter can
    // resolve from the bare kana alone.
    expect(japaneseRomaji('は', null)).toBe('wa');
    expect(japaneseRomaji('を', null)).toBe('o');
    expect(japaneseRomaji('へ', null)).toBe('e');
  });

  it('the particle overrides win even if a reading were somehow present', () => {
    expect(japaneseRomaji('は', 'は')).toBe('wa');
  });
});
