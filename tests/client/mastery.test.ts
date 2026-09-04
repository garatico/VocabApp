/**
 * mastery.test.ts — per-word mastery set, the 0-4 mastery scale, and the
 * one-way migration off the old per-list keys (src/client/modes/my-lists/mastery.ts).
 *
 * Node environment with an in-memory localStorage stub, same pattern as
 * table-pagination.test.ts / session-history.test.ts. Each test uses its own
 * language string so migrateMastery()'s module-level "already migrated" cache
 * can't leak state between tests without needing vi.resetModules().
 */
import { describe, it, expect, beforeEach } from 'vitest';

const store = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem:    (k: string) => store.get(k) ?? null,
  setItem:    (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  clear:      () => { store.clear(); },
  get length() { return store.size; },
  key: (i: number) => [...store.keys()][i] ?? null,
};

const {
  migrateMastery, getMastered, saveMastered, markMastered, isMastered,
  getMasteryLevel, setMasteryLevel, getMasteryLevels,
  MASTERY_LEVELS, MAX_MASTERY_LEVEL,
} = await import('../../src/client/modes/my-lists/mastery.js');

let n = 0;
/** A fresh, letters-only language name per test — see file header. The
 *  legacy-key regex this module migrates from is `[a-z]+`, so a name with
 *  digits (e.g. "lang0") would never match it. */
function lang(): string { return `lang${'z'.repeat(++n)}`; }

beforeEach(() => store.clear());

describe('getMastered / saveMastered', () => {
  it('is empty for a language with nothing stored', () => {
    expect(getMastered(lang())).toEqual(new Set());
  });

  it('round-trips a set', () => {
    const l = lang();
    saveMastered(l, new Set(['perro', 'gato']));
    expect(getMastered(l)).toEqual(new Set(['perro', 'gato']));
  });

  it('is a fresh Set each call, not a live reference into storage', () => {
    const l = lang();
    saveMastered(l, new Set(['perro']));
    getMastered(l).add('gato');
    expect(getMastered(l)).toEqual(new Set(['perro']));
  });
});

describe('markMastered / isMastered', () => {
  it('adds words and reports how many were newly added', () => {
    const l = lang();
    expect(markMastered(l, ['perro', 'gato'])).toBe(2);
    expect(isMastered(l, 'perro')).toBe(true);
    expect(isMastered(l, 'gato')).toBe(true);
  });

  it('counts only the words that were not already mastered', () => {
    const l = lang();
    markMastered(l, ['perro']);
    expect(markMastered(l, ['perro', 'gato'])).toBe(1);
  });

  it('isMastered is false for a word never marked', () => {
    expect(isMastered(lang(), 'nope')).toBe(false);
  });
});

describe('migrateMastery', () => {
  it('merges every legacy per-list key for the language into one set', () => {
    const l = lang();
    store.set(`vq_mastery_${l}_listA`, JSON.stringify(['perro', 'gato']));
    store.set(`vq_mastery_${l}_listB`, JSON.stringify(['gato', 'sol'])); // overlap on purpose

    migrateMastery(l);

    expect(getMastered(l)).toEqual(new Set(['perro', 'gato', 'sol']));
    expect(store.has(`vq_mastery_${l}_listA`)).toBe(false);
    expect(store.has(`vq_mastery_${l}_listB`)).toBe(false);
  });

  it('does not touch a legacy key for a different language', () => {
    const l = lang();
    const other = lang();
    store.set(`vq_mastery_${other}_listA`, JSON.stringify(['perro']));

    migrateMastery(l);

    expect(store.has(`vq_mastery_${other}_listA`)).toBe(true);
    expect(getMastered(l)).toEqual(new Set());
  });

  it('treats a corrupt legacy key as empty rather than throwing', () => {
    const l = lang();
    store.set(`vq_mastery_${l}_listA`, '{not json');
    expect(() => migrateMastery(l)).not.toThrow();
    expect(store.has(`vq_mastery_${l}_listA`)).toBe(false);
  });

  it('is a no-op the second time it runs for the same language', () => {
    const l = lang();
    store.set(`vq_mastery_${l}_listA`, JSON.stringify(['perro']));
    migrateMastery(l);
    // A legacy key reappearing (e.g. another tab writing it) after the first
    // migration is not picked up — migration is one-shot per page load.
    store.set(`vq_mastery_${l}_listA`, JSON.stringify(['gato']));
    migrateMastery(l);
    expect(getMastered(l)).toEqual(new Set(['perro']));
  });

  it('markMastered and isMastered trigger migration on their own', () => {
    const l = lang();
    store.set(`vq_mastery_${l}_listA`, JSON.stringify(['perro']));
    expect(isMastered(l, 'perro')).toBe(true);
  });
});

describe('mastery scale', () => {
  it('defaults an unmarked word to level 0 (New)', () => {
    expect(getMasteryLevel(lang(), 'perro')).toBe(0);
    expect(MASTERY_LEVELS[0]).toBe('New');
  });

  it('falls back to MAX_MASTERY_LEVEL for a word in the legacy mastered set with no explicit level', () => {
    const l = lang();
    markMastered(l, ['perro']);
    expect(getMasteryLevel(l, 'perro')).toBe(MAX_MASTERY_LEVEL);
    expect(MASTERY_LEVELS[MAX_MASTERY_LEVEL]).toBe('Mastered');
  });

  it('an explicit level takes precedence over the legacy set', () => {
    const l = lang();
    markMastered(l, ['perro']); // legacy: mastered
    setMasteryLevel(l, 'perro', 1); // explicit: Learning
    expect(getMasteryLevel(l, 'perro')).toBe(1);
  });

  it('clamps a level above the max down to MAX_MASTERY_LEVEL', () => {
    const l = lang();
    setMasteryLevel(l, 'perro', 99);
    expect(getMasteryLevel(l, 'perro')).toBe(MAX_MASTERY_LEVEL);
  });

  it('clamps a negative level up to 0', () => {
    const l = lang();
    setMasteryLevel(l, 'perro', -5);
    expect(getMasteryLevel(l, 'perro')).toBe(0);
  });

  it('reaching the top level also adds the word to the legacy mastered set', () => {
    const l = lang();
    setMasteryLevel(l, 'perro', MAX_MASTERY_LEVEL);
    expect(isMastered(l, 'perro')).toBe(true);
  });

  it('dropping below the top level removes the word from the legacy mastered set', () => {
    const l = lang();
    setMasteryLevel(l, 'perro', MAX_MASTERY_LEVEL);
    setMasteryLevel(l, 'perro', MAX_MASTERY_LEVEL - 1);
    expect(isMastered(l, 'perro')).toBe(false);
  });

  it('setMasteryLevel only touches the word it is given', () => {
    const l = lang();
    setMasteryLevel(l, 'perro', 2);
    setMasteryLevel(l, 'gato', 3);
    expect(getMasteryLevels(l)).toEqual({ perro: 2, gato: 3 });
  });
});
