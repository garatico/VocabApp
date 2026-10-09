/**
 * multi-meaning.test.ts — Table answers that must name several different meanings
 * (slotMatches / slotCouldMatch's `meanings`, neededMeanings in utils.ts).
 */
import { describe, it, expect } from 'vitest';
import { slotMatches, slotCouldMatch, neededMeanings } from '../../src/client/utils/utils.js';
import type { Word } from '../../src/client/types.js';

const word = (over: Record<string, unknown>): Word => over as unknown as Word;
const dejar = word({ word: 'dejar', pos: 'verb', glosses: ['to let', 'to leave', 'to quit'] });
const el    = word({ word: 'el', pos: 'det', glosses: ['the, a (masc.)'] });

const ok = (input: string, entry: Word, n: number): boolean => slotMatches(input, entry, 'english', 'fuzzy', 'spanish', undefined, n);
const could = (input: string, entry: Word, n: number): boolean => slotCouldMatch(input, entry, 'english', 'fuzzy', 'spanish', undefined, n);

describe('neededMeanings', () => {
  it('is what was asked for, capped by what the word has', () => {
    expect(neededMeanings(dejar, 2)).toBe(2);
    expect(neededMeanings(dejar, 9)).toBe(3);
    expect(neededMeanings(el, 3)).toBe(1);
  });
  it('is 1 when nothing more is asked', () => {
    expect(neededMeanings(dejar, 1)).toBe(1);
    expect(neededMeanings(dejar, 0)).toBe(1);
  });
});

describe('answering with several meanings', () => {
  it('one meaning is no longer enough', () => {
    expect(ok('let', dejar, 1)).toBe(true);
    expect(ok('let', dejar, 2)).toBe(false);
  });

  it('accepts two different meanings, separated by comma, semicolon or slash', () => {
    expect(ok('let, leave', dejar, 2)).toBe(true);
    expect(ok('leave; quit', dejar, 2)).toBe(true);
    expect(ok('to let / to leave', dejar, 2)).toBe(true);
  });

  it('counts a meaning once however it is spelled', () => {
    expect(ok('let, to let', dejar, 2)).toBe(false);
  });

  it('ignores a wrong piece but still counts the right ones', () => {
    expect(ok('let, banana, leave', dejar, 2)).toBe(true);
    expect(ok('let, banana', dejar, 2)).toBe(false);
  });

  it('a word with fewer meanings than asked needs all of its own', () => {
    expect(ok('the', el, 3)).toBe(true);
    expect(ok('the, a', el, 3)).toBe(true);
  });

  it('is not triggered when only one meaning is asked', () => {
    expect(ok('leave', dejar, 1)).toBe(true);
  });
});

describe('Sudden Death with several meanings', () => {
  it('lets a finished meaning and a typed-so-far one stand', () => {
    expect(could('let, le', dejar, 2)).toBe(true);
    expect(could('let, ', dejar, 2)).toBe(true);
  });
  it('flags a finished piece that is not a meaning, or a tail that cannot become one', () => {
    expect(could('banana, le', dejar, 2)).toBe(false);
    expect(could('let, xyz', dejar, 2)).toBe(false);
  });
});
