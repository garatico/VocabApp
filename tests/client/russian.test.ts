/**
 * russian.test.ts — Russian answers typed in Cyrillic or Latin letters, and the stress-marked display.
 */
import { describe, it, expect } from 'vitest';
import { cyrillicToLatin, latinKey, latinTargets } from '../../src/shared/russian-translit.js';
import {
  isReverseCorrect, isReverseCorrectStrict, isReverseCorrectPrefix, shownWord, displayWord,
} from '../../src/client/utils/utils.js';
import type { Word } from '../../src/client/types.js';

const word = (over: Record<string, unknown>): Word => ({ linguistic: {}, ...over }) as unknown as Word;

describe('transliteration', () => {
  it('spells Russian in Latin letters, dropping stress marks and signs', () => {
    expect(cyrillicToLatin('говори́ть')).toBe('govorit');
    expect(cyrillicToLatin('щука')).toBe('shchuka');
    expect(cyrillicToLatin('ещё')).toBe('eshchyo');
    expect(cyrillicToLatin('ещё', 'e')).toBe('eshche');
  });

  it('folds the common Latin variants onto one key', () => {
    expect(latinKey('xorosho')).toBe(latinKey('khorosho'));
    expect(latinKey('horosho')).toBe(latinKey('khorosho'));
    expect(latinKey('ja')).toBe(latinKey('ya'));
    expect(latinKey('cvet')).toBe(latinKey('tsvet'));
    expect(latinKey('schastye')).toBe(latinKey('shchastye'));
    expect(latinKey("den'")).toBe('den');
  });

  it('offers both choices for ё and й', () => {
    expect(latinTargets('мой')).toEqual(expect.arrayContaining(['moy', 'moi']));
    expect(latinTargets('ещё')).toEqual(expect.arrayContaining(['eshchyo', 'eshche']));
  });
});

describe('Russian answers', () => {
  const khorosho = word({ word: 'хорошо', pos: 'adverb', glosses: ['well'] });
  const schastye = word({ word: 'счастье', pos: 'noun', glosses: ['happiness'] });

  it('accepts the Cyrillic word, with or without ё', () => {
    expect(isReverseCorrect('хорошо', khorosho, 'russian')).toBe(true);
    expect(isReverseCorrect('еще', word({ word: 'ещё' }), 'russian')).toBe(true);
  });

  it('accepts Latin letters, however the sounds are spelled', () => {
    for (const typed of ['khorosho', 'horosho', 'xorosho', 'Khorosho']) {
      expect(isReverseCorrect(typed, khorosho, 'russian')).toBe(true);
    }
    expect(isReverseCorrect("schast'e", schastye, 'russian')).toBe(true);
    expect(isReverseCorrect('moi', word({ word: 'мой' }), 'russian')).toBe(true);
    expect(isReverseCorrect('plokho', khorosho, 'russian')).toBe(false);
  });

  it('accepts Latin letters in Strict mode too, and as a prefix while typing', () => {
    expect(isReverseCorrectStrict('khorosho', khorosho, 'russian')).toBe(true);
    expect(isReverseCorrectPrefix('khoro', khorosho, 'russian')).toBe(true);
    expect(isReverseCorrectPrefix('kha', khorosho, 'russian')).toBe(false);
  });

  it('does not accept Latin letters for other languages', () => {
    expect(isReverseCorrect('khorosho', khorosho, 'spanish')).toBe(false);
  });
});

describe('stress-marked display', () => {
  it('shows the stressed form when the data has one, and the word otherwise', () => {
    expect(shownWord(word({ word: 'говорить', linguistic: { stressed: 'говори́ть' } }))).toBe('говори́ть');
    expect(shownWord(word({ word: 'дом' }))).toBe('дом');
    expect(displayWord(word({ word: 'книга', linguistic: { stressed: 'кни́га' } }))).toBe('кни́га');
  });

  it('still matches the unmarked word', () => {
    const govorit = word({ word: 'говорить', linguistic: { stressed: 'говори́ть' } });
    expect(isReverseCorrectStrict('говорить', govorit, 'russian')).toBe(true);
  });
});
