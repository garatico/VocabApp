/**
 * swear-words.test.ts — the "Filter swear words" blocklist (data/swear-words.ts)
 */
import { describe, it, expect } from 'vitest';
import { isSwearWord } from '../../src/client/data/swear-words.js';

describe('isSwearWord', () => {
  it('matches a known Spanish entry', () => {
    expect(isSwearWord('spanish', 'mierda')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isSwearWord('spanish', 'MIERDA')).toBe(true);
  });

  it('is accent-insensitive', () => {
    expect(isSwearWord('spanish', 'cabron')).toBe(true);
    expect(isSwearWord('spanish', 'cabrón')).toBe(true);
  });

  it('ignores surrounding whitespace', () => {
    expect(isSwearWord('spanish', '  joder  ')).toBe(true);
  });

  it('is false for an ordinary word', () => {
    expect(isSwearWord('spanish', 'gato')).toBe(false);
  });

  it('is false for every language with no list yet', () => {
    expect(isSwearWord('portuguese', 'mierda')).toBe(false);
    expect(isSwearWord('french', 'mierda')).toBe(false);
  });

  it('is false for an unknown language rather than throwing', () => {
    expect(isSwearWord('klingon', 'mierda')).toBe(false);
  });
});
