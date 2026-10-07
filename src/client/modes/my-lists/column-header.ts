/**
 * column-header.ts — the spreadsheet-style header over a My Lists word list, shared by every list type
 * (Single-Language, Cross-Language, Smart, Browse All Words).
 *
 * Columns: Word, POS, CEFR, Rank, Definition, Percent, Mastered. Each has
 *   - a button that sorts by it (ascending, descending, off — the Admin Table View's own cycle),
 *   - a filter under it: a text box, or for POS and CEFR a checklist where every value starts on and unticking
 *     one turns it off, and
 *   - a right edge you drag to resize it; double-click the edge to fit the column to its widest content (the
 *     same logic as the Admin grid's, in utils/column-resize.ts).
 * The rules for sorting and the text filters are in utils/column-view.ts, which the Admin grid uses too; this
 * file is the part that knows about words.
 *
 * What a panel does with it:
 *   const columns = createColumnHeader({ onChange: …, hasCheckbox: true });
 *   toolbar.append(columns.toggleBtn);          // shows/hides the filter boxes
 *   panel.append(columns.el);  columns.attach(listEl, actionsWidth);   // header above its list
 *   …in its filter step:  items = applyColumnFilters(items, columns, info, reader);
 *   …in its sort step:    items = applyColumnSort(items, columns, info, reader) ?? itsOwnSort(items);
 *   …after drawing rows:  columns.sync();
 *
 * A list with no column selected keeps its own order (alphabetical, or the order words were added, or a smart
 * list's rule); the header's sort replaces it while a column is selected. Every filter is additive with the others.
 */

import { foldKey as norm } from '../../utils/match.ts';
import { readString, writeString } from '../../utils/storage.ts';
import { getWordTallies } from '../../utils/session-history.ts';
import {
  nextSort, sortArrow, sortByColumn, cellMatches, type SortState,
} from '../../utils/column-view.ts';
import { autoFitWidth, attachDragResize, clampWidth } from '../../utils/column-resize.ts';
import { masteryLevelLookup, MASTERY_LEVELS } from './mastery.ts';
import { percentFromTally, MASTERY_GLYPHS } from './row-shared.ts';
import { BANDS, POS_ABBREV, POS_CHIPS, type VocabEntry } from './types.ts';

export type ColKey = 'word' | 'pos' | 'band' | 'rank' | 'definition' | 'percent' | 'mastered';

export interface ColumnDef {
  key: ColKey;
  label: string;
  /** The grid line the column sits on — the row template in my-lists.css names them. */
  track: string;
  /** Numbers: sorted as numbers, and the filter box takes `>100`, `10-50` … */
  numeric: boolean;
  /** `choice` columns filter with a checklist of values; the rest with a text box. */
  kind: 'text' | 'choice';
  hint: string;
  title: string;
}

export const COLUMNS: readonly ColumnDef[] = [
  { key: 'word',       label: 'Word',       track: 'word',     numeric: false, kind: 'text',   hint: 'Filter…', title: 'The word' },
  { key: 'pos',        label: 'POS',        track: 'pos',      numeric: false, kind: 'choice', hint: '',        title: 'Part of speech — untick the ones to hide' },
  { key: 'band',       label: 'CEFR',       track: 'band',     numeric: false, kind: 'choice', hint: '',        title: 'CEFR level — untick the ones to hide' },
  { key: 'rank',       label: 'Rank',       track: 'rank',     numeric: true,  kind: 'text',   hint: '>100',    title: 'Frequency rank — 50, >100, <=500, 10-50' },
  { key: 'definition', label: 'Definition', track: 'trans',    numeric: false, kind: 'text',   hint: 'Filter…', title: 'Translation and glosses' },
  { key: 'percent',    label: 'Percent',    track: 'pct',      numeric: true,  kind: 'text',   hint: '<50',     title: 'Quiz record, % correct — try <50 for your weak words' },
  { key: 'mastered',   label: 'Mastered',   track: 'mastered', numeric: true,  kind: 'choice', hint: '',        title: 'Your mastery level — untick the ones to hide (untick Mastered to hide what you already know)' },
];

const COLUMN_BY_KEY = new Map<ColKey, ColumnDef>(COLUMNS.map(c => [c.key, c]));
export const isColKey = (k: string): k is ColKey => COLUMN_BY_KEY.has(k as ColKey);

