/**
 * column-resize.ts — resizing a grid's columns the way a spreadsheet does, shared.
 *
 * Extracted from the Admin panel's Table View (admin/admin-table.ts), which had both inline, so My Lists'
 * word lists size their columns the same way: drag a header's right edge to set the width, double-click it to
 * fit the column to its widest content. Nothing here knows what a column holds or where widths are stored — a
 * grid passes in how to read and write a width, and which strings to fit.
 */

export const MIN_COLUMN_WIDTH = 50;
export const MAX_COLUMN_WIDTH = 480;

export const clampWidth = (px: number, min = MIN_COLUMN_WIDTH, max = MAX_COLUMN_WIDTH): number =>
  Math.max(min, Math.min(max, Math.round(px)));

/** One canvas context, reused: text measurement itself is stateless, creating a context per call is not free. */
let measureCtx: CanvasRenderingContext2D | null = null;

/** Width in px of `text` in a CSS font shorthand (e.g. `getComputedStyle(el).font`). */
export function measureTextWidth(font: string, text: string): number {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
  if (!measureCtx) return text.length * 7;   // no canvas (a bare test DOM): a rough monospace guess
  measureCtx.font = font;
  return measureCtx.measureText(text).width;
}

export interface AutoFitOptions {
  /** CSS font of the cells. */
  font: string;
  label: string;
  /** CSS font of the header label, when it is not the cells' (a small upper-case label over body text). */
  labelFont?: string;
  /** The text of every cell in the column that should be able to fit. */
  cells: Iterable<string>;
  /** Room for the header's sort arrow / filter affordance. Default 24. */
  labelExtra?: number;
  /** The cell's own padding (and a pill's, if it holds one). Default 28. */
  cellExtra?: number;
  min?: number;
  max?: number;
}

/**
 * The width that fits a column's widest content, header label included — measured with canvas text metrics
 * rather than a DOM element, because doing it for every row on every double-click would otherwise force a layout
 * per row instead of one cheap measureText() each.
 */
export function autoFitWidth(o: AutoFitOptions): number {
  let widest = measureTextWidth(o.labelFont ?? o.font, o.label) + (o.labelExtra ?? 24);
  for (const text of o.cells) {
    if (!text) continue;
    const w = measureTextWidth(o.font, text);
    if (w > widest) widest = w;
  }
  return clampWidth(Math.round(widest) + (o.cellExtra ?? 28), o.min, o.max);
}

export interface DragResizeOptions {
  /** The column's width right now, read when the drag starts. */
  getWidth(): number;
  /** Apply a width live while dragging. */
  setWidth(px: number): void;
  /** The drag ended: save `px`. */
  onDone(px: number): void;
  min?: number;
}

/**
 * Make `handle` drag-resize a column: press, move, release. Stops the press reaching anything underneath
 * (a sort button, a native drag-to-reorder), since resizing is a drag of its own.
 */
export function attachDragResize(handle: HTMLElement, o: DragResizeOptions): void {
  handle.draggable = false;
  handle.addEventListener('mousedown', e => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = o.getWidth();
    let width = startWidth;

    function onMove(ev: MouseEvent): void {
      width = Math.max(o.min ?? MIN_COLUMN_WIDTH, startWidth + (ev.clientX - startX));
      o.setWidth(width);
    }
    function onUp(): void {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      o.onDone(width);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}
