/**
 * swear-filter.test.ts — the "Filter swear words" setting's effect on
 * filterWords() (src/client/filters/word-filters.ts), which no other test
 * exercised: table-filters.test.ts covers the list filter this same function
 * applies, but always with Settings.getSwearFilterEnabled() at its default
 * (off).
 *
 * Same in-memory localStorage + minimal DOM stub as table-filters.test.ts.
 * The setting has no exported setter (settings.ts only writes it from a DOM
 * click handler), so it's toggled the same way that file writes other
 * settings directly: through the raw storage key settings.ts itself uses
 * (`s_` + name — see settings.ts's own key-prefix comment).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Word } from '../../src/client/types.ts';

class FakeStorage {
  map = new Map<string, string>();
  get length(): number { return this.map.size; }
  key(i: number): string | null { return [...this.map.keys()][i] ?? null; }
  getItem(k: string): string | null { return this.map.get(k) ?? null; }
  setItem(k: string, v: string): void { this.map.set(k, v); }
  removeItem(k: string): void { this.map.delete(k); }
}

let store: FakeStorage;
let language = 'spanish';

function stubDom(): void {
  (globalThis as Record<string, unknown>).document = {
    getElementById: (id: string) => (id === 'langSelect' ? { value: language } : null),
    querySelector: () => null,
    querySelectorAll: () => [],
  };
}

beforeEach(() => {
  vi.resetModules();
  store = new FakeStorage();
  language = 'spanish';
  (globalThis as Record<string, unknown>).localStorage = store;
  stubDom();
});

afterEach(() => {
  delete (globalThis as Record<string, unknown>).localStorage;
  delete (globalThis as Record<string, unknown>).document;
});

function enableSwearFilter(): void {
  store.setItem('s_swear_filter_enabled', 'true');
}

function word(overrides: Partial<Word> = {}): Word {
  return {
    word: 'palabra', translation: 'word', pos: null,
    glosses: ['word'], examples: [], svg_url: null, emoji: null,
    linguistic: null, domains: [],
    ...overrides,
  } as Word;
}

async function load() {
  return import('../../src/client/filters/word-filters.ts');
}

describe('filterWords — swear-word filtering', () => {
  it('is off by default: a listed swear word passes through', async () => {
    const { filterWords } = await load();
    const words = [word({ word: 'coño' }), word({ word: 'hola' })];
    expect(filterWords(words).map(w => w.word)).toEqual(['coño', 'hola']);
  });

  it('removes a word on the static per-language list once enabled, case/accent-insensitively', async () => {
    const { filterWords } = await load();
    enableSwearFilter();
    const words = [word({ word: 'CoÑo' }), word({ word: 'hola' })];
    expect(filterWords(words).map(w => w.word)).toEqual(['hola']);
  });

  it('also removes a word tagged register: vulgar, even if not on the static list', async () => {
    const { filterWords } = await load();
    enableSwearFilter();
    const words = [
      word({ word: 'tabu', linguistic: { register: 'vulgar' } as Word['linguistic'] }),
      word({ word: 'hola' }),
    ];
    expect(filterWords(words).map(w => w.word)).toEqual(['hola']);
  });

  it('does not touch a word merely tagged with a non-vulgar register', async () => {
    const { filterWords } = await load();
    enableSwearFilter();
    const words = [word({ word: 'hola', linguistic: { register: 'informal' } as Word['linguistic'] })];
    expect(filterWords(words).map(w => w.word)).toEqual(['hola']);
  });

  it('is a no-op for a language with no curated list and no register tag', async () => {
    const { filterWords } = await load();
    enableSwearFilter();
    language = 'french';
    // 'coño' is only on the Spanish list — French has an empty list, so this
    // plain word (no register tag) has nothing to match against.
    const words = [word({ word: 'coño' })];
    expect(filterWords(words).map(w => w.word)).toEqual(['coño']);
  });

  it('checks a merged-in word against its own .language, not the selected langSelect value', async () => {
    const { filterWords } = await load();
    enableSwearFilter();
    language = 'french'; // langSelect says French...
    // ...but this word was merged in from Spanish (Compare/multi-language
    // table mode tags it with its real language) and should still be judged
    // against the Spanish list, not French's empty one.
    const words = [word({ word: 'coño', language: 'spanish' } as Partial<Word>)];
    expect(filterWords(words)).toEqual([]);
  });

  it('composes with an active list filter rather than one replacing the other', async () => {
    const { filterWords } = await load();
    const wl = await import('../../src/client/utils/word-lists.ts');
    enableSwearFilter();

    wl.createList('spanish', 'Practice');
    ['coño', 'hola', 'casa'].forEach(w => wl.addToList('spanish', 'Practice', w));
    wl.saveListFilterState('spanish', {
      active: true, mode: 'focus',
      selected: [wl.qualifyListName('spanish', 'Practice')],
    });

    const words = [word({ word: 'coño' }), word({ word: 'hola' }), word({ word: 'casa' }), word({ word: 'rojo' })];
    // Focus narrows to {coño, hola, casa}; the swear filter then drops coño.
    expect(filterWords(words).map(w => w.word)).toEqual(['hola', 'casa']);
  });
});
