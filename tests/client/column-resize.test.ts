// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  clampWidth, measureTextWidth, autoFitWidth, attachDragResize, MIN_COLUMN_WIDTH, MAX_COLUMN_WIDTH,
} from '../../src/client/utils/column-resize.ts';

/**
 * jsdom has no canvas; give it one whose text is 10px a character, or 2px a character in the font called
 * 'label', so widths are easy to reason about. (column-resize.ts keeps its context across calls, so this one
 * decides what every test in the file measures with — it reads the font at measure time.)
 */
function stubCanvas(): void {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => {
    const ctx = {
      font: '',
      measureText(text: string) { return { width: text.length * (ctx.font === 'label' ? 2 : 10) }; },
    };
    return ctx;
  }) as unknown as typeof HTMLCanvasElement.prototype.getContext);
}

describe('clampWidth', () => {
  it('keeps a width inside the bounds and rounds it', () => {
    expect(clampWidth(200.4)).toBe(200);
    expect(clampWidth(5)).toBe(MIN_COLUMN_WIDTH);
    expect(clampWidth(9999)).toBe(MAX_COLUMN_WIDTH);
    expect(clampWidth(20, 10, 100)).toBe(20);
    expect(clampWidth(500, 10, 100)).toBe(100);
  });
});

describe('measureTextWidth / autoFitWidth', () => {
  beforeEach(stubCanvas);
  afterEach(() => vi.restoreAllMocks());

  it('measures text in a font', () => {
    expect(measureTextWidth('12px Sora', 'hello')).toBe(50);
  });

  it('fits the widest cell, plus the cell padding', () => {
    // cells: widest is 8 chars = 80px; label "AB" is 20 + 24 = 44px; so 80 + 28
    expect(autoFitWidth({ font: 'x', label: 'AB', cells: ['abc', 'abcdefgh', ''] })).toBe(108);
  });

  it('lets a long header label set the width when the cells are short', () => {
    // label 10 chars = 100 + 24 = 124 beats the 20px cell; + 28
    expect(autoFitWidth({ font: 'x', label: 'Definition', cells: ['ab'] })).toBe(152);
  });

  it('measures the header label in its own font, not the cells', () => {
    // The label is 10 chars: 100px in the cells' font but only 20px in the label's. The widest cell is 40px.
    const base = { font: 'cells', label: 'XXXXXXXXXX', cells: ['abcd'], labelExtra: 0, cellExtra: 10 };
    expect(autoFitWidth({ ...base, labelFont: 'label' })).toBe(50);   // cells win: 40 + 10
    expect(autoFitWidth(base)).toBe(110);                             // same font: the label wins, 100 + 10
  });

  it('clamps to the minimum and maximum', () => {
    expect(autoFitWidth({ font: 'x', label: '', cells: [], labelExtra: 0, cellExtra: 0 })).toBe(MIN_COLUMN_WIDTH);
    expect(autoFitWidth({ font: 'x', label: '', cells: ['a'.repeat(200)] })).toBe(MAX_COLUMN_WIDTH);
    expect(autoFitWidth({ font: 'x', label: '', cells: ['abc'], min: 100, max: 120, cellExtra: 0, labelExtra: 0 })).toBe(100);
  });
});

describe('attachDragResize', () => {
  const mouse = (type: string, x: number): MouseEvent => new MouseEvent(type, { clientX: x, bubbles: true, cancelable: true });

  it('widens by how far the pointer moved, live, and reports the final width once on release', () => {
    const handle = document.createElement('span');
    document.body.appendChild(handle);
    let width = 120;
    const live: number[] = [];
    const done: number[] = [];
    attachDragResize(handle, { getWidth: () => width, setWidth: px => { width = px; live.push(px); }, onDone: px => done.push(px) });

    handle.dispatchEvent(mouse('mousedown', 100));
    document.dispatchEvent(mouse('mousemove', 130));
    document.dispatchEvent(mouse('mousemove', 160));
    expect(live).toEqual([150, 180]);
    expect(done).toEqual([]);

    document.dispatchEvent(mouse('mouseup', 160));
    expect(done).toEqual([180]);

    // Released: further movement does nothing.
    document.dispatchEvent(mouse('mousemove', 400));
    expect(live).toEqual([150, 180]);
    handle.remove();
  });

  it('never goes below the minimum width', () => {
    const handle = document.createElement('span');
    let width = 80;
    attachDragResize(handle, { getWidth: () => width, setWidth: px => { width = px; }, onDone: () => {}, min: 60 });
    handle.dispatchEvent(mouse('mousedown', 500));
    document.dispatchEvent(mouse('mousemove', 0));
    expect(width).toBe(60);
    document.dispatchEvent(mouse('mouseup', 0));
  });

  it('keeps the press from reaching a sort button or a native drag underneath', () => {
    const handle = document.createElement('span');
    attachDragResize(handle, { getWidth: () => 100, setWidth: () => {}, onDone: () => {} });
    const down = mouse('mousedown', 1);
    const stop = vi.spyOn(down, 'stopPropagation');
    handle.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    expect(stop).toHaveBeenCalled();
    expect(handle.draggable).toBe(false);
    document.dispatchEvent(mouse('mouseup', 1));
  });
});
