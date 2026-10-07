/**
 * column-view.ts — the sort and filter rules of a spreadsheet-style column header, shared.
 *
 * Extracted from the Admin panel's Table View (admin/admin-table.ts), which had them inline, so that every
 * grid with a header row sorts and filters the same way: click a header to sort ascending, again for
 * descending, a third time to put it back; type under a header to filter that column. Nothing here touches
 * the DOM or storage — a grid owns its rows and its state and asks these functions what to do with them.
 *
 * Filtering is Excel's "filter" more than its formulas: text columns match a substring, and numeric columns
 * additionally understand a comparison — `>100`, `<=50`, `=7`, or a range `10-50` / `10..50`. A plain number
 * is still a substring ("10" matches 10, 100, 1,010), which is what the Admin grid always did.
 */

export type SortDir = 'asc' | 'desc';

export interface SortState {
  /** The column being sorted, or null for "no column sort" (the grid's own natural order). */
  key: string | null;
  dir: SortDir;
}

/**
 * What clicking a header does: not sorted -> ascending -> descending -> not sorted. The third click returns
 * to the grid's natural order, the same as never having clicked.
 */
export function nextSort(state: SortState, key: string): SortState {
  if (state.key !== key) return { key, dir: 'asc' };
  if (state.dir === 'asc') return { key, dir: 'desc' };
  return { key: null, dir: 'asc' };
}

/** The arrow to draw in a header: none, or ▲ / ▼ for the sorted column. */
export function sortArrow(state: SortState, key: string): string {
  if (state.key !== key) return '';
  return state.dir === 'asc' ? ' ▲' : ' ▼';
}

/** `aria-sort`'s vocabulary, for headers that are real column headers. */
export function ariaSort(state: SortState, key: string): 'ascending' | 'descending' | 'none' {
  if (state.key !== key) return 'none';
  return state.dir === 'asc' ? 'ascending' : 'descending';
}

/**
 * Compare two cells of one column. Numeric columns compare as numbers, with blanks (and anything that is not
 * a number) last in *both* directions — a word with no rank belongs below the ranked ones whichever way you
 * look. Text compares with localeCompare, blanks last in both directions too, as a spreadsheet does.
 */
export function compareCells(a: string, b: string, numeric: boolean, dir: SortDir): number {
  const sign = dir === 'asc' ? 1 : -1;
  if (numeric) {
    const an = toNumber(a);
    const bn = toNumber(b);
    if (an === null && bn === null) return 0;
    if (an === null) return 1;
    if (bn === null) return -1;
    return (an - bn) * sign;
  }
  if (a === '' && b === '') return 0;
  if (a === '') return 1;
  if (b === '') return -1;
  return a.localeCompare(b) * sign;
}

function toNumber(s: string): number | null {
  if (s.trim() === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * A numeric filter's test, or null when the text is not a comparison (so it is matched as a substring).
 *   >n  >=n  <n  <=n  =n   — compare
 *   a-b  a..b              — inclusive range, either order
 */
export function parseNumericFilter(text: string): ((n: number) => boolean) | null {
  const t = text.trim();
  const cmp = /^(>=|<=|>|<|=)\s*(-?\d+(?:\.\d+)?)$/.exec(t);
  if (cmp) {
    const v = Number(cmp[2]);
    switch (cmp[1]) {
      case '>':  return n => n > v;
      case '>=': return n => n >= v;
      case '<':  return n => n < v;
      case '<=': return n => n <= v;
      default:   return n => n === v;
    }
  }
  const range = /^(\d+(?:\.\d+)?)\s*(?:-|\.\.)\s*(\d+(?:\.\d+)?)$/.exec(t);
  if (range) {
    const a = Number(range[1]);
    const b = Number(range[2]);
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    return n => n >= lo && n <= hi;
  }
  return null;
}

export interface MatchOptions {
  /** The column holds numbers, so a comparison / range filter applies. */
  numeric?: boolean;
  /** How both sides are normalised before a substring test. Default: lower-case. */
  fold?: (s: string) => string;
  /**
   * What a plain (non-comparison) filter is matched against, when that is richer than the cell's number —
   * a mastery level 3 that should also answer to "confident". Defaults to the cell itself.
   */
  text?: string;
}

/**
 * Does `cell` pass a column filter? An empty filter passes everything. A comparison filter on a numeric
 * column never passes a blank cell (a word with no rank is not "over 100").
 */
export function cellMatches(cell: string, needle: string, opts: MatchOptions = {}): boolean {
  const text = needle.trim();
  if (!text) return true;
  if (opts.numeric) {
    const test = parseNumericFilter(text);
    if (test) {
      const n = toNumber(cell);
      return n !== null && test(n);
    }
  }
  const fold = opts.fold ?? ((s: string) => s.toLowerCase());
  return fold(opts.text ?? cell).includes(fold(text));
}

/**
 * Sort `items` by a column, returning a new array. `valueOf` reads the sortable text of an item for that
 * column; a null key returns the items in their given order (a copy, so callers can always mutate).
 */
export function sortByColumn<T>(
  items: readonly T[],
  state: SortState,
  valueOf: (item: T, key: string) => string,
  isNumeric: (key: string) => boolean,
): T[] {
  const out = [...items];
  const key = state.key;
  if (!key) return out;
  const numeric = isNumeric(key);
  return out.sort((a, b) => compareCells(valueOf(a, key), valueOf(b, key), numeric, state.dir));
}