/** What to sort and filter: a word, the language it is in, and its vocabulary entry when that has loaded. */
export interface ColumnItem {
  lang: string;
  word: string;
  entry?: VocabEntry;
}

// ── Saved sort ───────────────────────────────────────────────────────────────

/** Saved as `<column>-<asc|desc>`, or `none`. Browse All Words' old dropdown saved rank-asc / rank-desc /
 *  alpha-asc / alpha-desc; those still read (alpha was the Word column). */
export function parseSort(saved: string | null, fallback: SortState): SortState {
  if (saved === 'none') return { key: null, dir: 'asc' };
  const m = /^([a-z]+)-(asc|desc)$/.exec(saved ?? '');
  if (!m) return fallback;
  const key = m[1] === 'alpha' ? 'word' : m[1];
  return isColKey(key) ? { key, dir: m[2] as 'asc' | 'desc' } : fallback;
}

export const serializeSort = (s: SortState): string => (s.key ? `${s.key}-${s.dir}` : 'none');

// ── Reading cells ────────────────────────────────────────────────────────────

export interface CellReader {
  /** The cell's own value — a number as a string for the numeric columns, blank when there is none. */
  cell(item: ColumnItem, key: ColKey): string;
  /** What a plain-text filter matches: the cell, plus whatever else a person would type for it. */
  text(item: ColumnItem, key: ColKey): string;
  /** What sorting compares: the cell, except Word, which ignores accents and case. */
  sortValue(item: ColumnItem, key: ColKey): string;
}

/**
 * A reader for one render. The saved mastery levels and quiz tallies are each one storage read per language,
 * so they are snapshotted the first time a language is asked about and reused for every word after it —
 * reading them per word would parse the same JSON tens of thousands of times.
 */
export function createCellReader(): CellReader {
  const perLang = new Map<string, { level: (w: string) => number; tallies: ReturnType<typeof getWordTallies> }>();
  const snap = (lang: string): { level: (w: string) => number; tallies: ReturnType<typeof getWordTallies> } => {
    let s = perLang.get(lang);
    if (!s) { s = { level: masteryLevelLookup(lang), tallies: getWordTallies(lang) }; perLang.set(lang, s); }
    return s;
  };
  const posLabel = (pos: string): string => POS_CHIPS.find(c => c.value === pos)?.label ?? '';

  const cell = (it: ColumnItem, key: ColKey): string => {
    const e = it.entry;
    switch (key) {
      case 'word':       return it.word;
      case 'pos':        return e?.pos ?? '';
      case 'band':       return e?.band ?? '';
      case 'rank':       return e?.rank != null ? String(e.rank) : '';
      case 'definition': return e?.translation ?? '';
      case 'percent':    { const p = percentFromTally(snap(it.lang).tallies[it.word]); return p === null ? '' : String(p); }
      case 'mastered':   return String(snap(it.lang).level(it.word));
    }
  };
  const text = (it: ColumnItem, key: ColKey): string => {
    const e = it.entry;
    switch (key) {
      case 'pos':        return `${e?.pos ?? ''} ${POS_ABBREV[e?.pos ?? ''] ?? ''} ${posLabel(e?.pos ?? '')}`;
      case 'definition': return e ? [e.translation, ...e.glosses].join(' ') : '';
      case 'mastered':   { const lv = snap(it.lang).level(it.word); return `${lv} ${MASTERY_LEVELS[lv] ?? ''}`; }
      default:           return cell(it, key);
    }
  };
  const sortValue = (it: ColumnItem, key: ColKey): string => (key === 'word' ? norm(it.word) : cell(it, key));
  return { cell, text, sortValue };
}

// ── Applying the header to a list ─────────────────────────────────────────────

/** Just what applyColumnFilters / applyColumnSort need from a header, so they work on a plain object too. */
export interface ColumnView {
  readonly sort: SortState;
  /** Text filters, by column. */
  readonly filters: ReadonlyMap<ColKey, string>;
  /** The values left on in the POS, CEFR and Mastered checklists; empty means all of them are on. The Mastered
   *  values are the level numbers as strings ('0' New … '4' Mastered). */
  readonly sets: {
    readonly pos: ReadonlySet<string>;
    readonly band: ReadonlySet<string>;
    readonly mastered: ReadonlySet<string>;
  };
}

/** The checklist columns. */
type ChoiceKey = 'pos' | 'band' | 'mastered';

