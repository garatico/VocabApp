/**
 * match.test.ts — answer-matching utilities (stripDiacritics, normalize, levenshtein)
 */
import { describe, it, expect } from 'vitest';
import { stripDiacritics, normalize, levenshtein } from '../../src/client/utils/match.js';

describe('stripDiacritics', () => {
  it('removes Spanish accents', () => {
    expect(stripDiacritics('canción')).toBe('cancion');
    expect(stripDiacritics('árbol')).toBe('arbol');
  });

  it('removes ñ tilde and umlauts', () => {
    expect(stripDiacritics('niño')).toBe('nino');
    expect(stripDiacritics('über')).toBe('uber');
  });

  it('leaves plain ASCII untouched', () => {
    expect(stripDiacritics('hello world')).toBe('hello world');
  });
});

describe('normalize', () => {
  it('lowercases and strips accents', () => {
    expect(normalize('CANCIÓN')).toBe('cancion');
  });

  it('removes punctuation but keeps letters, numbers, spaces', () => {
    expect(normalize('¡Hola, mundo!')).toBe('hola mundo');
    expect(normalize("l'été")).toBe('lete');
    expect(normalize('room 101')).toBe('room 101');
  });

  it('trims surrounding whitespace', () => {
    expect(normalize('  casa  ')).toBe('casa');
  });

  it('handles null/undefined/empty safely', () => {
    expect(normalize('')).toBe('');
    expect(normalize(null as unknown as string)).toBe('');
    expect(normalize(undefined as unknown as string)).toBe('');
  });
});

describe('levenshtein', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshtein('casa', 'casa')).toBe(0);
    expect(levenshtein('', '')).toBe(0);
  });

  it('returns other length when one string is empty', () => {
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('abc', '')).toBe(3);
  });

  it('counts single edits', () => {
    expect(levenshtein('casa', 'cana')).toBe(1);  // substitution
    expect(levenshtein('casa', 'casas')).toBe(1); // insertion
    expect(levenshtein('casa', 'asa')).toBe(1);   // deletion
  });

  it('computes classic textbook distances', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('flaw', 'lawn')).toBe(2);
  });

  it('is symmetric', () => {
    expect(levenshtein('gato', 'perro')).toBe(levenshtein('perro', 'gato'));
  });
});
