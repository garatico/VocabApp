/**
 * zoom-math.ts — the arithmetic behind the desktop app's zoom (see zoom.ts): no DOM, no Tauri, so it is
 * testable on its own.
 */

export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 3;
export const ZOOM_STEP = 0.1;

/** `z` held to the supported range and to two decimals (so repeated steps don't drift: 1.1 + 0.1 ≠ 1.2000000000000002). */
export function clampZoom(z: number): number {
  if (!Number.isFinite(z)) return 1;
  return Math.round(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z)) * 100) / 100;
}

/**
 * A touchpad pinch reaches the page as a wheel event with ctrlKey set, and a `deltaY` that is negative
 * when the fingers spread (zoom in). An exponential keeps a slow pinch fine and a fast one quick, and
 * makes zooming in then out by the same amount land back where it started.
 */
export function zoomFromWheel(current: number, deltaY: number, deltaMode = 0): number {
  const pixels = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 100 : deltaY;
  return clampZoom(current * Math.exp(-pixels * 0.01));
}

/** Two-finger pinch: the zoom when the gesture began, scaled by how far the fingers have moved apart. */
export function zoomFromPinch(startZoom: number, startDistance: number, distance: number): number {
  if (startDistance <= 0) return clampZoom(startZoom);
  return clampZoom(startZoom * (distance / startDistance));
}

/** Ctrl (or ⌘) with + / = / - / 0: zoom in, zoom in, zoom out, reset. Anything else: null (not a zoom key). */
export function zoomFromKey(current: number, e: { key: string; ctrlKey: boolean; metaKey: boolean }): number | null {
  if (!(e.ctrlKey || e.metaKey)) return null;
  if (e.key === '+' || e.key === '=') return clampZoom(current + ZOOM_STEP);
  if (e.key === '-' || e.key === '_') return clampZoom(current - ZOOM_STEP);
  if (e.key === '0') return 1;
  return null;
}