/** Is any filter narrowing the list? (Not the sort.) */
export function hasColumnFilters(view: ColumnView): boolean {
  return view.filters.size > 0 || view.sets.pos.size > 0 || view.sets.band.size > 0 || view.sets.mastered.size > 0;
}

/** The items that pass every column filter. A panel with none set gets its own array back untouched. */
export function applyColumnFilters<T>(
  items: readonly T[], view: ColumnView, info: (item: T) => ColumnItem, reader: CellReader,
): T[] {
  if (!hasColumnFilters(view)) return items as T[];
  return items.filter(item => {
    const it = info(item);
    if (view.sets.pos.size > 0 && !view.sets.pos.has(it.entry?.pos ?? '')) return false;
    if (view.sets.band.size > 0 && !view.sets.band.has(it.entry?.band ?? '')) return false;
    if (view.sets.mastered.size > 0 && !view.sets.mastered.has(reader.cell(it, 'mastered'))) return false;
    for (const [key, needle] of view.filters) {
      const numeric = COLUMN_BY_KEY.get(key)?.numeric ?? false;
      if (!cellMatches(reader.cell(it, key), needle, { numeric, fold: norm, text: reader.text(it, key) })) return false;
    }
    return true;
  });
}

/** The items sorted by the selected column, or null when no column is selected (the panel's own sort applies). */
export function applyColumnSort<T>(
  items: readonly T[], view: ColumnView, info: (item: T) => ColumnItem, reader: CellReader,
): T[] | null {
  const key = view.sort.key;
  if (!key || !isColKey(key)) return null;
  const numeric = COLUMN_BY_KEY.get(key)?.numeric ?? false;
  // Sort keys read once per item, not once per comparison — Word's accent-insensitive key is a regex.
  const decorated = items.map(item => ({ item, v: reader.sortValue(info(item), key) }));
  return sortByColumn(decorated, view.sort, d => d.v, () => numeric).map(d => d.item);
}

// ── Layout constants ─────────────────────────────────────────────────────────

/**
 * Below this list width the rows cannot hold the aligned columns (the full grid needs ~790px plus the list's
 * scrollbar and padding), so header and rows switch to a compact layout: a stacked header behind the Columns
 * button, and the row's action buttons on a line of their own. It is the *list's* width, not the screen's —
 * beside a 440px sidebar a 1024px window leaves the panel only ~570px.
 */
const COMPACT_BELOW_PX = 800;

/**
 * Width of a row's action column — fixed, so the header can match it. The row's actions (due reminders, edit, move,
 * remove / add) live in one menu behind a single button, so it is the same for every list type.
 */
export const ACTIONS_WIDTH = '44px';

/** Where resized column widths are remembered — one set for every list type, so a list looks like the last. */
const WIDTHS_KEY = 'ml_col_widths';

function loadWidths(): Partial<Record<ColKey, number>> {
  try {
    const raw = JSON.parse(readString(WIDTHS_KEY) ?? '{}') as Record<string, unknown>;
    const out: Partial<Record<ColKey, number>> = {};
    for (const [k, v] of Object.entries(raw)) if (isColKey(k) && typeof v === 'number' && v > 0) out[k] = clampWidth(v, 30);
    return out;
  } catch { return {}; }
}

// ── The POS / CEFR checklist ─────────────────────────────────────────────────

interface ChoiceFilter {
  wrap: HTMLElement;
  /** Re-read the selection (it can change under the control: "Reset", or another view sharing the set). */
  sync(): void;
  /** Show how many of each value the list holds, beside the value. */
  setCounts(counts: Record<string, number>): void;
}

/**
 * An Excel-style value filter. Every value starts on; unticking one turns it off. `selected` is the set of
 * values left on, with the shared convention that an empty set means "all on" — so the list's other filters and
 * the Add Vocabulary search, which read the same set, need no change. The last value on cannot be unticked
 * (that would read as "all"); use Select all, or tick another first.
 */
/** One value in a checklist. `tag` dresses its label as the same coloured pill that value wears in the rows. */
interface ChoiceOption {
  value: string;
  label: string;
  tag?: { className: string; data: Record<string, string> };
}

