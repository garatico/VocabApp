/**
 * filter-lang.test.ts — currentLangValue()/currentExtraLanguages()
 * (src/client/filters/filter-lang.ts): the one place every filter module
 * reads "what language(s) are we filtering right now."
 *
 * Node environment with a minimal document stub (just enough for the two
 * DOM reads this module makes — #langSelect's value and the active mode
 * tab's data-mode) plus an in-memory localStorage, same pattern as
 * table-filters.test.ts. No jsdom needed — nothing here touches real
 * element behavior like closest() or event bubbling.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

let langValue: string | undefined;
let activeMode: string | null;

function stubDom(): void {
  (globalThis as Record<string, unknown>).document = {
    getElementById: (id: string) =>
      id === 'langSelect' && langValue !== undefined ? { value: langValue } : null,
    querySelector: (sel: string) =>
      sel === '.mode-tab.active' && activeMode !== null
        ? { getAttribute: (k: string) => (k === 'data-mode' ? activeMode : null) }
        : null,
  };
}

const store = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem:    (k: string) => store.get(k) ?? null,
  setItem:    (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  clear:      () => { store.clear(); },
  get length() { return store.size; },
  key: (i: number) => [...store.keys()][i] ?? null,
};

async function load() {
  return import('../../src/client/filters/filter-lang.js');
}

beforeEach(() => {
  vi.resetModules();
  store.clear();
  langValue = undefined;
  activeMode = null;
  stubDom();
});

describe('currentLangValue', () => {
  it('reads #langSelect\'s value', async () => {
    const { currentLangValue } = await load();
    langValue = 'french';
    expect(currentLangValue()).toBe('french');
  });

  it('falls back to "spanish" when the element is missing', async () => {
    const { currentLangValue } = await load();
    expect(currentLangValue()).toBe('spanish');
  });

  it('falls back to a given fallback instead of the default', async () => {
    const { currentLangValue } = await load();
    expect(currentLangValue('german')).toBe('german');
  });
});

describe('MULTI_LANG_MODES', () => {
  it('is exactly table and conjugation', async () => {
    const { MULTI_LANG_MODES } = await load();
    expect(MULTI_LANG_MODES).toEqual(new Set(['table', 'conjugation']));
  });
});

describe('currentExtraLanguages', () => {
  it('is empty until setExtraLanguages has been called', async () => {
    const { currentExtraLanguages } = await load();
    activeMode = 'table';
    expect(currentExtraLanguages()).toEqual([]);
  });

  it('returns the extra languages when on a multi-language mode', async () => {
    const { currentExtraLanguages, setExtraLanguages } = await load();
    activeMode = 'table';
    langValue = 'spanish';
    setExtraLanguages(new Set(['french', 'italian']));
    expect(currentExtraLanguages().sort()).toEqual(['french', 'italian']);
  });

  it('works on conjugation mode too, not just table', async () => {
    const { currentExtraLanguages, setExtraLanguages } = await load();
    activeMode = 'conjugation';
    langValue = 'spanish';
    setExtraLanguages(new Set(['french']));
    expect(currentExtraLanguages()).toEqual(['french']);
  });

  it('is empty on a mode that does not support a multi-language merge', async () => {
    const { currentExtraLanguages, setExtraLanguages } = await load();
    activeMode = 'trivia';
    setExtraLanguages(new Set(['french']));
    expect(currentExtraLanguages()).toEqual([]);
  });

  it('is empty when there is no active mode tab at all', async () => {
    const { currentExtraLanguages, setExtraLanguages } = await load();
    activeMode = null;
    setExtraLanguages(new Set(['french']));
    expect(currentExtraLanguages()).toEqual([]);
  });

  it('excludes the primary language from the extras, even if it was selected', async () => {
    const { currentExtraLanguages, setExtraLanguages } = await load();
    activeMode = 'table';
    langValue = 'spanish';
    setExtraLanguages(new Set(['spanish', 'french']));
    expect(currentExtraLanguages()).toEqual(['french']);
  });

  it('is empty while Kid-Friendly Mode is on, regardless of the selection', async () => {
    const { currentExtraLanguages, setExtraLanguages } = await load();
    activeMode = 'table';
    langValue = 'spanish';
    setExtraLanguages(new Set(['french', 'italian']));
    store.set('s_kid_friendly_mode', 'true');
    expect(currentExtraLanguages()).toEqual([]);
  });

  it('reflects the latest call to setExtraLanguages, not an earlier one', async () => {
    const { currentExtraLanguages, setExtraLanguages } = await load();
    activeMode = 'table';
    langValue = 'spanish';
    setExtraLanguages(new Set(['french']));
    setExtraLanguages(new Set(['dutch']));
    expect(currentExtraLanguages()).toEqual(['dutch']);
  });
});
