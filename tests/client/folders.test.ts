/**
 * folders.test.ts — the folder registry: create, style, rename, remove.
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
  addFolder, getFolderRegistry, renameFolder, removeFolder, getFolderStyle, setFolderStyle,
  folderLeaf, folderParent, withAncestors, childFolders, isInFolderTree, moveFolderPath,
} =
  await import('../../src/client/modes/my-lists/folders.js');

beforeEach(() => store.clear());

describe('renameFolder', () => {
  it('replaces the name in the registry, keeping it sorted', () => {
    addFolder('single_spanish', 'Zoo');
    addFolder('single_spanish', 'Animals');
    expect(renameFolder('single_spanish', 'Zoo', 'Beasts')).toBe(true);
    expect(getFolderRegistry('single_spanish')).toEqual(['Animals', 'Beasts']);
  });

  it('carries the emoji and colour over to the new name', () => {
    addFolder('single_spanish', 'Trips');
    setFolderStyle('single_spanish', 'Trips', { emoji: '✈️', color: '#3d8b5a' });
    expect(renameFolder('single_spanish', 'Trips', 'Travel')).toBe(true);
    expect(getFolderStyle('single_spanish', 'Travel')).toEqual({ emoji: '✈️', color: '#3d8b5a' });
    expect(getFolderStyle('single_spanish', 'Trips')).toEqual({});
  });

  it('refuses a name that already exists, and leaves everything untouched', () => {
    addFolder('single_spanish', 'Trips');
    addFolder('single_spanish', 'Travel');
    setFolderStyle('single_spanish', 'Trips', { emoji: '✈️' });
    expect(renameFolder('single_spanish', 'Trips', 'Travel')).toBe(false);
    expect(getFolderRegistry('single_spanish')).toEqual(['Travel', 'Trips']);
    expect(getFolderStyle('single_spanish', 'Trips')).toEqual({ emoji: '✈️' });
  });

  it('refuses a blank name or the same name, and a folder that does not exist', () => {
    addFolder('single_spanish', 'Trips');
    expect(renameFolder('single_spanish', 'Trips', '  ')).toBe(false);
    expect(renameFolder('single_spanish', 'Trips', 'Trips')).toBe(false);
    expect(renameFolder('single_spanish', 'Missing', 'Whatever')).toBe(false);
    expect(getFolderRegistry('single_spanish')).toEqual(['Trips']);
  });

  it('trims the new name before storing it', () => {
    addFolder('single_spanish', 'Trips');
    expect(renameFolder('single_spanish', 'Trips', '  Travel  ')).toBe(true);
    expect(getFolderRegistry('single_spanish')).toEqual(['Travel']);
  });

  it('is scoped — renaming in one scope never touches another', () => {
    addFolder('single_spanish', 'Trips');
    addFolder('smart_spanish', 'Trips');
    expect(renameFolder('single_spanish', 'Trips', 'Travel')).toBe(true);
    expect(getFolderRegistry('single_spanish')).toEqual(['Travel']);
    expect(getFolderRegistry('smart_spanish')).toEqual(['Trips']);
  });
});

describe('removeFolder (for contrast with rename)', () => {
  it('just drops the entry — nothing to carry anywhere', () => {
    addFolder('single_spanish', 'Trips');
    removeFolder('single_spanish', 'Trips');
    expect(getFolderRegistry('single_spanish')).toEqual([]);
  });
});

describe('nested folders', () => {
  it('a typed path becomes a nested folder, tidied', () => {
    expect(addFolder('single_spanish', ' Verbs / Irregular ')).toBe(true);
    expect(getFolderRegistry('single_spanish')).toEqual(['Verbs/Irregular']);
  });

  it('splits a path into leaf and parent', () => {
    expect(folderLeaf('A/B/C')).toBe('C');
    expect(folderParent('A/B/C')).toBe('A/B');
    expect(folderParent('A')).toBe('');
  });

  it('fills in the levels above a folder and finds its children', () => {
    const all = withAncestors(['A/B/C', 'A/D', 'E']);
    expect(all.sort()).toEqual(['A', 'A/B', 'A/B/C', 'A/D', 'E']);
    expect(childFolders(all, '')).toEqual(['A', 'E']);
    expect(childFolders(all, 'A')).toEqual(['A/B', 'A/D']);
  });

  it('a tree is a folder and everything beneath it, not a name prefix', () => {
    expect(isInFolderTree('A/B', 'A')).toBe(true);
    expect(isInFolderTree('A', 'A')).toBe(true);
    expect(isInFolderTree('Animals', 'A')).toBe(false);
    expect(moveFolderPath('A/B', 'A', 'X')).toBe('X/B');
    expect(moveFolderPath('Animals', 'A', 'X')).toBe('Animals');
  });

  it('renaming a folder carries its subfolders and their styles', () => {
    addFolder('s', 'A/B');
    addFolder('s', 'A/B/C');
    setFolderStyle('s', 'A/B/C', { emoji: '🌱' });
    expect(renameFolder('s', 'A', 'Z')).toBe(true);
    expect(getFolderRegistry('s')).toEqual(['Z/B', 'Z/B/C']);
    expect(getFolderStyle('s', 'Z/B/C')).toEqual({ emoji: '🌱', color: undefined });
  });

  it('refuses to move a folder inside itself', () => {
    addFolder('s', 'A');
    expect(renameFolder('s', 'A', 'A/B')).toBe(false);
  });

  it('removing a folder removes its subfolders too', () => {
    addFolder('s', 'A');
    addFolder('s', 'A/B');
    addFolder('s', 'Animals');
    removeFolder('s', 'A');
    expect(getFolderRegistry('s')).toEqual(['Animals']);
  });
});
