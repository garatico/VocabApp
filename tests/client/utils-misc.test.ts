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
  primaryGlossForHint, isFunctionWord, grammarHint, genderArticle, genderKey, wordAndAnnotation,
  DEFAULT_CHINESE_DISPLAY, type ChineseDisplay,
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

  it('appends the grammar hint, spelled out by default, for a closed-class determiner', () => {
    const un = word({ word: 'un', linguistic: { gender: 'masculine', grammatical_number: 'singular' } });
    expect(displayWord(un)).toBe('un (masculine, singular)');
  });

  it('abbreviates the grammar hint when asked', () => {
    const un = word({ word: 'un', linguistic: { gender: 'masculine', grammatical_number: 'singular' } });
    expect(displayWord(un, true, true)).toBe('un (masc., sing.)');
  });

  it('never shows a grammar hint for an ordinary noun, even with a gender', () => {
    const casa = word({ word: 'casa', linguistic: { gender: 'feminine', plural: 'casas' } });
    expect(displayWord(casa)).toBe('casa');
  });

  it('joins grammar hint and disambiguator when both apply', () => {
    const w = word({
      word: 'un', disambiguator: 'numeral', linguistic: { gender: 'masculine', grammatical_number: 'singular' },
    });
    expect(displayWord(w)).toBe('un (masculine, singular; numeral)');
  });

  it('still shows the grammar hint when show=false hides the disambiguator', () => {
    const w = word({
      word: 'un', disambiguator: 'numeral', linguistic: { gender: 'masculine', grammatical_number: 'singular' },
    });
    expect(displayWord(w, false)).toBe('un (masculine, singular)');
  });
});

describe('grammarHint', () => {
  it('is null with no grammatical_number, even alongside a gender', () => {
    expect(grammarHint(word({ linguistic: { gender: 'feminine' } }))).toBeNull();
  });

  it('spells gender and number out by default', () => {
    expect(grammarHint(word({ linguistic: { gender: 'feminine', grammatical_number: 'plural' } }))).toBe('feminine, plural');
  });

  it('omits the gender half for a genderless plural determiner (French "les")', () => {
    expect(grammarHint(word({ linguistic: { grammatical_number: 'plural' } }))).toBe('plural');
  });

  it('abbreviates both halves when asked', () => {
    expect(grammarHint(word({ linguistic: { gender: 'feminine', grammatical_number: 'plural' } }), true)).toBe('fem., pl.');
  });

  it('abbreviates a genderless determiner to just the number', () => {
    expect(grammarHint(word({ linguistic: { grammatical_number: 'singular' } }), true)).toBe('sing.');
  });
});

