/**
 * japanese-script.test.ts — classifyJapaneseScript
 * (src/client/utils/japanese-script.ts): which script a Japanese word is
 * written in, for the Script Type filter (Kanji/Katakana/Hiragana).
 */
import { describe, it, expect } from 'vitest';
import { classifyJapaneseScript } from '../../src/client/utils/japanese-script.js';

describe('classifyJapaneseScript', () => {
  it('classifies a pure-kanji word as kanji', () => {
    expect(classifyJapaneseScript('会社')).toBe('kanji');
  });

  it('classifies a pure-hiragana word as hiragana', () => {
    expect(classifyJapaneseScript('ある')).toBe('hiragana');
  });

  it('classifies a pure-katakana word as katakana', () => {
    expect(classifyJapaneseScript('コンピューター')).toBe('katakana');
  });

  it('treats the long-vowel mark and interpunct as part of a katakana word', () => {
    // Without them in KATAKANA_ONLY_RE, an ordinary loanword using either
    // would be misclassified as "mixed" and fall through to null.
    expect(classifyJapaneseScript('コーヒー')).toBe('katakana');
    expect(classifyJapaneseScript('スパゲッティ')).toBe('katakana');
  });

  it('classifies a mixed kanji+hiragana word (okurigana) as kanji', () => {
    // 掛ける is kanji 掛 + hiragana ける — the doc comment on
    // classifyJapaneseScript says this should read 'kanji', since the
    // kanji is the distinguishing content a learner has to know how to
    // read; the hiragana verb ending isn't what makes it hard.
    expect(classifyJapaneseScript('掛ける')).toBe('kanji');
  });

  it('returns null for a word with no Japanese script at all', () => {
    expect(classifyJapaneseScript('123')).toBeNull();
    expect(classifyJapaneseScript('hello')).toBeNull();
    expect(classifyJapaneseScript('')).toBeNull();
  });
});
