/**
 * backend-probe.ts — "is there a real server behind this admin panel?"
 *
 * admin.ts bounces anyone without a backend back to the app, so this decides
 * whether a person gets thrown out of the panel. It used to be one fetch with a
 * 1.5 s abort, which conflated two very different answers:
 *
 *   - definitely no backend: connection refused, a non-OK status, or a 200 that
 *     isn't the health JSON (a static host serving index.html for every path);
 *   - a backend that hasn't answered *yet*.
 *
 * The API is single-threaded and briefly blocks while it (re)loads a language
 * (~1–2 s, and again after every admin edit), so the second case is routine —
 * and treating it as the first sent working users home, and made e2e runs
 * flaky. So only a slow answer earns a second, longer attempt; a definite "no"
 * is still immediate, which keeps the no-server case fast.
 */

type Verdict = 'yes' | 'no' | 'slow';

async function probeOnce(fetchFn: typeof fetch, timeoutMs: number): Promise<Verdict> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchFn('/api/health', { signal: controller.signal });
    if (!res.ok) return 'no';
    // Same non-JSON-response guard as admin-api.ts's apiCall: a static-only
    // host serving index.html for every unmatched path would otherwise read
    // as a reachable backend just because *something* answered 200.
    if (!(res.headers.get('content-type') ?? '').includes('application/json')) return 'no';
    const data = await res.json() as { status?: string };
    return data.status === 'ok' ? 'yes' : 'no';
  } catch (err) {
    return (err as { name?: string } | null)?.name === 'AbortError' ? 'slow' : 'no';
  } finally {
    clearTimeout(timer);
  }
}

export async function hasReachableBackend(
  fetchFn: typeof fetch = fetch,
  timeouts: readonly [number, number] = [1500, 8000],
): Promise<boolean> {
  const first = await probeOnce(fetchFn, timeouts[0]);
  if (first !== 'slow') return first === 'yes';
  return (await probeOnce(fetchFn, timeouts[1])) === 'yes';
}