describe('genderArticle', () => {
  const noun = (w: string, gender: string, over: Record<string, unknown> = {}) =>
    word({ word: w, pos: 'noun', linguistic: { gender }, ...over });

  it('returns "el"/"la" for Spanish', () => {
    expect(genderArticle(noun('perro', 'masculine'), 'spanish')).toBe('el');
    expect(genderArticle(noun('casa', 'feminine'), 'spanish')).toBe('la');
  });

  it('returns "o"/"a" for Portuguese, no elision', () => {
    expect(genderArticle(noun('amigo', 'masculine'), 'portuguese')).toBe('o');
    expect(genderArticle(noun('árvore', 'feminine'), 'portuguese')).toBe('a');
  });

  it('returns "der"/"die" for German (neuter is out of scope)', () => {
    expect(genderArticle(noun('Mann', 'masculine'), 'german')).toBe('der');
    expect(genderArticle(noun('Frau', 'feminine'), 'german')).toBe('die');
    expect(genderArticle(noun('Haus', 'neuter'), 'german')).toBeNull();
  });

  it('elides French "le"/"la" to "l\'" before a vowel sound', () => {
    expect(genderArticle(noun('chat', 'masculine'), 'french')).toBe('le');
    expect(genderArticle(noun('amour', 'masculine'), 'french')).toBe("l'");
    expect(genderArticle(noun('femme', 'feminine'), 'french')).toBe('la');
    expect(genderArticle(noun('île', 'feminine'), 'french')).toBe("l'");
  });

  it('picks Italian "il"/"lo"/"l\'" for masculine by the word\'s own shape', () => {
    expect(genderArticle(noun('libro', 'masculine'), 'italian')).toBe('il');
    expect(genderArticle(noun('zaino', 'masculine'), 'italian')).toBe('lo');
    expect(genderArticle(noun('studente', 'masculine'), 'italian')).toBe('lo');
    expect(genderArticle(noun('amico', 'masculine'), 'italian')).toBe("l'");
  });

  it('Italian feminine only ever elides, never takes "lo"', () => {
    expect(genderArticle(noun('casa', 'feminine'), 'italian')).toBe('la');
    expect(genderArticle(noun('amica', 'feminine'), 'italian')).toBe("l'");
  });

  it('is null for a non-noun even with a gender set', () => {
    expect(genderArticle(word({ word: 'bonito', pos: 'adjective', linguistic: { gender: 'masculine' } }), 'spanish')).toBeNull();
  });

  it('is null with no gender', () => {
    expect(genderArticle(word({ word: 'coche', pos: 'noun', linguistic: {} }), 'spanish')).toBeNull();
  });

  it('is null for Dutch — the data only ever carries common/neuter, never masculine/feminine', () => {
    expect(genderArticle(noun('huis', 'neuter'), 'dutch')).toBeNull();
  });

  it('is null for a language with no grammatical gender at all', () => {
    expect(genderArticle(noun('猫', 'masculine'), 'japanese')).toBeNull();
  });

  it('resolves the language from entry.language over the passed-in lang', () => {
    // Spanish never elides, French does — a vowel-initial word tells the two
    // apart even though both languages' feminine article happens to be "la".
    expect(genderArticle(noun('amigo', 'masculine', { language: 'spanish' }), 'french')).toBe('el');
  });
});

describe('genderKey', () => {
  it('returns the masculine/feminine key for a noun', () => {
    expect(genderKey(word({ pos: 'noun', linguistic: { gender: 'masculine' } }))).toBe('masculine');
    expect(genderKey(word({ pos: 'noun', linguistic: { gender: 'feminine' } }))).toBe('feminine');
  });

  it('is null for a non-noun', () => {
    expect(genderKey(word({ pos: 'adjective', linguistic: { gender: 'masculine' } }))).toBeNull();
  });

  it('is null for neuter/common — binary indicator only', () => {
    expect(genderKey(word({ pos: 'noun', linguistic: { gender: 'neuter' } }))).toBeNull();
    expect(genderKey(word({ pos: 'noun', linguistic: { gender: 'common' } }))).toBeNull();
  });

  it('is language-independent, unlike genderArticle', () => {
    expect(genderKey(word({ pos: 'noun', linguistic: { gender: 'feminine' } }))).toBe('feminine');
  });
});

describe('displayWord gender article', () => {
  const noun = (w: string, gender: string) => word({ word: w, pos: 'noun', linguistic: { gender } });

  it('prefixes the definite article when asked', () => {
    expect(displayWord(noun('casa', 'feminine'), true, false, true, 'spanish')).toBe('la casa');
  });

  it('does not prefix by default', () => {
    expect(displayWord(noun('casa', 'feminine'), true, false, false, 'spanish')).toBe('casa');
  });

  it('combines with a disambiguator', () => {
    const w = word({ word: 'casa', pos: 'noun', disambiguator: 'home', linguistic: { gender: 'feminine' } });
    expect(displayWord(w, true, false, true, 'spanish')).toBe('la casa (home)');
  });
});

describe('wordAndAnnotation', () => {
  it('separates the (possibly article-prefixed) word from its annotation', () => {
    const w = word({ word: 'casa', pos: 'noun', disambiguator: 'home', linguistic: { gender: 'feminine' } });
    expect(wordAndAnnotation(w, true, false, true, 'spanish')).toEqual({ base: 'la casa', annotation: 'home' });
  });

  it('annotation is null, not empty, when there is none', () => {
    expect(wordAndAnnotation(word({ word: 'perro' }))).toEqual({ base: 'perro', annotation: null });
  });

  it('agrees with displayWord on the combined string', () => {
    const w = word({ word: 'un', disambiguator: 'numeral', linguistic: { gender: 'masculine', grammatical_number: 'singular' } });
    const { base, annotation } = wordAndAnnotation(w);
    expect(`${base} (${annotation})`).toBe(displayWord(w));
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
