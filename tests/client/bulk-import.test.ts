// @vitest-environment jsdom
/**
 * bulk-import.test.ts — My Lists' Bulk import parsing and its "did you mean"
 * candidates (src/client/modes/my-lists/bulk-import.ts).
 */
import { describe, it, expect } from 'vitest';
import type { VocabEntry } from '../../src/client/modes/my-lists/types.js';

const { parseBulk, findVariations } = await import('../../src/client/modes/my-lists/bulk-import.js');

const vocab = (...words: string[]): VocabEntry[] => words.map(word => ({ word, translation: '' }) as VocabEntry);
const words = (entries: VocabEntry[]): string[] => entries.map(e => e.word);

describe('parseBulk', () => {
  it('splits on commas, semicolons, tabs and either kind of line break', () => {
    expect(parseBulk('uno, dos;tres\tcuatro\ncinco\r\nseis')).toEqual(['uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis']);
  });

  it('trims spaces and one pair of surrounding quotes, and drops blanks', () => {
    expect(parseBulk(' "casa" ,, \'perro\' ,\n\n ""')).toEqual(['casa', 'perro']);
  });

  it('keeps an apostrophe inside a word', () => {
    expect(parseBulk("l'eau, aujourd'hui")).toEqual(["l'eau", "aujourd'hui"]);
  });
});

describe('findVariations', () => {
  // Frequency order, as the real vocabulary is: the short function words come first.
  const v = vocab('de', 'la', 'a', 'el', 'ha', 'en', 'amigo', 'amiga', 'hablar', 'habla', 'hablamos', 'gata', 'decir', 'dedo');

  it('offers inflections and near-spellings', () => {
    expect(words(findVariations('gato', v))).toEqual(['gata']);
    expect(words(findVariations('hablo', v))).toEqual(expect.arrayContaining(['hablar', 'habla', 'hablamos']));
  });

  it('never offers a one- or two-letter word just because the token starts with it', () => {
    expect(words(findVariations('amigos', v))).toEqual(['amigo', 'amiga']);
    expect(words(findVariations('hablo', v))).not.toContain('ha');
    expect(words(findVariations('dedos', v))).toEqual(['dedo']);
  });

  it('puts the closest candidate first, ahead of frequency', () => {
    const r = words(findVariations('amigos', vocab('amiga', 'amigo')));
    expect(r[0]).toBe('amigo');
  });

  it('ignores accents and case, and never offers the token itself', () => {
    expect(words(findVariations('Cómo', vocab('como', 'comer')))).toEqual(['comer']);
  });

  it('has nothing to say about a token under three letters', () => {
    expect(findVariations('de', v)).toEqual([]);
  });

  it('offers at most six', () => {
    const many = vocab(...Array.from({ length: 10 }, (_, i) => `casa${i}`));
    expect(findVariations('casas', many)).toHaveLength(6);
  });
});
