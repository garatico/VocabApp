/**
 * pwa.ts — service worker registration, update prompt and offline indicator.
 *
 * Deliberately not registered during `vite dev`: a service worker caching the
 * dev server's modules is a reliable way to spend an afternoon debugging a
 * stale bundle. Production only.
 */

import { logger } from './logger.ts';
import { isPackagedApp } from '../data/vocab-source.ts';

const SW_URL = '/sw.js';

/** Vite replaces import.meta.env.DEV at build time. */
function isDev(): boolean {
  try {
    return Boolean((import.meta as { env?: { DEV?: boolean } }).env?.DEV);
  } catch {
    return false;
  }
}

// ── Offline indicator ─────────────────────────────────────────────────────────

let offlineBar: HTMLElement | null = null;

function showOfflineBar(): void {
  if (offlineBar) return;
  offlineBar = document.createElement('div');
  offlineBar.className = 'pwa-offline-bar';
  offlineBar.setAttribute('role', 'status');

  const msg = document.createElement('span');
  msg.textContent =
    'Offline — your lists and progress still work. Vocabulary you have already loaded is available.';

  const dismiss = document.createElement('button');
  dismiss.type      = 'button';
  dismiss.className = 'pwa-offline-dismiss';
  dismiss.title     = 'Dismiss';
  dismiss.textContent = '×';
  dismiss.addEventListener('click', () => hideOfflineBar());

  offlineBar.append(msg, dismiss);
  document.body.appendChild(offlineBar);
}

function hideOfflineBar(): void {
  offlineBar?.remove();
  offlineBar = null;
}

/**
 * A packaged Tauri/Capacitor build is entirely local — vocab is bundled, see
 * vocab-source.ts's isPackagedApp() — so it never depends on network at all.
 * Reporting "offline" there would be alarming and wrong: nothing about the
 * app actually stopped working just because the OS lost connectivity.
 */
function bindConnectivity(): void {
  if (isPackagedApp()) return;
  window.addEventListener('offline', showOfflineBar);
  window.addEventListener('online',  hideOfflineBar);
  if (!navigator.onLine) showOfflineBar();
}

// ── Update prompt ─────────────────────────────────────────────────────────────

/**
 * Offer the new version rather than swapping it in mid-session.
 *
 * Reloading underneath someone halfway through a quiz would lose their
 * answers — quiz state lives in the DOM in several modes.
 */
function showUpdatePrompt(worker: ServiceWorker): void {
  if (document.querySelector('.pwa-update-toast')) return;

  const toast = document.createElement('div');
  toast.className = 'pwa-update-toast';
  toast.setAttribute('role', 'status');

  const msg = document.createElement('span');
  msg.textContent = 'A new version is ready.';

  const reload = document.createElement('button');
  reload.type = 'button';
  reload.className = 'pwa-update-btn';
  reload.textContent = 'Reload';
  reload.addEventListener('click', () => {
    worker.postMessage('SKIP_WAITING');
    window.location.reload();
  });

  const later = document.createElement('button');
  later.type = 'button';
  later.className = 'pwa-update-dismiss';
  later.title = 'Dismiss';
  later.textContent = '×';
  later.addEventListener('click', () => toast.remove());

  toast.append(msg, reload, later);
  document.body.appendChild(toast);
}

// ── Registration ──────────────────────────────────────────────────────────────

export function initPWA(): void {
  bindConnectivity();

  if (!('serviceWorker' in navigator)) return;
  if (isDev()) {
    logger.info('pwa: service worker not registered in dev');
    return;
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker.register(SW_URL)
      .then(reg => {
        logger.info('pwa: service worker registered');

        // A worker already waiting means an update landed on a previous visit.
        if (reg.waiting) showUpdatePrompt(reg.waiting);

        reg.addEventListener('updatefound', () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            // 'installed' with an existing controller means this is an update,
            // not the very first install.
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              showUpdatePrompt(installing);
            }
          });
        });
      })
      .catch(err => logger.warn('pwa: service worker registration failed', err));
  });
}
