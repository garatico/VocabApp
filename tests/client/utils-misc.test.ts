/**
 * utils-misc.test.ts — the exports of src/client/utils/utils.ts that
 * answers.test.ts/answer-match.test.ts don't already cover: capitalize,
 * displayWord, extraMatchedGloss, and the Chinese (romanizedScript) display
 * logic (chineseWordText/slotText/slotMatches). All pure — no DOM or
 * localStorage needed.
 */
import { describe, it, expect } from 'vitest';
import {
  capitalize, displayWord, extraMatchedGloss, chineseWordText, slotText, slotMatches,
  primaryGlossForHint, isFunctionWord, DEFAULT_CHINESE_DISPLAY, type ChineseDisplay,
} from '../../src/client/utils/utils.js';
import type { Word } from '../../src/client/types.js';

const word = (over: Record<string, unknown>): Word => over as unknown as Word;

describe('capitalize', () => {
  it('uppercases only the first letter', () => {
    expect(capitalize('spanish')).toBe('Spanish');
  });

  it('leaves an already-capitalized string alone', () => {
    expect(capitalize('Spanish')).toBe('Spanish');
  });

  it('is a no-op on an empty string', () => {
    expect(capitalize('')).toBe('');
  });
});

describe('displayWord', () => {
  it('returns the bare word when there is no disambiguator', () => {
    expect(displayWord(word({ word: 'tener' }))).toBe('tener');
  });

  it('appends the disambiguator in parentheses', () => {
    expect(displayWord(word({ word: 'haber', disambiguator: 'auxiliary' }))).toBe('haber (auxiliary)');
  });
});

describe('primaryGlossForHint', () => {
  it('returns just the first chosen gloss, no " / " join', () => {
    const de = word({ word: 'de', glosses: ['of', 'from'] });
    expect(primaryGlossForHint(de)).toBe('of');
  });

  it('never carries a meaning note, unlike buildGlossDisplay', () => {
    const trabajar = word({
      word: 'trabajar', glosses: ['work'], meaningDisambiguators: { work: 'function' },
    });
    expect(primaryGlossForHint(trabajar)).toBe('work');
  });

  it('narrows to "to X" forms for a verb, same as buildGlossDisplay', () => {
    const probar = word({ word: 'probar', pos: 'verb', glosses: ['to test', 'to try', 'to prove'] });
    expect(primaryGlossForHint(probar)).toBe('to test');
  });

  it('falls back to translation, then word, when there are no glosses', () => {
    expect(primaryGlossForHint(word({ word: 'x', glosses: [], translation: 'y' }))).toBe('y');
    expect(primaryGlossForHint(word({ word: 'x', glosses: [] }))).toBe('x');
  });
});

describe('extraMatchedGloss', () => {
  const probar = word({ word: 'probar', pos: 'verb', glosses: ['to test', 'to try', 'to prove'] });

  it('returns the matched sense when it falls past the visible window', () => {
    // Only 2 of 3 "to X" senses shown; "prove" is the 3rd (index 2).
    expect(extraMatchedGloss('prove', probar, 2)).toBe('to prove');
  });

  it('returns null when the match is already within the shown set', () => {
    expect(extraMatchedGloss('test', probar, 2)).toBeNull();
  });

  it('returns null for an answer that matches nothing at all', () => {
    expect(extraMatchedGloss('nonsense', probar, 2)).toBeNull();
  });

  it('returns null for blank input', () => {
    expect(extraMatchedGloss('   ', probar, 2)).toBeNull();
  });

  it('respects strict mode: an accent-insensitive match in fuzzy mode is no match at all in strict', () => {
    const entry = word({ word: 'x', glosses: ['a', 'está'] });
    // Fuzzy: "esta" (no accent) matches the 2nd (index 1) sense, past the
    // 1-gloss visible window, so it's reported as an extra match.
    expect(extraMatchedGloss('esta', entry, 1, 'fuzzy')).toBe('está');
    // Strict: the same input never matches "está" at all — accents count —
    // so there's no sense to report as extra.
    expect(extraMatchedGloss('esta', entry, 1, 'strict')).toBeNull();
  });
});

