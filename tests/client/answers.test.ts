/**
 * answers.test.ts — gloss matching / display helpers (src/client/utils/utils.ts)
 */
import { describe, it, expect } from 'vitest';
import {
  isCorrect, isReverseCorrect, isCorrectStrict, isReverseCorrectStrict,
  getPosLabel, getGlosses, buildGlossDisplay,
} from '../../src/client/utils/utils.js';
import type { Word } from '../../src/client/types.js';

const word = (over: Record<string, unknown>): Word => over as unknown as Word;

describe('isCorrect (lenient forward matching)', () => {
  const hablar = word({ word: 'hablar', pos: 'verb', glosses: ['to speak', 'to talk'] });

  it('accepts any listed gloss', () => {
    expect(isCorrect('to speak', hablar)).toBe(true);
    expect(isCorrect('to talk', hablar)).toBe(true);
  });

  it('is case/whitespace/accent insensitive', () => {
    expect(isCorrect('  TO SPEAK ', hablar)).toBe(true);
  });

  it('rejects wrong and empty answers', () => {
    expect(isCorrect('to eat', hablar)).toBe(false);
    expect(isCorrect('', hablar)).toBe(false);
    expect(isCorrect('   ', hablar)).toBe(false);
  });

  it('strips parenthetical usage notes', () => {
    const la = word({ word: 'la', glosses: ['the (fem. sing.)'] });
    expect(isCorrect('the', la)).toBe(true);
  });

  it('splits comma-separated alternatives', () => {
    const un = word({ word: 'un', glosses: ['a, an (masc. sing.)'] });
    expect(isCorrect('a', un)).toBe(true);
    expect(isCorrect('an', un)).toBe(true);
  });

  it('falls back to pipe-separated answers field', () => {
    const w = word({ word: 'de', answers: 'of|from' });
    expect(isCorrect('of', w)).toBe(true);
    expect(isCorrect('from', w)).toBe(true);
    expect(isCorrect('to', w)).toBe(false);
  });

  it('returns false when no glosses or answers exist', () => {
    expect(isCorrect('anything', word({ word: 'x' }))).toBe(false);
  });
});

describe('infinitives with and without "to"', () => {
  // Every language but Spanish writes verb glosses as "to X"…
  const comprar = word({ word: 'comprar', pos: 'verb', glosses: ['to buy'] });
  // …and the Spanish set is written bare, so both directions have to work.
  const ser = word({ word: 'ser', pos: 'verb', glosses: ['be', 'is', 'am'] });

  it('accepts the bare form of a "to X" gloss', () => {
    expect(isCorrect('buy', comprar)).toBe(true);
    expect(isCorrect('to buy', comprar)).toBe(true);
  });

  it('accepts the "to X" form of a bare gloss', () => {
    expect(isCorrect('to be', ser)).toBe(true);
    expect(isCorrect('be', ser)).toBe(true);
  });

  it('still rejects a different verb', () => {
    expect(isCorrect('sell', comprar)).toBe(false);
    expect(isCorrect('to sell', comprar)).toBe(false);
  });

  it('handles multi-word and parenthesised infinitives', () => {
    const kunnen = word({ word: 'kunnen', pos: 'verb', glosses: ['to be able to'] });
    expect(isCorrect('be able to', kunnen)).toBe(true);
    const savoir = word({ word: 'savoir', pos: 'verb', glosses: ['to know (facts)'] });
    expect(isCorrect('know', savoir)).toBe(true);
    expect(isCorrect('to know', savoir)).toBe(true);
  });

  it('applies to each comma-separated alternative', () => {
    const w = word({ word: 'laten', pos: 'verb', glosses: ['to let, to leave'] });
    expect(isCorrect('let', w)).toBe(true);
    expect(isCorrect('leave', w)).toBe(true);
  });

  it('does not treat a bare "to" as an infinitive marker', () => {
    const a = word({ word: 'a', pos: 'preposition', glosses: ['to'] });
    expect(isCorrect('to', a)).toBe(true);
    expect(isCorrect('', a)).toBe(false);
  });

  it('works for untagged rows, since pos is often null', () => {
    const untagged = word({ word: 'kopen', glosses: ['to buy'] });
    expect(isCorrect('buy', untagged)).toBe(true);
  });

  it('works via the pipe-separated answers field too', () => {
    expect(isCorrect('buy', word({ word: 'comprar', answers: 'to buy|to purchase' }))).toBe(true);
  });
});

