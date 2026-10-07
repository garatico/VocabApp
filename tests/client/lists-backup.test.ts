/**
 * lists-backup.test.ts — My Lists' backup and restore (src/client/modes/my-lists/backup.ts),
 * "the only safety net lists have". Restore merges: it may add, rename or raise, never remove or lower.
 *
 * Node environment with an in-memory localStorage stub, like word-lists-multi.test.ts.
 */
import { describe, it, expect, beforeEach } from 'vitest';

const store = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem:    (k: string) => store.get(k) ?? null,
  setItem:    (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  clear:      () => { store.clear(); },
  key:        (i: number) => [...store.keys()][i] ?? null,
  get length() { return store.size; },
};
(globalThis as Record<string, unknown>).document = {
  getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
};

const { buildBackup, applyBackup } = await import('../../src/client/modes/my-lists/backup.js');
const { createList, addToList, getListNames, getListOwn, createMultiList, addToMultiList, getMultiListNames, getMultiListOwn } =
  await import('../../src/client/utils/word-lists.js');
const { getMastered, saveMastered, getMasteryLevel, setMasteryLevel, MAX_MASTERY_LEVEL } =
  await import('../../src/client/modes/my-lists/mastery.js');

beforeEach(() => store.clear());

function seed(): void {
  createList('spanish', 'Food');
  addToList('spanish', 'Food', 'pan');
  addToList('spanish', 'Food', 'queso');
  saveMastered('spanish', new Set(['pan']));
  setMasteryLevel('spanish', 'queso', 2);
  createMultiList('Mixed');
  addToMultiList('Mixed', 'casa', 'spanish');
  addToMultiList('Mixed', 'maison', 'french');
}

describe('buildBackup → applyBackup', () => {
  it('a backup restored into an empty browser brings back lists, mastery, levels and cross-language lists', () => {
    seed();
    const json = JSON.stringify(buildBackup());
    store.clear();

    const summary = applyBackup(json);

    expect(getListNames('spanish')).toEqual(['Food']);
    expect([...getListOwn('spanish', 'Food')].sort()).toEqual(['pan', 'queso']);
    expect(getMastered('spanish').has('pan')).toBe(true);
    expect(getMasteryLevel('spanish', 'queso')).toBe(2);
    expect(getMultiListNames()).toEqual(['Mixed']);
    expect(getMultiListOwn('Mixed').map(e => e.word).sort()).toEqual(['casa', 'maison']);
    expect(summary).toBe('Restored 2 lists (4 words)');
  });

  it('never overwrites: a name already taken is restored beside it with a suffix', () => {
    seed();
    const json = JSON.stringify(buildBackup());
    applyBackup(json);
    const summary = applyBackup(json);
    expect(getListNames('spanish').sort()).toEqual(['Food', 'Food (restored 2)', 'Food (restored 3)']);
    expect(getMultiListNames().sort()).toEqual(['Mixed', 'Mixed (restored 2)', 'Mixed (restored 3)']);
    expect(summary).toMatch(/2 renamed to avoid overwriting/);
  });

  it('mastery levels merge upward — an old backup cannot roll back progress made since', () => {
    setMasteryLevel('spanish', 'pan', 3);
    applyBackup(JSON.stringify({ version: 4, lists: {}, mastery: {}, masteryLevels: { spanish: { pan: 1, vino: 2 } } }));
    expect(getMasteryLevel('spanish', 'pan')).toBe(3);
    expect(getMasteryLevel('spanish', 'vino')).toBe(2);
  });

  it('a word an old (v2) backup has as mastered is raised to Mastered, not left reading as Learning', () => {
    setMasteryLevel('spanish', 'pan', 1);
    applyBackup(JSON.stringify({ version: 2, lists: {}, mastery: { spanish: ['pan'] } }));
    expect(getMastered('spanish').has('pan')).toBe(true);
    expect(getMasteryLevel('spanish', 'pan')).toBe(MAX_MASTERY_LEVEL);
  });

  it('reads v1 mastery, which was nested per list', () => {
    applyBackup(JSON.stringify({ version: 1, lists: {}, mastery: { spanish: { Food: ['pan'], Drinks: ['vino'] } } }));
    expect([...getMastered('spanish')].sort()).toEqual(['pan', 'vino']);
  });
});

describe('applyBackup — the wrong file', () => {
  it.each([
    ['not JSON at all', '<!doctype html><html>'],
    ['JSON but not an object', '[1, 2, 3]'],
    ['an object without lists', '{"hello": "world"}'],
    ['lists of the wrong type', '{"lists": ["Food"]}'],
    ['null', 'null'],
  ])('%s → one plain-language error', (_label, raw) => {
    expect(() => applyBackup(raw)).toThrow('That file does not look like a VocabApp list backup.');
  });

  it('skips malformed parts and keeps the good ones', () => {
    const summary = applyBackup(JSON.stringify({
      version: 4,
      lists: { spanish: { Food: ['pan', 7, null, '', { w: 'x' }, 'queso'], Broken: 'pan' }, french: null },
      mastery: { spanish: ['pan', 3, null] },
      masteryLevels: { spanish: { pan: 'high', queso: 2 }, french: 'nope' },
      multiLists: { Mixed: [{ word: 'casa', language: 'spanish' }, { word: 5 }, null], Bad: 'x' },
    }));
    expect(getListNames('spanish')).toEqual(['Food']);
    expect([...getListOwn('spanish', 'Food')].sort()).toEqual(['pan', 'queso']);
    expect([...getMastered('spanish')]).toEqual(['pan']);
    expect(getMasteryLevel('spanish', 'queso')).toBe(2);
    expect(getMultiListOwn('Mixed')).toHaveLength(1);
    expect(summary).toBe('Restored 2 lists (3 words)');
  });
});
