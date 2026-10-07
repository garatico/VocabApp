/**
 * stale-build.ts — recover when a lazily-loaded mode's code is gone.
 *
 * Every mode past the first paint (My Lists, History, Picture Quiz…) is its own content-hashed file,
 * fetched the first time its tab opens. A tab left open across a deploy still holds the old page, which
 * asks for the old file names; the host only has the new ones, so the import failed and the tab simply
 * didn't open, with an unhandled rejection as the only trace. Vite raises `vite:preloadError` for exactly
 * this; reloading picks up the new build. A reload that already happened moments ago (the file is missing
 * for some other reason, or the network is down) is not repeated: the learner is told instead.
 */

import { showToast } from './toast.ts';

// sessionStorage, not a learner-data key: deliberately outside the storage-keys.ts prefixes.
const KEY = 'vocabapp:staleBuildReloadAt';
const WINDOW_MS = 10_000;

export function initStaleBuildRecovery(
  reload: () => void = () => window.location.reload(),
  now: () => number = Date.now,
): () => void {
  let told = false;   // one failed load can raise the event more than once (the module and its CSS)
  const onError = (event: Event): void => {
    let last = 0;
    try { last = Number(sessionStorage.getItem(KEY)) || 0; } catch { /* storage blocked: treat as never */ }
    if (now() - last < WINDOW_MS) {
      if (!told) showToast("Part of the app couldn't load. Check your connection, then reload the page.", 'error', 8000);
      told = true;
      return;
    }
    event.preventDefault();   // handled: don't also surface it as an uncaught error
    try { sessionStorage.setItem(KEY, String(now())); } catch { /* reload anyway */ }
    reload();
  };
  window.addEventListener('vite:preloadError', onError);
  return () => window.removeEventListener('vite:preloadError', onError);
}
