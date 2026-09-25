/**
 * sw.js — service worker.
 *
 * Three caching strategies, chosen per request type:
 *
 *   app shell (HTML, JS, CSS, fonts, icons)
 *     Stale-while-revalidate. The page opens instantly from cache and the
 *     newer copy lands in the background for next time. Vite hashes asset
 *     filenames, so a stale JS bundle can never be served against a new HTML.
 *
 *   /api/vocab/:lang (whole-language, no ?page)
 *     Stale-while-revalidate. Startup used to wait on the network before it
 *     could show a single word; now the cached copy answers immediately and a
 *     fresh one is fetched behind it. When the fresh copy differs (ETag), open
 *     pages are told so they can offer a reload — vocabulary only changes when
 *     the pipeline re-syncs, so one slightly stale launch is a fair trade for
 *     an instant one. First-ever load (nothing cached) still goes to network.
 *     Paged/filtered requests (?page=) stay network-first: they are queries,
 *     not a copy of the dataset.
 *
 *   images / emoji / svgs
 *     Stale-while-revalidate into their own capped cache (ASSET_CACHE_MAX
 *     entries, oldest evicted) so browsing every picture can't grow storage
 *     without bound.
 *
 *   everything else (/api/admin/*, POSTs)
 *     Straight to the network, never cached. Admin routes mutate state and
 *     caching them would be actively wrong.
 *
 * Bump CACHE_VERSION to evict every old cache on the next activation.
 */

// __BUILD_ID__ is replaced with a hash of the build by vite.config.js, so every
// deploy evicts old caches on its own. In dev the literal stays (the worker
// isn't registered in dev anyway).
const CACHE_VERSION = '__BUILD_ID__';
const SHELL_CACHE   = `vocab-shell-${CACHE_VERSION}`;
const VOCAB_CACHE   = `vocab-api-${CACHE_VERSION}`;
const ASSET_CACHE   = `vocab-assets-${CACHE_VERSION}`;
const ASSET_CACHE_MAX = 600;

// Only the entry points are precached by hand. Hashed assets are picked up on
// first use — listing them here would mean regenerating this file each build.
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      // addAll is atomic — one 404 would fail the whole install, so add
      // individually and tolerate misses.
      .then(cache => Promise.allSettled(PRECACHE_URLS.map(u => cache.add(u))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(
        names
          .filter(n => n !== SHELL_CACHE && n !== VOCAB_CACHE && n !== ASSET_CACHE)
          .map(n => caches.delete(n)),
      ))
      .then(() => self.clients.claim()),
  );
});

/** Is this a request for part of the app shell? */
function isShellAsset(url) {
  return url.origin === self.location.origin && (
    url.pathname === '/' ||
    url.pathname.endsWith('.html') ||
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/styles/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/data/') ||   // static vocabulary export
    url.pathname === '/manifest.webmanifest'
  );
}

/** Photos, emoji and SVGs — numerous and large, so they get a capped cache. */
function isMediaAsset(url) {
  return url.origin === self.location.origin && (
    url.pathname.startsWith('/svgs/') ||
    url.pathname.startsWith('/images/') ||
    url.pathname.startsWith('/emoji/')
  );
}

/** Drop the oldest entries beyond the cap (Cache.keys() is insertion-ordered). */
async function trimCache(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

async function notifyClients(message) {
  const all = await self.clients.matchAll({ type: 'window' });
  all.forEach(c => c.postMessage(message));
}

self.addEventListener('fetch', event => {
  const { request } = event;

  // Never interfere with anything that changes server state.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Admin routes are always live.
  if (url.pathname.startsWith('/api/admin')) return;

  // ── Vocabulary ─────────────────────────────────────────────────────────────
  if (url.pathname.startsWith('/api/vocab')) {
    const offline = () => new Response(
      JSON.stringify({
        error: 'offline',
        message: 'No cached vocabulary for this language yet. Load it once while online.',
      }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
    const store = response => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(VOCAB_CACHE).then(c => c.put(request, copy));
      }
      return response;
    };

    // Whole-language copy: stale-while-revalidate.
    if (!url.searchParams.has('page')) {
      event.respondWith(
        caches.match(request).then(cached => {
          const refresh = fetch(request).then(response => {
            if (cached && response.ok) {
              const before = cached.headers.get('ETag');
              const after  = response.headers.get('ETag');
              if (before && after && before !== after) {
                notifyClients({ type: 'VOCAB_UPDATED', url: url.pathname });
              }
            }
            return store(response);
          });
          if (cached) {
            // The background fetch is best-effort; being offline is fine here.
            event.waitUntil(refresh.catch(() => {}));
            return cached;
          }
          return refresh.catch(offline);
        }),
      );
      return;
    }

    // Paged queries: network-first, cache as the offline fallback.
    event.respondWith(
      fetch(request).then(store).catch(() => caches.match(request).then(c => c ?? offline())),
    );
    return;
  }

  // Other API calls: live only, no offline story.
  if (url.pathname.startsWith('/api/')) return;

  // ── Media: stale-while-revalidate into the capped cache ───────────────────
  if (isMediaAsset(url)) {
    event.respondWith(
      caches.open(ASSET_CACHE).then(cache => cache.match(request).then(cached => {
        const network = fetch(request).then(response => {
          if (response.ok) {
            cache.put(request, response.clone()).then(() => trimCache(ASSET_CACHE, ASSET_CACHE_MAX));
          }
          return response;
        }).catch(() => cached);
        return cached || network;
      })),
    );
    return;
  }

  // ── Shell: stale-while-revalidate ─────────────────────────────────────────
  if (isShellAsset(url)) {
    event.respondWith(
      // ignoreSearch: a manifest shortcut (public/manifest.webmanifest) opens
      // e.g. /?mode=picture — only "/" itself is precached, and Cache.match
      // treats a different query string as a different URL by default. Safe
      // to ignore here since nothing in PRECACHE_URLS is versioned by query
      // string (Vite hashes filenames instead — see the file header).
      caches.match(request, { ignoreSearch: true }).then(cached => {
        const network = fetch(request)
          .then(response => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(SHELL_CACHE).then(c => c.put(request, copy));
            }
            return response;
          })
          .catch(() => cached);
        return cached || network;
      }),
    );
    return;
  }

  // A navigation with nothing cached still needs to land somewhere sensible.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html')),
    );
  }
});

// Let the page trigger an immediate update rather than waiting for a reload.
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