describe('isReverseCorrect (English → target word)', () => {
  const habla = word({ word: 'habla', linguistic: { infinitive: 'hablar' } });

  it('accepts the canonical form', () => {
    expect(isReverseCorrect('habla', habla)).toBe(true);
  });

  it('accepts the infinitive', () => {
    expect(isReverseCorrect('hablar', habla)).toBe(true);
  });

  it('is accent-insensitive by default', () => {
    const esta = word({ word: 'está' });
    expect(isReverseCorrect('esta', esta)).toBe(true);
  });

  it('rejects other words', () => {
    expect(isReverseCorrect('comer', habla)).toBe(false);
  });
});

describe('strict variants (diacritics significant)', () => {
  it('isReverseCorrectStrict distinguishes esta/está', () => {
    const esta = word({ word: 'está' });
    expect(isReverseCorrectStrict('está', esta)).toBe(true);
    expect(isReverseCorrectStrict('esta', esta)).toBe(false);
  });

  it('isCorrectStrict still strips parens and splits alternatives', () => {
    const un = word({ word: 'un', glosses: ['a, an (masc. sing.)'] });
    expect(isCorrectStrict('an', un)).toBe(true);
    expect(isCorrectStrict('the', un)).toBe(false);
  });

  it('isCorrectStrict accepts the bare infinitive — "to" is not a diacritic', () => {
    const comprar = word({ word: 'comprar', pos: 'verb', glosses: ['to buy'] });
    expect(isCorrectStrict('buy', comprar)).toBe(true);
  });
});

describe('display helpers', () => {
  it('getPosLabel abbreviates known parts of speech', () => {
    expect(getPosLabel(word({ pos: 'adjective' }))).toBe('adj');
    expect(getPosLabel(word({ pos: 'verb' }))).toBe('verb');
    expect(getPosLabel(word({ pos: 'gerund' }))).toBe('gerund'); // unknown → passthrough
    expect(getPosLabel(word({}))).toBe('');
  });

  it('getGlosses strips parentheticals from glosses and answers', () => {
    expect(getGlosses(word({ glosses: ['the (fem. sing.)'] }))).toEqual(['the']);
    expect(getGlosses(word({ answers: 'of|from' }))).toEqual(['of', 'from']);
    expect(getGlosses(word({}))).toEqual([]);
  });

  it('buildGlossDisplay prefers "to X" forms for verbs', () => {
    const w = word({ pos: 'verb', glosses: ['to speak', 'speech', 'to talk'] });
    expect(buildGlossDisplay(w)).toBe('to speak / to talk');
  });

  it('buildGlossDisplay joins all glosses for non-verbs', () => {
    expect(buildGlossDisplay(word({ pos: 'preposition', glosses: ['of', 'from'] }))).toBe('of / from');
  });

  it('buildGlossDisplay falls back to translation, then word', () => {
    expect(buildGlossDisplay(word({ word: 'de', translation: 'of' }))).toBe('of');
    expect(buildGlossDisplay(word({ word: 'de' }))).toBe('de');
  });

  it('buildGlossDisplay annotates only the gloss that has a meaning note', () => {
    const w = word({
      pos: 'preposition', glosses: ['of', 'from'],
      meaningDisambiguators: { from: 'origin' },
    });
    expect(buildGlossDisplay(w)).toBe('of / from (origin)');
  });

  it('buildGlossDisplay leaves glosses unannotated when no note applies', () => {
    const w = word({ pos: 'preposition', glosses: ['of', 'from'], meaningDisambiguators: {} });
    expect(buildGlossDisplay(w)).toBe('of / from');
  });
});
