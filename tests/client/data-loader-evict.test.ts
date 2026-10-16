// @vitest-environment jsdom
/**
 * data-loader-evict.test.ts — only the languages in use stay in memory (src/client/data/data-loader.ts):
 * the active ones, plus the one used most recently besides them. The rest are let go, and the copies
 * built from them (My Lists' vocab cache) go with them; asking again just loads the language again.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const loadVocab = vi.fn(async (lang: string) => ({
  data: [{ word: `${lang}-1`, translation: 'one', pos: 'noun', glosses: ['one'], examples: [], domains: [], tags: [], rank: 1, linguistic: null, frequency: null }],
  origin: 'api',
}));
vi.mock('../../src/client/data/vocab-source.ts', () => ({ loadVocab, loadVocabPage: vi.fn() }));

beforeEach(() => {
  vi.resetModules();
  loadVocab.mockClear();
  localStorage.clear();
});

describe('keeping only the languages in use', () => {
  it('lets go of all but the active languages and the last one used', async () => {
    const dl = await import('../../src/client/data/data-loader.ts');
    const evicted: string[] = [];
    dl.onVocabEvicted(lang => evicted.push(lang));

    dl.setActiveLanguages(['spanish']);
    await dl.loadWords('spanish');
    dl.setActiveLanguages(['french']);
    await dl.loadWords('french');
    expect(dl.heldLanguages().sort()).toEqual(['french', 'spanish']);   // spanish: the last one used

    dl.setActiveLanguages(['german']);
    await dl.loadWords('german');
    expect(dl.heldLanguages().sort()).toEqual(['french', 'german']);
    expect(evicted).toEqual(['spanish']);

    await dl.loadWords('spanish');   // back again: loaded afresh
    expect(loadVocab.mock.calls.filter(c => c[0] === 'spanish')).toHaveLength(2);
  });

  it('keeps every language a mixed quiz uses', async () => {
    const dl = await import('../../src/client/data/data-loader.ts');
    dl.setActiveLanguages(['spanish', 'italian', 'portuguese']);
    for (const l of ['spanish', 'italian', 'portuguese']) await dl.loadWords(l);
    await dl.loadWords('dutch');
    await dl.loadWords('german');
    expect(dl.heldLanguages().sort()).toEqual(['german', 'italian', 'portuguese', 'spanish']);
  });

  it("My Lists' copy goes with the loader's", async () => {
    const dl = await import('../../src/client/data/data-loader.ts');
    const vc = await import('../../src/client/modes/my-lists/vocab-cache.ts');
    dl.setActiveLanguages(['spanish']);
    await vc.fetchVocab('spanish');
    expect(vc.cachedVocabMap('spanish')?.has('spanish-1')).toBe(true);
    dl.setActiveLanguages(['french']);
    await dl.loadWords('french');
    await dl.loadWords('german');
    expect(vc.cachedVocabMap('spanish')).toBeUndefined();
    expect(await vc.fetchVocab('spanish')).toHaveLength(1);
  });
});
