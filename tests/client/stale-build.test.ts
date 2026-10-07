// @vitest-environment jsdom
/**
 * stale-build.test.ts — a mode whose code is gone after a deploy (vite:preloadError) reloads the page
 * once to pick up the new build, and doesn't loop if the reload didn't help (src/client/ui/stale-build.ts).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let dispose: (() => void) | undefined;
afterEach(() => { dispose?.(); dispose = undefined; });

beforeEach(() => { vi.resetModules(); sessionStorage.clear(); document.body.innerHTML = ''; });

function preloadError(): Event {
  const e = new Event('vite:preloadError', { cancelable: true });
  window.dispatchEvent(e);
  return e;
}

describe('stale build recovery', () => {
  it('reloads once when a lazily-loaded file is missing', async () => {
    const { initStaleBuildRecovery } = await import('../../src/client/ui/stale-build.ts');
    const reload = vi.fn();
    let t = 1_000_000;
    dispose = initStaleBuildRecovery(reload, () => t);
    const e = preloadError();
    expect(reload).toHaveBeenCalledOnce();
    expect(e.defaultPrevented).toBe(true);
    t += 2_000;                       // the reloaded page hits the same error straight away
    preloadError();
    expect(reload).toHaveBeenCalledOnce();
    expect(document.querySelector('.toast-error')?.textContent).toMatch(/couldn't load/);
    preloadError();                   // the same failure raising the event again says nothing new
    expect(document.querySelectorAll('.toast-error')).toHaveLength(1);
  });

  it('reloads again for a later deploy, once the window has passed', async () => {
    const { initStaleBuildRecovery } = await import('../../src/client/ui/stale-build.ts');
    const reload = vi.fn();
    let t = 1_000_000;
    dispose = initStaleBuildRecovery(reload, () => t);
    preloadError();
    t += 60_000;
    preloadError();
    expect(reload).toHaveBeenCalledTimes(2);
  });
});
