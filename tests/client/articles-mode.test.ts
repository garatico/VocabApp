/**
 * articles-mode.test.ts — the Articles quiz's choices (utils.ts articleChoices /
 * withDefiniteArticle / hasArticles) and which words become questions.
 */
import { describe, it, expect } from 'vitest';
import { articleChoices, withDefiniteArticle, hasArticles } from '../../src/client/utils/utils.js';
import { buildArticleQuestions } from '../../src/client/modes/articles-mode.js';
import type { Word } from '../../src/client/types.js';

const noun = (word: string, gender: string | null, over: Record<string, unknown> = {}): Word =>
  ({ word, pos: 'noun', translation: 'x', glosses: ['x'], examples: [], linguistic: { gender }, ...over }) as unknown as Word;

const labels = (w: Word, lang: string) => articleChoices(w, lang)?.map(c => c.article);
const right  = (w: Word, lang: string) => articleChoices(w, lang)?.find(c => c.correct)?.article;

describe('articleChoices', () => {
  it('offers der/die/das for German and marks the noun\'s own', () => {
    expect(labels(noun('Haus', 'neuter'), 'german')).toEqual(['der', 'die', 'das']);
    expect(right(noun('Haus', 'neuter'), 'german')).toBe('das');
    expect(right(noun('Frau', 'feminine'), 'german')).toBe('die');
  });

  it('collapses Dutch to de/het', () => {
    expect(labels(noun('huis', 'neuter'), 'dutch')).toEqual(['de', 'het']);
    expect(right(noun('huis', 'neuter'), 'dutch')).toBe('het');
    expect(right(noun('tafel', 'common'), 'dutch')).toBe('de');
    expect(right(noun('man', 'masculine'), 'dutch')).toBe('de');
  });

  it('ignores elision, so le/la stay apart before a vowel', () => {
    expect(labels(noun('amour', 'masculine'), 'french')).toEqual(['le', 'la']);
    expect(right(noun('amour', 'masculine'), 'french')).toBe('le');
  });

  it('labels Italian masculine with the article this noun takes', () => {
    expect(labels(noun('zaino', 'masculine'), 'italian')).toEqual(['lo', 'la']);
    expect(labels(noun('libro', 'masculine'), 'italian')).toEqual(['il', 'la']);
  });

  it('is null when there is no single article to ask for', () => {
    expect(articleChoices(noun('estudiante', 'm/f'), 'spanish')).toBeNull();
    expect(articleChoices(noun('casa', null), 'spanish')).toBeNull();
    expect(articleChoices(noun('猫', 'masculine'), 'japanese')).toBeNull();
    expect(articleChoices(noun('rápido', 'masculine', { pos: 'adjective' }), 'spanish')).toBeNull();
  });

  it('follows entry.language in a merged pool', () => {
    expect(right(noun('Haus', 'neuter', { language: 'german' }), 'spanish+german')).toBe('das');
  });
});

describe('withDefiniteArticle', () => {
  it('says the noun with its article, eliding where the language does', () => {
    expect(withDefiniteArticle(noun('Haus', 'neuter'), 'german')).toBe('das Haus');
    expect(withDefiniteArticle(noun('amour', 'masculine'), 'french')).toBe("l'amour");
    expect(withDefiniteArticle(noun('zaino', 'masculine'), 'italian')).toBe('lo zaino');
    expect(withDefiniteArticle(noun('estudiante', 'm/f'), 'spanish')).toBe('estudiante');
  });
});

describe('hasArticles', () => {
  it('is true for any gendered language in the pool', () => {
    expect(hasArticles('german')).toBe(true);
    expect(hasArticles('japanese')).toBe(false);
    expect(hasArticles('chinese+dutch')).toBe(true);
  });
});

describe('buildArticleQuestions', () => {
  it('keeps only nouns with a single known article, in order', () => {
    const words = [noun('Haus', 'neuter'), noun('schnell', null, { pos: 'adjective' }), noun('Frau', 'feminine')];
    expect(buildArticleQuestions(words, 'german').map(q => q.word.word)).toEqual(['Haus', 'Frau']);
  });
});
