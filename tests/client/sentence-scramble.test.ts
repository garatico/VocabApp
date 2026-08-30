/**
 * sentence-scramble.test.ts — tokenizing, order-checking and example
 * selection for Sentence Scramble (src/client/modes/sentence-scramble-mode.ts).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  tokenizeSentence, answersMatch, pickScrambleTokens,
} from '../../src/client/modes/sentence-scramble-mode.js';

describe('tokenizeSentence', () => {
  it('splits on whitespace', () => {
    expect(tokenizeSentence('Yo hablo español.')).toEqual(['Yo', 'hablo', 'español.']);
  });

  it('collapses repeated whitespace', () => {
    expect(tokenizeSentence('Yo   hablo  español.')).toEqual(['Yo', 'hablo', 'español.']);
  });

  it('trims leading/trailing whitespace', () => {
    expect(tokenizeSentence('  Hola mundo  ')).toEqual(['Hola', 'mundo']);
  });

  it('a single word tokenizes to one token', () => {
    expect(tokenizeSentence('Hola')).toEqual(['Hola']);
  });
});

describe('answersMatch', () => {
  it('matches an exact, same-order arrangement', () => {
    expect(answersMatch(['Yo', 'hablo', 'español.'], ['Yo', 'hablo', 'español.'])).toBe(true);
  });

  it('ignores case and accents', () => {
    expect(answersMatch(['yo', 'HABLO', 'espanol.'], ['Yo', 'hablo', 'español.'])).toBe(true);
  });

  it('rejects a different order', () => {
    expect(answersMatch(['hablo', 'Yo', 'español.'], ['Yo', 'hablo', 'español.'])).toBe(false);
  });

  it('rejects a different length', () => {
    expect(answersMatch(['Yo', 'hablo'], ['Yo', 'hablo', 'español.'])).toBe(false);
  });

  it('an empty arrangement only matches an empty original', () => {
    expect(answersMatch([], [])).toBe(true);
    expect(answersMatch([], ['Yo'])).toBe(false);
  });
});

describe('pickScrambleTokens', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns null when there are no examples', () => {
    expect(pickScrambleTokens([])).toBeNull();
  });

  it('returns null when every example is a single word', () => {
    expect(pickScrambleTokens(['Hola.', 'Gracias.'])).toBeNull();
  });

  it('filters out single-word examples and picks among the rest', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const tokens = pickScrambleTokens(['Hola.', 'Yo hablo español.']);
    expect(tokens).toEqual(['Yo', 'hablo', 'español.']);
  });

  it('picks a different candidate depending on the random draw', () => {
    const examples = ['Yo hablo español.', 'Tú hablas inglés.'];
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(pickScrambleTokens(examples)).toEqual(['Yo', 'hablo', 'español.']);

    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    expect(pickScrambleTokens(examples)).toEqual(['Tú', 'hablas', 'inglés.']);
  });
});
