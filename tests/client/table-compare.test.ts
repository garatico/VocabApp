/**
 * table-compare.test.ts — the composite-key machinery that lets table mode's
 * Compare feature mix two languages into one table without a shared spelling
 * colliding (src/client/modes/table-mode.ts's rowKey, table-controls.ts's
 * countProgress).
 *
 * Runs in the node environment with a minimal in-memory localStorage stub,
 * same pattern as table-pagination.test.ts.
 */
import { describe, it, expect } from 'vitest';

const store = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem:    (k: string) => store.get(k) ?? null,
  setItem:    (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  clear:      () => { store.clear(); },
};

const { rowKey }        = await import('../../src/client/modes/table-mode.js');
const { countProgress } = await import('../../src/client/modes/table-controls.js');

describe('rowKey', () => {
  it('keys an ordinary single-language word by its fallback language', () => {
    expect(rowKey({ word: 'casa' }, 'spanish')).toBe('spanish:casa');
  });

  it('prefers the word\'s own .language over the fallback', () => {
    expect(rowKey({ word: 'casa', language: 'portuguese' }, 'spanish')).toBe('portuguese:casa');
  });

  it('gives two languages sharing a spelling distinct keys', () => {
    const es = rowKey({ word: 'actor', language: 'spanish' },     'spanish');
    const pt = rowKey({ word: 'actor', language: 'portuguese' },  'spanish');
    expect(es).not.toBe(pt);
  });

  it('gives three languages sharing a spelling three distinct keys', () => {
    // "actor" is a real word in Spanish, Portuguese and French — a 3-language
    // table (not just the original 2-language Compare case) must not collapse
    // any pair of these.
    const keys = ['spanish', 'portuguese', 'french']
      .map(language => rowKey({ word: 'actor', language }, 'spanish'));
    expect(new Set(keys).size).toBe(3);
  });
});

describe('countProgress with a merged Compare-mode word list', () => {
  it('does not let two languages\' same-spelled words share one answer record', () => {
    const words = [
      { word: 'actor', language: 'spanish' },
      { word: 'actor', language: 'portuguese' },
    ];
    // Spanish "actor" answered correctly; Portuguese "actor" still open.
    const state = new Map([
      [rowKey(words[0], 'spanish'), { disabled: true,  stateClass: 'correct' }],
    ]);

    const counts = countProgress(words, state, 'spanish');
    expect(counts).toMatchObject({ correct: 1, left: 1, total: 2 });
  });

  it('matches ordinary single-language behavior when nothing carries .language', () => {
    const words = [{ word: 'casa' }, { word: 'perro' }];
    const state = new Map([
      [rowKey(words[0], 'spanish'), { disabled: true, stateClass: 'correct' }],
    ]);
    const counts = countProgress(words, state, 'spanish');
    expect(counts).toMatchObject({ correct: 1, left: 1, total: 2 });
  });

  it('keeps three languages\' same-spelled words fully independent', () => {
    const words = [
      { word: 'actor', language: 'spanish' },
      { word: 'actor', language: 'portuguese' },
      { word: 'actor', language: 'french' },
    ];
    // Spanish correct, Portuguese missed, French left untouched.
    const state = new Map([
      [rowKey(words[0], 'spanish'), { disabled: true, stateClass: 'correct' }],
      [rowKey(words[1], 'spanish'), { disabled: true, stateClass: 'incorrect' }],
    ]);

    const counts = countProgress(words, state, 'spanish');
    expect(counts).toMatchObject({ correct: 1, missed: 1, left: 1, total: 3 });
  });
});
