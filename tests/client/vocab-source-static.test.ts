/**
 * vocab-source-static.test.ts — the static-only web build's JSONL path
 * (VITE_STATIC_VOCAB=1): one shared download for the preview and the full
 * load, a real refetch on a later load, expansion of compacted words, and a
 * manifest failure that is not remembered.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const NL = String.fromCharCode(10);

/** n compacted words, one JSON object per line — what export-static-vocab.ts writes. */
function jsonl(n: number): string {
  return Array.from({ length: n }, (_, i) => JSON.stringify({
    word: `w${i + 1}`, translation: `t${i + 1}`, rank: i + 1, frequency: { band: 'A1', corpus_frequency: 1 }, linguistic: {},
  })).join(NL) + NL;
}

function respond(body: string, status = 200): Response {
  return new Response(body, { status });
}

async function load() {
  vi.resetModules();
  vi.stubEnv('VITE_STATIC_VOCAB', '1');
  return import('../../src/client/data/vocab-source.js');
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('static-only loading', () => {
  it('expands the compacted words as it parses them', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respond(jsonl(3))));
    const { loadVocab } = await load();

    const { data, origin } = await loadVocab('spanish');

    expect(origin).toBe('static');
    expect(data).toHaveLength(3);
    expect(data[0]).toMatchObject({
      word: 'w1', glosses: ['t1'], is_function_word: false,
      frequency: { rank: 1 }, linguistic: { reflexive: false },
    });
  });

  it('shares ONE download between the first-paint preview and the whole-language load', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.endsWith('index.json')
        ? respond(JSON.stringify({ languages: [{ language: 'spanish', words: 250 }] }))
        : respond(jsonl(250)));
    vi.stubGlobal('fetch', fetchMock);
    const { loadVocab, loadVocabPage } = await load();

    const [page, full] = await Promise.all([loadVocabPage('spanish', { page: 1, limit: 200 }), loadVocab('spanish')]);

    expect(page.words).toHaveLength(200);
    expect(page.total).toBe(250);
    expect(full.data).toHaveLength(250);
    expect(fetchMock.mock.calls.filter(c => String(c[0]).endsWith('.jsonl'))).toHaveLength(1);
  });

  it('fetches again on a later load, rather than replaying the first copy for the whole session', async () => {
    const fetchMock = vi.fn(async () => respond(jsonl(5)));
    vi.stubGlobal('fetch', fetchMock);
    const { loadVocab } = await load();

    await loadVocab('spanish');
    await loadVocab('spanish');

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not remember a failed manifest fetch', async () => {
    let manifestUp = false;
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('index.json')) {
        if (!manifestUp) throw new Error('offline');
        return respond(JSON.stringify({ languages: [{ language: 'spanish', words: 250 }] }));
      }
      return respond(jsonl(250));
    });
    vi.stubGlobal('fetch', fetchMock);
    const { loadVocabPage } = await load();

    // Without a count the preview can't say how big the language is, so it declines...
    await expect(loadVocabPage('spanish', { page: 1, limit: 200 })).rejects.toThrow();
    // ...and once the manifest is reachable the next call works.
    manifestUp = true;
    const page = await loadVocabPage('spanish', { page: 1, limit: 200 });
    expect(page.total).toBe(250);
  });
});
