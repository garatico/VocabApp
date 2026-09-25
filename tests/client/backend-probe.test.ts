import { describe, it, expect, vi } from 'vitest';
import { hasReachableBackend } from '../../src/client/admin/backend-probe.ts';

const json = (body: unknown, init: ResponseInit = {}): Response =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' }, ...init });

/** A fetch that never answers on its own — it only rejects when aborted, as a real one does. */
function hangingFetch(): typeof fetch {
  return ((_url: unknown, init?: RequestInit) => new Promise((_res, rej) => {
    init?.signal?.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  })) as typeof fetch;
}

describe('hasReachableBackend', () => {
  it('yes for a healthy JSON answer', async () => {
    expect(await hasReachableBackend((async () => json({ status: 'ok' })) as typeof fetch)).toBe(true);
  });

  it('no, immediately, for definite negatives', async () => {
    const calls = vi.fn();
    const count = (r: () => Promise<Response>) => (async () => { calls(); return r(); }) as typeof fetch;

    expect(await hasReachableBackend(count(async () => json({ status: 'ok' }, { status: 503 })))).toBe(false);
    expect(await hasReachableBackend(count(async () =>
      new Response('<html></html>', { status: 200, headers: { 'content-type': 'text/html' } })))).toBe(false);
    expect(await hasReachableBackend(count(async () => json({ status: 'starting' })))).toBe(false);
    expect(await hasReachableBackend(count(async () => { throw new TypeError('Failed to fetch'); }))).toBe(false);
    // Each of those was one attempt: a definite "no" is never retried.
    expect(calls).toHaveBeenCalledTimes(4);
  });

  it('a slow first answer gets a second, longer chance', async () => {
    let n = 0;
    const slowThenOk = ((_u: unknown, init?: RequestInit) => {
      n++;
      if (n === 1) return hangingFetch()(_u as string, init);      // times out
      return Promise.resolve(json({ status: 'ok' }));
    }) as typeof fetch;
    expect(await hasReachableBackend(slowThenOk, [20, 500])).toBe(true);
    expect(n).toBe(2);
  });

  it('gives up (false) if it is still silent after the second attempt', async () => {
    expect(await hasReachableBackend(hangingFetch(), [20, 40])).toBe(false);
  });
});
