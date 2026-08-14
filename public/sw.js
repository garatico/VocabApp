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
 *   /api/vocab/*
 *     Network-first, falling back to cache. This is what makes the app usable
 *     offline: the last vocabulary you loaded stays available. It is also the
 *     one request that must be fresh when the network is there, since the
 *     pipeline rewrites it.
 *
 *   everything else (/api/admin/*, POSTs)
 *     Straight to the network, never cached. Admin routes mutate state and
 *     caching them would be actively wrong.
 *
 * Bump CACHE_VERSION to evict every old cache on the next activation.
 */

const CACHE_VERSION = 'v1';
const SHELL_CACHE   = `vocab-shell-${CACHE_VERSION}`;
const VOCAB_CACHE   = `vocab-api-${CACHE_VERSION}`;

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
          .filter(n => n !== SHELL_CACHE && n !== VOCAB_CACHE)
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
    url.pathname.startsWith('/svgs/') ||
    url.pathname.startsWith('/images/') ||
    url.pathname.startsWith('/emoji/') ||
    url.pathname === '/manifest.webmanifest'
  );
}

self.addEventListener('fetch', event => {
  const { request } = event;

  // Never interfere with anything that changes server state.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Admin routes are always live.
  if (url.pathname.startsWith('/api/admin')) return;

  // ── Vocabulary: network-first, cache as the offline fallback ──────────────
  if (url.pathname.startsWith('/api/vocab')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(VOCAB_CACHE).then(c => c.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request).then(
          cached => cached ?? new Response(
            JSON.stringify({
              error: 'offline',
              message: 'No cached vocabulary for this language yet. '
                     + 'Load it once while online.',
            }),
            { status: 503, headers: { 'Content-Type': 'application/json' } },
          ),
        )),
    );
    return;
  }

  // Other API calls: live only, no offline story.
  if (url.pathname.startsWith('/api/')) return;

  // ── Shell: stale-while-revalidate ─────────────────────────────────────────
  if (isShellAsset(url)) {
    event.respondWith(
      caches.match(request).then(cached => {
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
