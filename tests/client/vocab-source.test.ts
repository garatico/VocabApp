/**
 * vocab-source.test.ts — API/static fallback ordering and Render-cold-start retry.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadVocab, loadVocabPage, resetOrigin, registerSqliteVocabSource } from '../../src/client/data/vocab-source.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** A streamed response whose body arrives in more than one chunk, so onProgress has something to report. */
function streamedJsonResponse(body: unknown, chunkSize: number): Response {
  const bytes  = new TextEncoder().encode(JSON.stringify(body));
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bytes.length; i += chunkSize) {
        controller.enqueue(bytes.slice(i, i + chunkSize));
      }
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { 'Content-Type': 'application/json' } });
}

const word = { id: 1, word: 'hola', translation: 'hello' };

describe('loadVocab', () => {
  beforeEach(() => {
    resetOrigin();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    registerSqliteVocabSource(null);
  });

  it('returns the API payload when the API answers immediately', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [word], count: 1 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await loadVocab('spanish');

    expect(result.origin).toBe('api');
    expect(result.data).toEqual([word]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to the static export when the API 404s (not retryable)', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'not found' }, 404))
      .mockResolvedValueOnce(jsonResponse({ data: [word], count: 1 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await loadVocab('spanish');

    expect(result.origin).toBe('static');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries a 503 (Render cold boot) before falling back, and succeeds once the API wakes', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({}, 503))
      .mockResolvedValueOnce(jsonResponse({}, 503))
      .mockResolvedValueOnce(jsonResponse({ data: [word], count: 1 }));
    vi.stubGlobal('fetch', fetchMock);

    const onRetry = vi.fn();
    const promise = loadVocab('spanish', { onRetry });

    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.origin).toBe('api');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenNthCalledWith(1, 1, 5);
    expect(onRetry).toHaveBeenNthCalledWith(2, 2, 5);
  });

  it('falls back to static after exhausting retries on a persistently sleeping API', async () => {
    // API: every attempt fails with 503. Static succeeds on the one call it
    // gets, after the API's retries run out.
    const fetchMock = vi.fn((url: string) =>
      Promise.resolve(
        url.includes('/api/') ? jsonResponse({}, 503) : jsonResponse({ data: [word], count: 1 }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const promise = loadVocab('spanish');
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.origin).toBe('static');
    // 1 initial + 5 retries against the API, then 1 static call.
    expect(fetchMock).toHaveBeenCalledTimes(7);
  });

  it('reports cumulative bytes as a large response streams in', async () => {
    const payload    = { data: Array.from({ length: 50 }, (_, i) => ({ ...word, id: i })), count: 50 };
    const fullLength = JSON.stringify(payload).length;
    const fetchMock  = vi.fn().mockResolvedValue(streamedJsonResponse(payload, 64));
    vi.stubGlobal('fetch', fetchMock);

    const onProgress = vi.fn();
    const result = await loadVocab('spanish', { onProgress });

    expect(result.data).toHaveLength(50);
    expect(onProgress.mock.calls.length).toBeGreaterThan(1);
    const byteCounts = onProgress.mock.calls.map(call => call[0] as number);
    expect(byteCounts).toEqual([...byteCounts].sort((a, b) => a - b)); // strictly increasing
    expect(byteCounts[byteCounts.length - 1]).toBe(fullLength);
  });

  it('throws a clear error when neither source ever answers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, 503));
    vi.stubGlobal('fetch', fetchMock);

    const promise = loadVocab('spanish');
    const assertion = expect(promise).rejects.toThrow(/Could not load vocabulary for "spanish"/);
    await vi.runAllTimersAsync();
    await assertion;
  });

  it('skips the Render-cold-start retry in a packaged Tauri build and falls straight to static', async () => {
    vi.stubGlobal('__TAURI_INTERNALS__', {});
    const fetchMock = vi.fn((url: string) =>
      Promise.resolve(
        url.includes('/api/') ? jsonResponse({}, 503) : jsonResponse({ data: [word], count: 1 }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const onRetry = vi.fn();
    const result = await loadVocab('spanish', { onRetry });

    expect(result.origin).toBe('static');
    // 1 failed API call, then straight to static — no retry delays at all.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('skips the retry in a packaged Capacitor build too', async () => {
    vi.stubGlobal('Capacitor', { isNativePlatform: () => true });
    const fetchMock = vi.fn((url: string) =>
      Promise.resolve(
        url.includes('/api/') ? jsonResponse({}, 503) : jsonResponse({ data: [word], count: 1 }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await loadVocab('spanish');

    expect(result.origin).toBe('static');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  // isPackagedApp() also checks the plain `__TAURI__` global — older Tauri
  // releases exposed that instead of `__TAURI_INTERNALS__` (Tauri 2's own
  // flag, covered above). Both branches gate the exact same behavior, but
  // only one was ever exercised here — a regression narrowing the check to
  // just `__TAURI_INTERNALS__` would have shipped unnoticed.
  it('also treats the plain __TAURI__ global as a packaged build', async () => {
    vi.stubGlobal('__TAURI__', {});
    const fetchMock = vi.fn((url: string) =>
      Promise.resolve(
        url.includes('/api/') ? jsonResponse({}, 503) : jsonResponse({ data: [word], count: 1 }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await loadVocab('spanish');

    expect(result.origin).toBe('static');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('loadVocabPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    registerSqliteVocabSource(null);
  });

  it('fetches a page from the API and encodes every filter param', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ data: [word], count: 25, page: 2, pages: 5, limit: 10 })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await loadVocabPage('spanish', {
      page: 2, limit: 10, search: 'hola', pos: 'noun', band: 'A1', domain: 'animals',
    });

    expect(result.origin).toBe('api');
    expect(result.words).toEqual([word]);
    expect(result.total).toBe(25);
    expect(result.page).toBe(2);
    expect(result.pages).toBe(5);
    expect(result.limit).toBe(10);

    const url = new URL(fetchMock.mock.calls[0][0] as string, 'http://localhost');
    expect(url.pathname).toBe('/api/vocab/spanish');
    expect(url.searchParams.get('page')).toBe('2');
    expect(url.searchParams.get('limit')).toBe('10');
    expect(url.searchParams.get('search')).toBe('hola');
    expect(url.searchParams.get('pos')).toBe('noun');
    expect(url.searchParams.get('band')).toBe('A1');
    expect(url.searchParams.get('domain')).toBe('animals');
  });

  it('defaults to page 1 when no page param is given', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [], count: 0, page: 1, pages: 1, limit: 100 }));
    vi.stubGlobal('fetch', fetchMock);

    await loadVocabPage('spanish');

    const url = new URL(fetchMock.mock.calls[0][0] as string, 'http://localhost');
    expect(url.searchParams.get('page')).toBe('1');
  });

  it('prefers a live API over a registered sqlite source, matching loadVocab', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [word], count: 1, page: 1, pages: 1, limit: 100 }));
    vi.stubGlobal('fetch', fetchMock);

    const sqliteLoadVocabPage = vi.fn().mockResolvedValue({ words: [word], total: 1, page: 1, pages: 1, limit: 100 });
    registerSqliteVocabSource({
      loadVocab: vi.fn(),
      loadLanguages: vi.fn(),
      loadVocabPage: sqliteLoadVocabPage,
    });

    const result = await loadVocabPage('spanish', { page: 1 });

    expect(result.origin).toBe('api');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sqliteLoadVocabPage).not.toHaveBeenCalled();
  });

  it('falls through to sqlite when the API is unreachable — the genuinely packaged case', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('network error'));
    vi.stubGlobal('fetch', fetchMock);

    const sqliteLoadVocabPage = vi.fn().mockResolvedValue({ words: [word], total: 1, page: 1, pages: 1, limit: 100 });
    registerSqliteVocabSource({
      loadVocab: vi.fn(),
      loadLanguages: vi.fn(),
      loadVocabPage: sqliteLoadVocabPage,
    });

    const result = await loadVocabPage('spanish', { page: 1 });

    expect(result.origin).toBe('sqlite');
    expect(sqliteLoadVocabPage).toHaveBeenCalledWith('spanish', { page: 1 });
  });

  it('throws when both the API and a registered sqlite source fail', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('network error'));
    vi.stubGlobal('fetch', fetchMock);

    registerSqliteVocabSource({
      loadVocab: vi.fn(),
      loadLanguages: vi.fn(),
      loadVocabPage: vi.fn().mockRejectedValue(new Error('no local db yet')),
    });

    await expect(loadVocabPage('spanish')).rejects.toThrow(/Could not load a page of vocabulary for "spanish"/);
  });

  it('throws a clear error when nothing answers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: 'down' }, 500));
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadVocabPage('spanish')).rejects.toThrow(/Could not load a page of vocabulary for "spanish"/);
  });
});
