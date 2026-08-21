/**
 * word-lists-multi.test.ts — cross-language lists, the additive parallel
 * store alongside the existing per-language one (src/client/utils/word-lists.ts).
 *
 * Runs in the node environment with a minimal in-memory localStorage stub,
 * same pattern as session-history.test.ts / table-compare.test.ts.
 */
import { describe, it, expect, beforeEach } from 'vitest';

const store = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem:    (k: string) => store.get(k) ?? null,
  setItem:    (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  clear:      () => { store.clear(); },
};

const {
  getMultiListNames, getMultiList, getMultiListLanguages, getMultiListCount,
  isInMultiList, addToMultiList, removeFromMultiList,
  createMultiList, deleteMultiList, renameMultiList,
} = await import('../../src/client/utils/word-lists.js');

beforeEach(() => store.clear());

describe('createMultiList / getMultiListNames', () => {
  it('creates an empty list', () => {
    expect(createMultiList('Hard words')).toBe(true);
    expect(getMultiListNames()).toEqual(['Hard words']);
    expect(getMultiList('Hard words')).toEqual([]);
  });

  it('refuses to create a list that already exists', () => {
    createMultiList('Hard words');
    expect(createMultiList('Hard words')).toBe(false);
    expect(getMultiListNames()).toEqual(['Hard words']);
  });
});

describe('addToMultiList / removeFromMultiList / isInMultiList', () => {
  beforeEach(() => { createMultiList('Hard words'); });

  it('adds a word tagged with its language', () => {
    addToMultiList('Hard words', 'casa', 'spanish');
    expect(isInMultiList('Hard words', 'casa', 'spanish')).toBe(true);
    expect(getMultiList('Hard words')).toEqual([{ word: 'casa', language: 'spanish' }]);
  });

  it('keeps two languages sharing a spelling independent', () => {
    addToMultiList('Hard words', 'actor', 'spanish');
    addToMultiList('Hard words', 'actor', 'portuguese');
    expect(isInMultiList('Hard words', 'actor', 'spanish')).toBe(true);
    expect(isInMultiList('Hard words', 'actor', 'portuguese')).toBe(true);
    expect(getMultiListCount('Hard words')).toBe(2);

    removeFromMultiList('Hard words', 'actor', 'spanish');
    expect(isInMultiList('Hard words', 'actor', 'spanish')).toBe(false);
    expect(isInMultiList('Hard words', 'actor', 'portuguese')).toBe(true);
  });

  it('does not add the same (word, language) pair twice', () => {
    addToMultiList('Hard words', 'casa', 'spanish');
    addToMultiList('Hard words', 'casa', 'spanish');
    expect(getMultiListCount('Hard words')).toBe(1);
  });

  it('is false for a word/language pair never added', () => {
    expect(isInMultiList('Hard words', 'casa', 'french')).toBe(false);
  });
});

describe('getMultiListLanguages', () => {
  it('is empty for a list with no words yet', () => {
    createMultiList('Empty');
    expect(getMultiListLanguages('Empty')).toEqual([]);
  });

  it('is a single language when every word shares one', () => {
    createMultiList('Spanish only');
    addToMultiList('Spanish only', 'casa', 'spanish');
    addToMultiList('Spanish only', 'perro', 'spanish');
    expect(getMultiListLanguages('Spanish only')).toEqual(['spanish']);
  });

  it('lists every distinct language present, once each', () => {
    createMultiList('Mixed');
    addToMultiList('Mixed', 'casa', 'spanish');
    addToMultiList('Mixed', 'casa', 'portuguese');
    addToMultiList('Mixed', 'chat', 'french');
    expect(getMultiListLanguages('Mixed').sort()).toEqual(['french', 'portuguese', 'spanish']);
  });
});

describe('deleteMultiList / renameMultiList', () => {
  it('deletes a list', () => {
    createMultiList('Temp');
    addToMultiList('Temp', 'casa', 'spanish');
    deleteMultiList('Temp');
    expect(getMultiListNames()).toEqual([]);
  });

  it('renames a list, keeping its words', () => {
    createMultiList('Old name');
    addToMultiList('Old name', 'casa', 'spanish');
    expect(renameMultiList('Old name', 'New name')).toBe(true);
    expect(getMultiListNames()).toEqual(['New name']);
    expect(getMultiList('New name')).toEqual([{ word: 'casa', language: 'spanish' }]);
  });

  it('refuses to rename onto an existing name', () => {
    createMultiList('A'); createMultiList('B');
    expect(renameMultiList('A', 'B')).toBe(false);
    expect(getMultiListNames().sort()).toEqual(['A', 'B']);
  });
});
