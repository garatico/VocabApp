/**
 * vocab-source.test.ts — API/static fallback ordering and Render-cold-start retry.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadVocab, resetOrigin } from '../../src/client/data/vocab-source.js';

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
});