function buildChoiceFilter(
  label: string,
  options: readonly ChoiceOption[],
  selected: Set<string>,
  onChange: () => void,
): ChoiceFilter {
  const wrap = document.createElement('div');
  wrap.className = 'ml-chip-dropdown ml-colhead-choice';

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'ml-chip-dropdown-toggle';
  toggle.setAttribute('aria-label', `Filter ${label}`);
  wrap.appendChild(toggle);

  const panel = document.createElement('div');
  panel.className = 'ml-chip-dropdown-panel ml-chip-dropdown-panel--checklist';
  panel.hidden = true;
  panel.addEventListener('click', e => e.stopPropagation());
  wrap.appendChild(panel);

  const allBtn = document.createElement('button');
  allBtn.type = 'button';
  allBtn.className = 'pos-chip pos-chip-all';
  allBtn.textContent = 'Select all';
  allBtn.addEventListener('click', () => { selected.clear(); onChange(); sync(); });
  panel.appendChild(allBtn);

  const boxes = new Map<string, HTMLInputElement>();
  const hints = new Map<string, HTMLElement>();
  options.forEach(o => {
    const row = document.createElement('label');
    row.className = 'ml-chip-dropdown-item';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.addEventListener('change', () => {
      if (selected.size === 0) {
        // From "all on" to "all but this one".
        options.forEach(x => { if (x.value !== o.value) selected.add(x.value); });
      } else if (cb.checked) {
        selected.add(o.value);
        if (selected.size === options.length) selected.clear();     // everything is on again
      } else if (selected.size === 1 && selected.has(o.value)) {
        cb.checked = true;                                          // would leave nothing on
        return;
      } else {
        selected.delete(o.value);
      }
      onChange();
      sync();
    });
    const text = document.createElement('span');
    text.className = 'ml-chip-dropdown-item-text';
    text.textContent = o.label;
    if (o.tag) {
      text.classList.add(o.tag.className, 'ml-colhead-opt');
      for (const [k, v] of Object.entries(o.tag.data)) text.dataset[k] = v;
    }
    const hint = document.createElement('span');
    hint.className = 'ml-chip-dropdown-item-hint';
    row.append(cb, text, hint);
    panel.appendChild(row);
    boxes.set(o.value, cb);
    hints.set(o.value, hint);
  });

  function sync(): void {
    boxes.forEach((cb, v) => { cb.checked = selected.size === 0 || selected.has(v); });
    allBtn.classList.toggle('active', selected.size === 0);
    toggle.textContent = selected.size === 0 ? 'All' : `${selected.size} of ${options.length}`;
    toggle.classList.toggle('ml-colhead-choice--narrowed', selected.size > 0);
  }
  sync();

  toggle.addEventListener('click', e => {
    e.stopPropagation();
    // One of these open at a time, like every other popover family in My Lists.
    document.querySelectorAll<HTMLElement>('.ml-chip-dropdown-panel').forEach(p => { if (p !== panel) p.hidden = true; });
    panel.hidden = !panel.hidden;
  });

  return {
    wrap,
    sync,
    setCounts(counts) { hints.forEach((el, v) => { el.textContent = String(counts[v] ?? 0); }); },
  };
}

// ── The header ───────────────────────────────────────────────────────────────

export interface ColumnHeaderOptions {
  /** Something changed (a sort, a filter): the panel should redraw, from page 1. */
  onChange(): void;
  /** Rows have a leading checkbox column (bulk select) — the header leaves room for it. */
  hasCheckbox: boolean;
  /** Remember the sort across visits under this key (Browse All Words does; a list's header starts fresh). */
  storageKey?: string;
  /** Sort at first. Default: none, so the panel's own order shows. */
  initialSort?: SortState;
  /** The POS / CEFR values left on, when another part of the screen shares them (Add Vocabulary's results
   *  narrow by the same selection). Default: the header's own. Empty = all on. */
  posSet?: Set<string>;
  bandSet?: Set<string>;
  /** The mastery levels left on ('0'…'4'); the header's own by default. */
  masteredSet?: Set<string>;
}