describe('chineseWordText', () => {
  const de = word({ word: '的', linguistic: { ipa: 'de' } });

  it('returns the word untouched for a non-romanized-script language', () => {
    expect(chineseWordText(word({ word: 'perro' }), 'spanish', DEFAULT_CHINESE_DISPLAY)).toBe('perro');
  });

  it('returns the word untouched when lang is not given', () => {
    expect(chineseWordText(de, null, DEFAULT_CHINESE_DISPLAY)).toBe('的');
  });

  it('shows characters annotated with pinyin when characters are primary', () => {
    expect(chineseWordText(de, 'chinese', DEFAULT_CHINESE_DISPLAY)).toBe('的 (de)');
  });

  it('shows pinyin annotated with characters when pinyin is primary', () => {
    const display: ChineseDisplay = { ...DEFAULT_CHINESE_DISPLAY, chineseScript: 'pinyin' };
    expect(chineseWordText(de, 'chinese', display)).toBe('de (的)');
  });

  it('shows only the primary script when showBothScripts is off', () => {
    const display: ChineseDisplay = { ...DEFAULT_CHINESE_DISPLAY, showBothScripts: false };
    expect(chineseWordText(de, 'chinese', display)).toBe('的');
  });

  it('falls back to the character form, unannotated, when pinyin is primary but missing', () => {
    const noPinyin = word({ word: '的', linguistic: {} });
    const display: ChineseDisplay = { ...DEFAULT_CHINESE_DISPLAY, chineseScript: 'pinyin' };
    expect(chineseWordText(noPinyin, 'chinese', display)).toBe('的');
  });
});

describe('slotText', () => {
  const de = word({ word: '的', translation: 'already', glosses: ['already'], linguistic: { ipa: 'de' } });

  it('word slot delegates to chineseWordText', () => {
    expect(slotText(de, 'word', 'chinese', DEFAULT_CHINESE_DISPLAY)).toBe('的 (de)');
  });

  it('english slot appends the pinyin reading when showPinyinGloss is on', () => {
    expect(slotText(de, 'english', 'chinese', DEFAULT_CHINESE_DISPLAY)).toBe('already (de)');
  });

  it('english slot omits the pinyin reading when showPinyinGloss is off', () => {
    const display: ChineseDisplay = { ...DEFAULT_CHINESE_DISPLAY, showPinyinGloss: false };
    expect(slotText(de, 'english', 'chinese', display)).toBe('already');
  });

  it('english slot is unaffected by Chinese display options for a non-romanized language', () => {
    const perro = word({ word: 'perro', translation: 'dog', glosses: ['dog'] });
    expect(slotText(perro, 'english', 'spanish', DEFAULT_CHINESE_DISPLAY)).toBe('dog');
  });

  it('respects glossCount for the english slot', () => {
    const w = word({ word: 'x', glosses: ['a', 'b', 'c'] });
    expect(slotText(w, 'english', 'spanish', DEFAULT_CHINESE_DISPLAY, 2)).toBe('a / b');
  });
});

describe('isFunctionWord', () => {
  it('is true only when is_function_word is truthy', () => {
    expect(isFunctionWord(word({ word: 'は', is_function_word: true }))).toBe(true);
    expect(isFunctionWord(word({ word: '猫', is_function_word: false }))).toBe(false);
    expect(isFunctionWord(word({ word: '猫' }))).toBe(false); // absent — same as false, not "unknown"
  });
});

