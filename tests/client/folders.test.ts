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

const { addFolder, getFolderRegistry, renameFolder, removeFolder, getFolderStyle, setFolderStyle } =
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
