/**
 * classifiers.test.ts — the Classifiers tab's pure parts: which nouns can be asked, the buttons each gets,
 * and the counted phrase (utils/classifiers.ts, modes/classifiers-mode.ts's buildClassifierQuestions).
 */
import { describe, it, expect } from 'vitest';
import {
  classifierChoices, classifiersOf, commonClassifiers, countedOnce, hasClassifier, hasClassifiers, takesClassifier,
} from '../../src/client/utils/classifiers.js';
import { buildClassifierQuestions } from '../../src/client/modes/classifiers-mode.js';
import type { Word } from '../../src/client/types.js';

function noun(word: string, classifier: string | null, pos = 'noun'): Word {
  return { word, translation: word, pos, glosses: [word], examples: [], linguistic: { classifier } } as unknown as Word;
}

const cat = noun('猫', '只');
const book = noun('书', '本, 部, 册');
const dog = noun('狗', '只, 条');
const car = noun('车', '辆, 部');
const water = noun('水', null);
const fixed = (): number => 0;     // a shuffle that leaves the order alone (Fisher–Yates with j = 0 rotates — fine)

describe('classifiersOf / hasClassifier', () => {
  it('splits the stored list, usual first', () => {
    expect(classifiersOf(book)).toEqual(['本', '部', '册']);
    expect(classifiersOf(water)).toEqual([]);
  });

  it('asks only nouns that have one', () => {
    expect(hasClassifier(cat)).toBe(true);
    expect(hasClassifier(water)).toBe(false);
    expect(hasClassifier(noun('走', '只', 'verb'))).toBe(false);
  });
});

describe('hasClassifiers', () => {
  it('is true for Chinese and Vietnamese, and a merged pool holding one', () => {
    expect(hasClassifiers('chinese')).toBe(true);
    expect(hasClassifiers('vietnamese')).toBe(true);
    expect(hasClassifiers('german')).toBe(false);
    expect(hasClassifiers('german+chinese')).toBe(true);
    expect(hasClassifiers('klingon')).toBe(false);
  });
});

describe('commonClassifiers', () => {
  it('ranks by how many nouns take each as their usual one', () => {
    expect(commonClassifiers([cat, dog, book, car, water])).toEqual(['只', '本', '辆']);
  });
});

describe('classifierChoices', () => {
  it('offers the usual one and others the noun does not take', () => {
    const choices = classifierChoices(dog, ['只', '条', '本', '辆', '个'], 4, fixed)!;
    expect(choices).toHaveLength(4);
    expect(choices.filter(c => c.correct).map(c => c.label)).toEqual(['只']);
    expect(choices.map(c => c.label)).not.toContain('条');       // also right for 狗, so never a wrong option
  });

  it('is null for a word with no classifier', () => {
    expect(classifierChoices(water, ['只'])).toBeNull();
  });

  it('accepts any classifier the noun takes', () => {
    expect(takesClassifier(dog, '条')).toBe(true);
    expect(takesClassifier(dog, '本')).toBe(false);
  });
});

describe('countedOnce', () => {
  it('says the noun counted once, in each language', () => {
    expect(countedOnce(cat, 'chinese')).toBe('一只猫');
    expect(countedOnce(noun('chó', 'con'), 'vietnamese')).toBe('một con chó');
  });
});

describe('buildClassifierQuestions', () => {
  it('skips nouns with nothing to contrast and words with no classifier', () => {
    expect(buildClassifierQuestions([cat, water], fixed)).toEqual([]);           // only 只 in the pool
    const qs = buildClassifierQuestions([cat, book, car, water], fixed);
    expect(qs.map(q => q.word.word)).toEqual(['猫', '书', '车']);
  });

  it('uses a wider list of wrong options when one is given (Practice missed)', () => {
    const qs = buildClassifierQuestions([cat], fixed, ['只', '本', '辆']);
    expect(qs).toHaveLength(1);
    expect(qs[0].choices.map(c => c.label).sort()).toEqual(['只', '本', '辆'].sort());
  });
});