describe('function word marker (chineseWordText / slotText)', () => {
  // は: topic marker, no real translation — the flagship case this
  // feature exists for. わ is its romanized reading.
  const wa = word({
    word: 'は', translation: 'topic marker', glosses: ['topic marker'],
    linguistic: { ipa: 'wa' }, is_function_word: true,
  });
  // 会社 ("company"): an ordinary headword, never bracketed regardless of
  // the marker setting — the negative case that proves this isn't just
  // bracketing every romanizedScript word.
  const kaisha = word({
    word: '会社', translation: 'company', glosses: ['company'],
    linguistic: { ipa: 'kaisha' }, is_function_word: false,
  });

  it('"word" brackets the target-language slot, not the English side', () => {
    const display: ChineseDisplay = { ...DEFAULT_CHINESE_DISPLAY, functionWordMarker: 'word' };
    expect(chineseWordText(wa, 'japanese', display)).toBe('[は] (wa)');
    expect(slotText(wa, 'english', 'japanese', display)).toBe('topic marker (wa)');
  });

  it('"meaning" (the default) brackets the English side, not the word', () => {
    expect(chineseWordText(wa, 'japanese', DEFAULT_CHINESE_DISPLAY)).toBe('は (wa)');
    expect(slotText(wa, 'english', 'japanese', DEFAULT_CHINESE_DISPLAY)).toBe('[topic marker] (wa)');
  });

  it('"both" brackets both sides', () => {
    const display: ChineseDisplay = { ...DEFAULT_CHINESE_DISPLAY, functionWordMarker: 'both' };
    expect(chineseWordText(wa, 'japanese', display)).toBe('[は] (wa)');
    expect(slotText(wa, 'english', 'japanese', display)).toBe('[topic marker] (wa)');
  });

  it('"off" brackets neither side', () => {
    const display: ChineseDisplay = { ...DEFAULT_CHINESE_DISPLAY, functionWordMarker: 'off' };
    expect(chineseWordText(wa, 'japanese', display)).toBe('は (wa)');
    expect(slotText(wa, 'english', 'japanese', display)).toBe('topic marker (wa)');
  });

  it('never brackets an ordinary headword, under any marker setting', () => {
    for (const functionWordMarker of ['off', 'word', 'meaning', 'both'] as const) {
      const display: ChineseDisplay = { ...DEFAULT_CHINESE_DISPLAY, functionWordMarker };
      expect(chineseWordText(kaisha, 'japanese', display)).toBe('会社 (kaisha)');
      expect(slotText(kaisha, 'english', 'japanese', display)).toBe('company (kaisha)');
    }
  });

  it('word-side bracket wraps only the primary script, not the parenthetical', () => {
    const display: ChineseDisplay = { ...DEFAULT_CHINESE_DISPLAY, functionWordMarker: 'word', chineseScript: 'pinyin' };
    // pinyin/romaji primary now — the bracket should follow whichever
    // script is primary, not stay pinned to the character form.
    expect(chineseWordText(wa, 'japanese', display)).toBe('[wa] (は)');
  });
});

describe('slotMatches', () => {
  const de = word({ word: '的', translation: 'already', glosses: ['already'], linguistic: { ipa: 'de' } });

  it('english slot matches a correct gloss', () => {
    expect(slotMatches('already', de, 'english')).toBe(true);
  });

  it('word slot accepts either script when showBothScripts is on', () => {
    expect(slotMatches('de', de, 'word', 'fuzzy', 'chinese')).toBe(true);
    expect(slotMatches('的', de, 'word', 'fuzzy', 'chinese')).toBe(true);
  });

  it('word slot rejects the non-primary script when showBothScripts is off', () => {
    const display: ChineseDisplay = { ...DEFAULT_CHINESE_DISPLAY, showBothScripts: false, chineseScript: 'characters' };
    expect(slotMatches('de', de, 'word', 'fuzzy', 'chinese', display)).toBe(false);
    expect(slotMatches('的', de, 'word', 'fuzzy', 'chinese', display)).toBe(true);
  });

  it('word slot for a non-romanized language matches the plain word', () => {
    const perro = word({ word: 'perro', translation: 'dog', glosses: ['dog'] });
    expect(slotMatches('perro', perro, 'word', 'fuzzy', 'spanish')).toBe(true);
    expect(slotMatches('gato', perro, 'word', 'fuzzy', 'spanish')).toBe(false);
  });
});
