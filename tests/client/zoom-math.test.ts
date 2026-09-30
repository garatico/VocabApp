/**
 * zoom-math.test.ts — the arithmetic behind the desktop app's pinch / Ctrl-wheel / keyboard zoom.
 */
import { describe, it, expect } from 'vitest';
import { clampZoom, zoomFromWheel, zoomFromPinch, zoomFromKey, MIN_ZOOM, MAX_ZOOM } from '../../src/client/tauri/zoom-math.ts';

describe('clampZoom', () => {
  it('holds the range, rounds to two decimals, and shrugs off nonsense', () => {
    expect(clampZoom(0.1)).toBe(MIN_ZOOM);
    expect(clampZoom(9)).toBe(MAX_ZOOM);
    expect(clampZoom(1.1 + 0.1)).toBe(1.2);
    expect(clampZoom(NaN)).toBe(1);
  });
});

describe('zoomFromWheel', () => {
  it('spreading the fingers (negative deltaY) zooms in, pinching zooms out', () => {
    expect(zoomFromWheel(1, -10)).toBeGreaterThan(1);
    expect(zoomFromWheel(1, 10)).toBeLessThan(1);
  });
  it('zooming in then out by the same amount lands back where it started', () => {
    expect(zoomFromWheel(zoomFromWheel(1, -20), 20)).toBeCloseTo(1, 1);
  });
  it('reads line- and page-based wheels, and stays in range', () => {
    expect(zoomFromWheel(1, -1, 1)).toBeGreaterThan(zoomFromWheel(1, -1, 0));
    expect(zoomFromWheel(3, -500)).toBe(MAX_ZOOM);
  });
});

describe('zoomFromPinch', () => {
  it('scales the starting zoom by how far the fingers moved apart', () => {
    expect(zoomFromPinch(1, 100, 150)).toBe(1.5);
    expect(zoomFromPinch(2, 100, 50)).toBe(1);
    expect(zoomFromPinch(1.4, 0, 80)).toBe(1.4);   // no usable start distance: unchanged
  });
});

describe('zoomFromKey', () => {
  const ctrl = (key: string) => ({ key, ctrlKey: true, metaKey: false });
  it('Ctrl + / = zoom in, Ctrl - zooms out, Ctrl 0 resets', () => {
    expect(zoomFromKey(1, ctrl('='))).toBe(1.1);
    expect(zoomFromKey(1, ctrl('+'))).toBe(1.1);
    expect(zoomFromKey(1, ctrl('-'))).toBe(0.9);
    expect(zoomFromKey(1.7, ctrl('0'))).toBe(1);
  });
  it('ignores keys without Ctrl/⌘ and other keys', () => {
    expect(zoomFromKey(1, { key: '=', ctrlKey: false, metaKey: false })).toBeNull();
    expect(zoomFromKey(1, ctrl('a'))).toBeNull();
    expect(zoomFromKey(1, { key: '-', ctrlKey: false, metaKey: true })).toBe(0.9);
  });
});
