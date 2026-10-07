// @vitest-environment jsdom
/**
 * data-loader-progressive.test.ts — loadWordsProgressive (src/client/data/data-loader.ts)
 * and My Lists' vocab cache share requests instead of repeating them.
 *
 * Startup asks for the same language twice before either answer is in; each call used
 * to send its own first-page request. My Lists used to fetch the whole language again
 * through vocab-source directly. The network layer is mocked to count calls.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const word = (w: string, rank: number) => ({
  word: w, translation: w.toUpperCase(), pos: 'noun', difficulty: null, notes: '',
  glosses: [w.toUpperCase()], examples: [], domains: [], tags: [], rank,
  linguistic: null, frequency: { band: 'A1', rank, corpus_frequency: null },
});
const ALL = Array.from({ length: 5 }, (_, i) => word(`w${i}`, i + 1));

const loadVocabPage = vi.fn(async () => ({ words: ALL.slice(0, 2), total: ALL.length, page: 1, pages: 3, limit: 2 }));
const loadVocab     = vi.fn(async () => ({ data: ALL, origin: 'api' }));
vi.mock('../../src/client/data/vocab-source.ts', () => ({ loadVocab, loadVocabPage }));

beforeEach(() => {
  vi.resetModules();
  loadVocabPage.mockClear();
  loadVocab.mockClear();
  localStorage.clear();
});

describe('loadWordsProgressive', () => {
  it('two concurrent first loads share one page request and one full load', async () => {
    const { loadWordsProgressive } = await import('../../src/client/data/data-loader.ts');
    const [a, b] = await Promise.all([loadWordsProgressive('spanish'), loadWordsProgressive('spanish')]);
    expect(loadVocabPage).toHaveBeenCalledTimes(1);
    expect(a.complete).toBe(false);
    expect(a.words.map(w => w.word)).toEqual(['w0', 'w1']);
    expect(b.words.map(w => w.word)).toEqual(['w0', 'w1']);
    await Promise.all([a.full, b.full]);
    expect(loadVocab).toHaveBeenCalledTimes(1);
  });

  it('once the language is in memory, it answers complete without asking again', async () => {
    const { loadWordsProgressive } = await import('../../src/client/data/data-loader.ts');
    await (await loadWordsProgressive('spanish')).full;
    const again = await loadWordsProgressive('spanish');
    expect(again.complete).toBe(true);
    expect(again.words).toHaveLength(5);
    expect(loadVocabPage).toHaveBeenCalledTimes(1);
    expect(loadVocab).toHaveBeenCalledTimes(1);
  });
});

describe('My Lists vocab cache', () => {
  it('reuses the words the app already loaded instead of fetching the language again', async () => {
    const { loadWords } = await import('../../src/client/data/data-loader.ts');
    const { fetchVocab, cachedVocabMap } = await import('../../src/client/modes/my-lists/vocab-cache.ts');
    await loadWords('spanish');
    const entries = await fetchVocab('spanish');
    expect(loadVocab).toHaveBeenCalledTimes(1);
    expect(entries.map(e => e.word)).toEqual(['w0', 'w1', 'w2', 'w3', 'w4']);
    expect(cachedVocabMap('spanish')?.get('w3')?.rank).toBe(4);
  });
});