export interface ColumnHeader extends ColumnView {
  /** The header itself — put it directly above the list. */
  el: HTMLElement;
  /** "Sort & filter": opens and closes the stacked header in the compact layout. It lives inside the table, on top
   *  of it, and only shows there — a wide table always shows its filters. */
  toggleBtn: HTMLButtonElement;
  /**
   * Give the header the list it sits over: styles it to match and keeps their columns aligned.
   * `actionsWidth` is the width of the rows' action-button column — fixed, not auto, because the header has
   * no buttons to size an auto column and the two would otherwise disagree about where Definition ends.
   */
  attach(listEl: HTMLElement, actionsWidth?: string): void;
  /** Call after (re)drawing rows: the list's scrollbar may have appeared or gone. */
  sync(): void;
  /** Set the sort without redrawing. */
  setSort(sort: SortState): void;
  /** Put a text into a column's filter box without redrawing (e.g. "jump to this word"). */
  setFilter(key: ColKey, value: string): void;
  /** Clear the sort and every filter without redrawing — e.g. "Go to rank". */
  reset(sort?: SortState): void;
  /** Show how many words of each POS / CEFR level / mastery level the list holds, in those checklists. */
  setCounts(kind: ChoiceKey, counts: Record<string, number>): void;
  /** Changes whenever the view does: for a panel's "back to page 1" check. */
  signature(): string;
  /** Is any filter narrowing the list? */
  hasFilters(): boolean;
}

