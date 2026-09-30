/**
 * zoom.ts — pinch-to-zoom (and Ctrl +/−/0) for the desktop app.
 *
 * A packaged Tauri window has no browser chrome, and WebView2 zoom is off by default there, so nothing
 * would otherwise zoom the page. This drives the webview's own zoom (the same one Ctrl +/- gives in a
 * browser, so layout, viewport units and scrolling all stay correct) from:
 *   - a touchpad pinch, which Windows delivers as ctrl+wheel;
 *   - a two-finger pinch on a touch screen;
 *   - Ctrl (or ⌘) with +, − and 0.
 * The level is remembered (Settings' app_zoom) and re-applied on the next launch.
 *
 * Only ever imported via dynamic import() behind isPackagedApp(), like the rest of this folder, so the
 * web bundle never pulls in the Tauri API.
 */

import { getCurrentWebview } from '@tauri-apps/api/webview';
import { Settings } from '../settings.ts';
import { clampZoom, zoomFromWheel, zoomFromPinch, zoomFromKey } from './zoom-math.ts';
import { logger } from '../utils/logger.ts';

let zoom = 1;
let pending: number | null = null;

/** Applies `next` to the webview, coalescing a burst of pinch events into one call per frame. */
function setZoom(next: number): void {
  zoom = clampZoom(next);
  Settings.setAppZoom(zoom);
  showZoom();
  if (pending !== null) return;
  pending = window.requestAnimationFrame(() => {
    pending = null;
    getCurrentWebview().setZoom(zoom).catch(err => logger.warn('webview zoom failed', err));
  });
}

/** Settings' "Window zoom" row: only exists to be shown in the packaged app, where it reads out the level. */
function showZoom(): void {
  const el = document.getElementById('settingAppZoomValue');
  if (el) el.textContent = `${Math.round(zoom * 100)}%`;
}

const touchDistance = (t: TouchList): number => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

export function initAppZoom(): void {
  // WebView2's own touch pinch is a visual zoom that would fight this one; leave panning to the page only.
  document.documentElement.style.touchAction = 'pan-x pan-y';
  zoom = clampZoom(Settings.getAppZoom());
  const row = document.getElementById('settingAppZoomRow');
  if (row) row.hidden = false;
  document.getElementById('settingAppZoomReset')?.addEventListener('click', () => setZoom(1));
  showZoom();
  if (zoom !== 1) getCurrentWebview().setZoom(zoom).catch(err => logger.warn('webview zoom failed', err));

  // Touchpad pinch (ctrl+wheel). Not passive: the default would be to scroll or, in a browser, zoom the page.
  window.addEventListener('wheel', e => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    setZoom(zoomFromWheel(zoom, e.deltaY, e.deltaMode));
  }, { passive: false });

  // Touch-screen pinch.
  let startZoom = 1, startDistance = 0;
  window.addEventListener('touchstart', e => {
    if (e.touches.length === 2) { startZoom = zoom; startDistance = touchDistance(e.touches); }
  }, { passive: true });
  window.addEventListener('touchmove', e => {
    if (e.touches.length !== 2 || startDistance <= 0) return;
    e.preventDefault();
    setZoom(zoomFromPinch(startZoom, startDistance, touchDistance(e.touches)));
  }, { passive: false });
  window.addEventListener('touchend', () => { startDistance = 0; }, { passive: true });

  window.addEventListener('keydown', e => {
    const next = zoomFromKey(zoom, e);
    if (next === null) return;
    e.preventDefault();
    setZoom(next);
  });
}
