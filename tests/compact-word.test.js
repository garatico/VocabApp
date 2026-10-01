/**
 * tests/compact-word.test.js
 *
 * compactWord/expandWord shrink the static JSONL and put the app's in-memory
 * Word back exactly as shapeWordRow made it. The round trip is checked on the
 * real shaper's output (the seeded test DB), not hand-built objects, so a
 * default added to shapeWordRow later can't silently fall outside it.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildTestApp, teardownTestApp } from './helpers/app.js';
import { buildLanguagePayload } from '../scripts/export-static-vocab.js';
import { compactWord, expandWord } from '../src/shared/vocab/compact-word.js';

let db;
let words;

beforeAll(() => {
  ({ db } = buildTestApp());
  words = buildLanguagePayload('spanish').data;
});

afterAll(() => {
  teardownTestApp(db);
});

describe('compactWord / expandWord', () => {
  it('round-trips every real word exactly', () => {
    expect(words.length).toBeGreaterThan(0);
    for (const w of words) {
      expect(expandWord(JSON.parse(JSON.stringify(compactWord(w))))).toEqual(w);
    }
  });

  it('makes the serialised words smaller', () => {
    const before = words.map(w => JSON.stringify(w).length).reduce((a, b) => a + b, 0);
    const after  = words.map(w => JSON.stringify(compactWord(w)).length).reduce((a, b) => a + b, 0);
    expect(after).toBeLessThan(before);
  });

  it('never mutates its input', () => {
    const w = JSON.parse(JSON.stringify(words[0]));
    compactWord(w);
    expect(w).toEqual(words[0]);
  });

  it('keeps glosses that differ from the translation, and an empty list', () => {
    const base = { translation: 'of', rank: 1, frequency: { rank: 1 } };
    expect(compactWord({ ...base, glosses: ['of', 'from'] }).glosses).toEqual(['of', 'from']);
    expect(compactWord({ ...base, glosses: [] }).glosses).toEqual([]);
    expect(compactWord({ ...base, glosses: ['of'] })).not.toHaveProperty('glosses');
  });

  it('leaves register alone — absent means unknown, not neutral', () => {
    const noRegister = { translation: 'x', glosses: ['y'], linguistic: { reflexive: true } };
    expect(expandWord(compactWord(noRegister)).linguistic).not.toHaveProperty('register');
  });

  it('restores a null rank into frequency.rank', () => {
    const w = { translation: 'x', glosses: ['y'], rank: null, is_function_word: false, frequency: { rank: null, band: null } };
    expect(expandWord(compactWord(w))).toEqual(w);
  });
});