export function createColumnHeader(opts: ColumnHeaderOptions): ColumnHeader {
  const fallback: SortState = opts.initialSort ?? { key: null, dir: 'asc' };
  let sort: SortState = opts.storageKey ? parseSort(readString(opts.storageKey), fallback) : fallback;
  const filters = new Map<ColKey, string>();
  const posSet = opts.posSet ?? new Set<string>();
  const bandSet = opts.bandSet ?? new Set<string>();
  const masteredSet = opts.masteredSet ?? new Set<string>();
  const widths = loadWidths();
  /** Fitted to the rows on screen, for every column the learner hasn't sized (never saved; see autoSizeUnset). */
  const autoWidths: Partial<Record<ColKey, number>> = {};
  let listEl: HTMLElement | null = null;
  let tableEl: HTMLElement | null = null;
  let compact = false;
  let open = true;

  const el = document.createElement('div');
  el.className = 'ml-colhead' + (opts.hasCheckbox ? '' : ' ml-colhead--nocheck');

  const sortBtns = new Map<ColKey, HTMLButtonElement>();
  const filterInputs = new Map<ColKey, HTMLInputElement>();
  const choiceFilters = new Map<ChoiceKey, ChoiceFilter>();

  const persist = (): void => { if (opts.storageKey) writeString(opts.storageKey, serializeSort(sort)); };

  /** The arrow on the sorted column, and what a screen reader hears each button do. */
  function paintSort(): void {
    COLUMNS.forEach(col => {
      const btn = sortBtns.get(col.key);
      if (!btn) return;
      const arrow = btn.querySelector<HTMLElement>('.ml-colhead-arrow');
      if (arrow) arrow.textContent = sortArrow(sort, col.key).trim();
      btn.classList.toggle('ml-colhead-sort--active', sort.key === col.key);
      const state = sort.key !== col.key ? 'not sorted' : sort.dir === 'asc' ? 'sorted ascending' : 'sorted descending';
      btn.setAttribute('aria-label', `Sort by ${col.label} (${state})`);
    });
  }

  /** Column widths — the learner's own, else fitted — as CSS variables the row/header templates read (my-lists.css). */
  function applyWidths(): void {
    for (const col of COLUMNS) {
      const w = widths[col.key] ?? autoWidths[col.key];
      for (const target of [el, listEl]) {
        if (!target) continue;
        if (w) target.style.setProperty(`--ml-w-${col.track}`, `${w}px`);
        else target.style.removeProperty(`--ml-w-${col.track}`);
      }
    }
  }

  function setWidth(key: ColKey, px: number): void {
    widths[key] = px;
    applyWidths();
  }
  function saveWidths(): void { writeString(WIDTHS_KEY, JSON.stringify(widths)); }

  /** The width that fits the widest thing in a column: its header label and the rows on screen. */
  function fitWidth(col: ColumnDef): number | null {
    if (!listEl) return null;
    const cells = [...listEl.querySelectorAll<HTMLElement>(`.ml-cell-${col.track}`)];
    const sample = cells[0] ?? el;
    const font = getComputedStyle(sample).font;
    const texts = cells.map(c => c.textContent?.trim() ?? '');
    // The header label is small and upper-case: measure it as it is drawn, not in the rows' font.
    const labelBtn = sortBtns.get(col.key);
    const labelFont = labelBtn ? getComputedStyle(labelBtn).font : font;
    // Room around the text: the cell's own padding, plus a pill's when the column holds pills (POS, CEFR, Percent,
    // Mastered); the label also needs the sort arrow.
    const pills = col.key === 'pos' || col.key === 'band' || col.key === 'percent' || col.key === 'mastered';
    return autoFitWidth({
      font, labelFont, label: col.label.toUpperCase(), cells: texts,
      labelExtra: 8, cellExtra: pills ? 30 : 18, min: 40, max: 480,
    });
  }

  /** Double-click on a column's edge: fit it, and remember that as the learner's own width. */
  function autoFit(col: ColumnDef): void {
    const w = fitWidth(col);
    if (w === null) return;
    setWidth(col.key, w);
    saveWidths();
    header.sync();
  }

  /**
   * By default every column is fitted to what it holds, as if its edge had been double-clicked — except
   * Definition, the one flexible column, which takes whatever width is left. A width the learner set
   * (dragged or double-clicked) wins and is the only kind saved. Fitted widths only grow while the view is
   * open, so paging through a list doesn't make the columns jump about. Skipped in the compact layout,
   * which has no column tracks.
   */
  function autoSizeUnset(): void {
    if (!listEl || compact || !listEl.querySelector('.ml-word-item')) return;
    let changed = false;
    for (const col of COLUMNS) {
      if (col.key === 'definition' || widths[col.key] !== undefined) continue;
      const w = fitWidth(col);
      if (w !== null && w > (autoWidths[col.key] ?? 0)) { autoWidths[col.key] = w; changed = true; }
    }
    if (changed) applyWidths();
  }

  const header: ColumnHeader = {
    el,
    get sort() { return sort; },
    get filters() { return filters; },
    get sets() { return { pos: posSet, band: bandSet, mastered: masteredSet }; },
    toggleBtn: document.createElement('button'),
    attach(list, actionsWidth = '68px') {
      listEl = list;
      list.classList.add('ml-word-list--cols');
      list.classList.toggle('ml-word-list--nocheck', !opts.hasCheckbox);
      list.style.setProperty('--ml-actions-w', actionsWidth);
      el.style.setProperty('--ml-actions-w', actionsWidth);
      applyWidths();
      // The header and the list are one object: a box with the header on top and the rows below.
      const table = document.createElement('div');
      table.className = 'ml-table';
      tableEl = table;
      list.before(table);
      table.append(toggleBtn, el, list);
      // Follow the list's own width. A tiny width means "not laid out" (a hidden tab or window), not "narrow" —
      // no real list is under 100px — so it is ignored rather than flipping the layout.
      const measure = (): void => { const w = list.offsetWidth; if (w >= 100) setCompact(w < COMPACT_BELOW_PX); };
      if (typeof ResizeObserver !== 'undefined') new ResizeObserver(measure).observe(list);
      measure();
    },
    sync() {
      if (!listEl) return;
      autoSizeUnset();
      // The list reserves room for its scrollbar and the header has none, so tell it how much (what is left
      // of the list's width once its own borders are taken out) and its columns end where the rows' do.
      const sbw = Math.max(0, listEl.offsetWidth - listEl.clientWidth - listEl.clientLeft * 2);
      el.style.setProperty('--ml-sbw', `${sbw}px`);
    },
    setSort(s) { sort = s; persist(); paintSort(); },
    setFilter(key, value) {
      const inp = filterInputs.get(key);
      if (inp) inp.value = value;
      if (value.trim()) filters.set(key, value.trim()); else filters.delete(key);
    },
    reset(s) {
      sort = s ?? { key: null, dir: 'asc' };
      persist();
      filters.clear();
      filterInputs.forEach(inp => { inp.value = ''; });
      posSet.clear();
      bandSet.clear();
      masteredSet.clear();
      choiceFilters.forEach(f => f.sync());
      paintSort();
    },
    setCounts(kind, counts) { choiceFilters.get(kind)?.setCounts(counts); },
    signature() {
      return [
        sort.key ?? '', sort.dir,
        [...filters].map(([k, v]) => `${k}=${v}`).join('&'),
        [...posSet].sort().join(','), [...bandSet].sort().join(','), [...masteredSet].sort().join(','),
      ].join('|');
    },
    hasFilters() { return hasColumnFilters(header); },
  };

  COLUMNS.forEach(col => {
    const cell = document.createElement('div');
    cell.className = `ml-colhead-col ml-colhead-col--${col.key}`;
    cell.style.gridColumn = col.track;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ml-colhead-sort';
    btn.title = col.title;
    const text = document.createElement('span');
    text.textContent = col.label;
    const arrow = document.createElement('span');
    arrow.className = 'ml-colhead-arrow';
    arrow.setAttribute('aria-hidden', 'true');
    btn.append(text, arrow);
    btn.addEventListener('click', () => {
      sort = nextSort(sort, col.key);        // ascending -> descending -> off
      persist();
      paintSort();
      opts.onChange();
    });
    sortBtns.set(col.key, btn);
    cell.appendChild(btn);

    if (col.kind === 'choice') {
      const key = col.key as ChoiceKey;
      const f = buildChoiceFilter(
        col.label,
        // Each value wears the colour it has in the rows: part-of-speech and CEFR pills, and the mastery level's hue.
        key === 'pos' ? POS_CHIPS.filter(c => c.value).map(c => ({ ...c, tag: { className: 'ml-word-pos', data: { pos: c.value } } }))
          : key === 'band' ? BANDS.map(b => ({ value: b, label: b, tag: { className: 'ml-word-band', data: { band: b } } }))
          : MASTERY_LEVELS.map((label, i) => ({
            value: String(i), label: `${MASTERY_GLYPHS[i]} ${label}`,
            tag: { className: 'ml-level-pill', data: { level: String(i) } },
          })),
        key === 'pos' ? posSet : key === 'band' ? bandSet : masteredSet,
        opts.onChange,
      );
      choiceFilters.set(key, f);
      cell.appendChild(f.wrap);
    } else {
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.className = 'ml-colhead-filter';
      inp.placeholder = col.hint;
      inp.title = col.title;
      inp.setAttribute('aria-label', `Filter ${col.label}`);
      inp.addEventListener('input', () => {
        if (inp.value.trim()) filters.set(col.key, inp.value.trim());
        else filters.delete(col.key);
        opts.onChange();
      });
      filterInputs.set(col.key, inp);
      cell.appendChild(inp);
    }

    // The audio button's column sits between Word and POS and has no header of its own, but its divider does run
    // through the header, so it gets an empty cell — and Word's resize handle, because that divider is Word's right
    // edge to the eye. (Resizing still sets the Word track's width.)
    const audioCell = col.key === 'word' ? document.createElement('div') : null;
    if (audioCell) {
      audioCell.className = 'ml-colhead-col ml-colhead-col--audio';
      audioCell.style.gridColumn = 'audio';
    }

    // Right edge: drag to resize, double-click to fit (the Admin grid's own gestures, utils/column-resize.ts).
    const handle = document.createElement('span');
    handle.className = 'ml-colhead-resize';
    handle.title = 'Drag to resize — double-click to fit';
    attachDragResize(handle, {
      getWidth: () => cell.getBoundingClientRect().width,
      setWidth: px => setWidth(col.key, px),
      onDone: () => { saveWidths(); header.sync(); },
      min: 40,
    });
    handle.addEventListener('dblclick', e => { e.preventDefault(); e.stopPropagation(); autoFit(col); });
    (audioCell ?? cell).appendChild(handle);

    el.appendChild(cell);
    if (audioCell) el.appendChild(audioCell);
  });
  paintSort();
  choiceFilters.forEach(f => f.sync());

  // Filter boxes are open by default when there is room; in the compact layout, where the columns cannot line
  // up with the rows, the header becomes a stacked list that starts closed.
  const toggleBtn = header.toggleBtn;
  toggleBtn.type = 'button';
  toggleBtn.className = 'ml-colhead-toggle';
  toggleBtn.textContent = 'Sort & filter ▾';
  toggleBtn.title = 'Sort and filter by column';

  function paintOpen(): void {
    el.hidden = compact && !open;
    el.classList.toggle('ml-colhead--filters-off', !compact && !open);
    toggleBtn.setAttribute('aria-expanded', String(open));
    toggleBtn.textContent = open ? 'Sort & filter ▴' : 'Sort & filter ▾';
  }
  function setCompact(c: boolean): void {
    if (c === compact) return;
    compact = c;
    el.classList.toggle('ml-cols--compact', compact);
    listEl?.classList.toggle('ml-cols--compact', compact);
    tableEl?.classList.toggle('ml-cols--compact', compact);
    open = !compact;
    paintOpen();
    header.sync();
  }
  toggleBtn.addEventListener('click', () => { open = !open; paintOpen(); header.sync(); });
  paintOpen();

  return header;
}
