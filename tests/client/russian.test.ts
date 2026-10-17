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

/**
 * Every way a learner might spell a word in Latin letters is accepted, and — what Sudden Death relies
 * on — no prefix of it is ever judged unfinishable. The words cover every letter of the alphabet and
 * the clusters that make Latin spelling ambiguous (сч, щ, ч, ц, х, ж, ш, ё, й, ь, ъ).
 */
describe('Latin spellings, letter by letter', () => {
  const WORDS = [
    'что', 'хорошо', 'щука', 'счастье', 'цвет', 'отец', 'жизнь', 'ещё', 'ёлка', 'мой', 'объект', 'юг',
    'я', 'вы', 'эти', 'чашка', 'шесть', 'подъезд', 'фильм', 'брат', 'зачем', 'гиря', 'дождь', 'улица',
    'пожалуйста', 'здравствуйте', 'бабушка', 'новый', 'мышь', 'конец',
  ];
  // How each letter is commonly spelled; option k is taken for every letter at once (the last when
  // there are fewer), so each word gets a consistent "style" per variant.
  const SPELLINGS: Record<string, string[]> = {
    а: ['a'], б: ['b'], в: ['v', 'v', 'w'], г: ['g'], д: ['d'], е: ['e'], ё: ['yo', 'e', 'jo'], ж: ['zh'], з: ['z'],
    и: ['i'], й: ['y', 'i', 'j'], к: ['k'], л: ['l'], м: ['m'], н: ['n'], о: ['o'], п: ['p'], р: ['r'], с: ['s'],
    т: ['t'], у: ['u'], ф: ['f'], х: ['kh', 'h', 'x'], ц: ['ts', 'c', 'tz'], ч: ['ch'], ш: ['sh'],
    щ: ['shch', 'sch', 'shch'], ъ: ['', '"', ''], ы: ['y'], ь: ['', "'", '’'], э: ['e'], ю: ['yu', 'ju', 'yu'],
    я: ['ya', 'ja', 'ya'],
  };
  const spell = (w: string, k: number) =>
    [...w].map(ch => { const o = SPELLINGS[ch]; return o[Math.min(k, o.length - 1)]; }).join('');

  for (const w of WORDS) {
    const entry = word({ word: w, glosses: ['x'] });
    for (const k of [0, 1, 2]) {
      const typed = spell(w, k);
      it(`${w} as "${typed}": accepted, and every prefix still could be`, () => {
        expect(isReverseCorrect(typed, entry, 'russian')).toBe(true);
        expect(isReverseCorrect(typed.toUpperCase(), entry, 'russian')).toBe(true);
        for (let i = 1; i <= typed.length; i++) {
          expect(isReverseCorrectPrefix(typed.slice(0, i), entry, 'russian'), typed.slice(0, i)).toBe(true);
        }
      });
    }
    it(`${w} in Cyrillic: every prefix could still be it`, () => {
      for (let i = 1; i <= w.length; i++) {
        expect(isReverseCorrectPrefix(w.slice(0, i), entry, 'russian'), w.slice(0, i)).toBe(true);
      }
    });
  }

  it('never accepts another word\'s spelling', () => {
    for (const a of WORDS) {
      for (const b of WORDS) {
        if (a === b) continue;
        expect(isReverseCorrect(spell(b, 0), word({ word: a, glosses: ['x'] }), 'russian'), `${b} for ${a}`).toBe(false);
      }
    }
  });

  it('marks a wrong start wrong straight away', () => {
    const chto = word({ word: 'что', glosses: ['what'] });
    expect(isReverseCorrectPrefix('q', chto, 'russian')).toBe(false);
    expect(isReverseCorrectPrefix('cx', chto, 'russian')).toBe(false);
    expect(isReverseCorrectPrefix('chta', chto, 'russian')).toBe(false);
  });

  it('a finished answer ending in c means ц', () => {
    expect(isReverseCorrect('otec', word({ word: 'отец' }), 'russian')).toBe(true);
    expect(isReverseCorrect('otec', word({ word: 'отеч' }), 'russian')).toBe(false);
  });
});

describe('Latin typing in a mixed-language quiz', () => {
  it('follows each word\'s own language, not the quiz\'s', () => {
    const dom = word({ word: 'дом', language: 'russian' });
    const casa = word({ word: 'casa', language: 'spanish' });
    expect(isReverseCorrect('dom', dom, dom.language)).toBe(true);
    expect(isReverseCorrect('casa', casa, casa.language)).toBe(true);
    expect(isReverseCorrect('kasa', casa, casa.language)).toBe(false);
  });
});
