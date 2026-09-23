/**
 * admin-table.ts
 *
 * Table View tab — a spreadsheet-style grid over the same vocabulary the
 * Word Editor tab edits one word at a time, for bulk edits across many rows
 * at once. Columns mirror export.ts's own CSV column list exactly, so a
 * learner who's used "Export CSV" already knows what each column means.
 *
 * `word` and `frequency.band` are read-only (word is the identity key;
 * band is derived from rank, never stored itself — see vocab-loader.ts's
 * bandFromRank). `tags` is also read-only here: the admin API has no route
 * that writes word_tags, so editing it in this grid would silently do
 * nothing on Save — better to not offer it than to offer a lie.
 *
 * Dirty tracking is per word, not per cell — editing any cell marks that
 * whole row dirty, and Save All sends every field for every dirty row in
 * one batch call (POST /vocab, the same transactional endpoint the
 * multi-word `updates` array was already built for), not just the one
 * field that happened to change.
 *
 * Columns are data-driven (COLUMNS below) rather than one hand-written
 * `<td>` per field, since sort/filter/resize all need to walk the same
 * column list generically — a hand-written renderRows() would otherwise
 * need matching hand-written sort/filter logic kept in step with it.
 *
 * Sort and per-column filter both act only on the current page's already-
 * loaded rows, not the whole language — this is a page-at-a-time grid, not
 * a live query builder, and the global search box + pagination already
 * cover narrowing the *set* of words loaded.
 */

import { escapeHtml, showStatus } from './admin-api.js';
import { getAdminDataClient } from './admin-data-client.js';
import type { BatchUpdateItem } from '../../shared/vocab/write.js';
import { logger } from '../utils/logger.js';
import { readString, writeString } from '../utils/storage.ts';
import { langFlagImg } from './admin-languages.js';

interface Frequency {
  band?: string | null;
  rank?: number | null;
}

interface Linguistic {
  ipa?:        string | null;
  gender?:     string | null;
  plural?:     string | null;
  infinitive?: string | null;
  register?:   string | null;
  reflexive?:  boolean;
}

interface TableWord {
  word:          string;
  translation?:  string;
  pos?:          string | null;
  difficulty?:   string | null;
  domains?:      string[];
  tags?:         string[];
  notes?:        string;
  glosses?:      string[];
  examples?:     string[];
  frequency?:    Frequency;
  linguistic?:   Linguistic;
}

// ── Columns ──────────────────────────────────────────────────────────────────

interface ColumnDef {
  key:       string;
  label:     string;
  width:     number;
  readonly?: boolean;
  title?:    string;
  get:       (w: TableWord) => string;
  set?:      (w: TableWord, v: string) => void;
  /** Numeric columns sort numerically (blank sorts last either direction),
   *  everything else sorts as case-insensitive text. */
  numeric?: boolean;
}

const COLUMNS: ColumnDef[] = [
  { key: 'rank', label: 'Rank', width: 70, numeric: true,
    get: w => w.frequency?.rank != null ? String(w.frequency.rank) : '',
    set: (w, v) => { w.frequency = { ...w.frequency, rank: v.trim() ? Number(v) : null }; } },
  { key: 'word', label: 'Word', width: 110, readonly: true, get: w => w.word },
  { key: 'translation', label: 'Translation', width: 140,
    get: w => w.translation ?? '', set: (w, v) => { w.translation = v; } },
  // No `set` here — POS is rendered as a locked-to-preset <select>
  // (posCellSelect() below), which writes w.pos itself rather than going
  // through a generic col.set the way every free-text column does.
  { key: 'pos', label: 'POS', width: 90, get: w => w.pos ?? '' },
  { key: 'difficulty', label: 'Difficulty', width: 90,
    title: '1 (most common) – 5 (rarest), derived from frequency rank',
    get: w => w.difficulty ?? '', set: (w, v) => { w.difficulty = v.trim() || null; } },
  { key: 'domains', label: 'Domains', width: 130,
    get: w => (w.domains ?? []).join(', '),
    set: (w, v) => { w.domains = v.split(',').map(s => s.trim()).filter(Boolean); } },
  { key: 'tags', label: 'Tags', width: 130, readonly: true,
    title: 'Not editable here — no admin API route writes tags yet',
    get: w => (w.tags ?? []).join(', ') },
  { key: 'notes', label: 'Notes', width: 160,
    get: w => w.notes ?? '', set: (w, v) => { w.notes = v; } },
  { key: 'glosses', label: 'Glosses', width: 160,
    get: w => (w.glosses ?? []).join('; '),
    set: (w, v) => { w.glosses = v.split(';').map(s => s.trim()).filter(Boolean); } },
  { key: 'examples', label: 'Examples', width: 160,
    get: w => (w.examples ?? []).join('; '),
    set: (w, v) => { w.examples = v.split(';').map(s => s.trim()).filter(Boolean); } },
  { key: 'ipa', label: 'IPA', width: 100,
    get: w => w.linguistic?.ipa ?? '', set: (w, v) => { w.linguistic = { ...w.linguistic, ipa: v.trim() || null }; } },
  { key: 'band', label: 'Band', width: 70, readonly: true, get: w => w.frequency?.band ?? '' },
  // No `set` here — same reasoning as POS above: locked to a preset
  // <select> (genderCellSelect() below), which writes w.linguistic.gender
  // itself.
  { key: 'gender', label: 'Gender', width: 90, get: w => w.linguistic?.gender ?? '' },
  { key: 'plural', label: 'Plural', width: 100,
    get: w => w.linguistic?.plural ?? '', set: (w, v) => { w.linguistic = { ...w.linguistic, plural: v.trim() || null }; } },
  { key: 'infinitive', label: 'Infinitive', width: 100,
    get: w => w.linguistic?.infinitive ?? '', set: (w, v) => { w.linguistic = { ...w.linguistic, infinitive: v.trim() || null }; } },
  { key: 'reflexive', label: 'Reflexive', width: 90,
    get: w => w.linguistic?.reflexive ? 'true' : '',
    set: (w, v) => { w.linguistic = { ...w.linguistic, reflexive: v.trim().toLowerCase() === 'true' }; } },
  { key: 'register', label: 'Register', width: 100,
    get: w => w.linguistic?.register ?? '', set: (w, v) => { w.linguistic = { ...w.linguistic, register: v.trim() || null }; } },
];

// ── Column visibility — persisted across sessions. Both this tab's own
// "Columns" dropdown and the Settings tab's matching checklist (built by
// renderColumnSettings() below, called from admin.ts) read and write this
// same hiddenColumns set — one preference, not two copies of it drifting
// apart, so "the default set of hidden/shown columns" picked in Settings is
// exactly what a fresh page load (or a Reset in the dropdown) shows. ─

const VISIBLE_COLUMNS_KEY = 'admin_table_hidden_columns';

function loadHiddenColumns(): Set<string> {
  try {
    const raw = readString(VISIBLE_COLUMNS_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch { return new Set(); }
}
function saveHiddenColumns(hidden: Set<string>): void {
  writeString(VISIBLE_COLUMNS_KEY, JSON.stringify([...hidden]));
}
const hiddenColumns = loadHiddenColumns();

// ── Column order — persisted across sessions, drag-to-reorder in the header
// row itself (buildHeaderRow()) or up/down in the Settings tab's checklist
// (renderColumnSettingsChecklist()), same "one preference, two entry points"
// shape as hiddenColumns above. ─────────────────────────────────────────────

const COLUMN_ORDER_KEY = 'admin_table_column_order';

function loadColumnOrder(): string[] {
  const known = COLUMNS.map(c => c.key);
  try {
    const raw = readString(COLUMN_ORDER_KEY);
    const saved = raw ? (JSON.parse(raw) as string[]).filter(k => known.includes(k)) : [];
    // A column added (or renamed) since this was last saved has no saved
    // position — appended at the end in COLUMNS' own order rather than
    // silently dropped.
    const missing = known.filter(k => !saved.includes(k));
    return [...saved, ...missing];
  } catch { return known; }
}
function saveColumnOrder(order: string[]): void {
  writeString(COLUMN_ORDER_KEY, JSON.stringify(order));
}
let columnOrder = loadColumnOrder();

function orderedColumns(): ColumnDef[] {
  const byKey = new Map(COLUMNS.map(c => [c.key, c]));
  return columnOrder.map(k => byKey.get(k)).filter((c): c is ColumnDef => Boolean(c));
}

function visibleColumns(): ColumnDef[] {
  return orderedColumns().filter(c => !hiddenColumns.has(c.key));
}

/** Moves `key` to sit immediately before `targetKey` in columnOrder —
 *  shared by header-row drag-and-drop and the Settings checklist's up/down
 *  buttons, so both end up with exactly the same reordering semantics.
 *  Removing `key` first and re-finding `targetKey` afterward (rather than
 *  computing an insertion index up front) sidesteps having to reason about
 *  which way the removal shifted `targetKey`'s own index. */
function reorderColumn(key: string, targetKey: string): void {
  if (key === targetKey) return;
  const from = columnOrder.indexOf(key);
  if (from === -1) return;
  columnOrder.splice(from, 1);
  const to = columnOrder.indexOf(targetKey);
  columnOrder.splice(to === -1 ? from : to, 0, key);
  saveColumnOrder(columnOrder);
}

// ── Column widths — persisted across sessions ───────────────────────────────

const WIDTHS_KEY = 'admin_table_col_widths';

function loadWidths(): Record<string, number> {
  try {
    const raw = readString(WIDTHS_KEY);
    return raw ? JSON.parse(raw) as Record<string, number> : {};
  } catch { return {}; }
}
function saveWidths(widths: Record<string, number>): void {
  writeString(WIDTHS_KEY, JSON.stringify(widths));
}
const savedWidths = loadWidths();
COLUMNS.forEach(c => { if (savedWidths[c.key]) c.width = savedWidths[c.key]; });

// ── Page size — "Max" and "Custom…" alongside the fixed presets, same
// pattern as the main app's own word-count select (#sizeSelect/#sizeCustom
// in index.html). Unlike that one, "Max" here is capped at 200: that's
// getWordPage()'s own server-side ceiling (shared/vocab/queries.ts), shared
// with the public /api/vocab route's abuse guard against `?limit=999999` —
// asking this admin panel for more would just get silently clamped back
// down there, one layer removed from where the page/pages math is done, so
// the UI would show a request for "2000" but a total that only matches 200.
const MAX_TABLE_PAGE_SIZE = 200;
const PAGE_SIZE_KEY        = 'admin_table_page_size';
const PAGE_SIZE_CUSTOM_KEY = 'admin_table_page_size_custom';

function getPageSize(): number {
  if (pageSizeSelect.value === 'max')    return MAX_TABLE_PAGE_SIZE;
  if (pageSizeSelect.value === 'custom') {
    const n = parseInt(pageSizeCustomEl.value, 10);
    return Number.isFinite(n) ? Math.min(Math.max(n, 1), MAX_TABLE_PAGE_SIZE) : 50;
  }
  return Number(pageSizeSelect.value) || 50;
}

// ── DOM refs ─────────────────────────────────────────────────────────────────

const langSelect       = document.getElementById('tableLangSelect')       as HTMLSelectElement;
const langSelectFlag   = document.getElementById('tableLangSelectFlag')   as HTMLElement;
const searchInput      = document.getElementById('tableSearchInput')      as HTMLInputElement;
const searchBtn        = document.getElementById('tableSearchBtn')        as HTMLButtonElement;
const suggestionsEl    = document.getElementById('tableSearchSuggestions') as HTMLElement;
const pageSizeSelect   = document.getElementById('tablePageSize')         as HTMLSelectElement;
const pageSizeCustomEl = document.getElementById('tablePageSizeCustom')   as HTMLInputElement;
const saveAllBtn       = document.getElementById('tableSaveAllBtn')       as HTMLButtonElement;
const dirtyCountEl   = document.getElementById('tableDirtyCount')  as HTMLElement;
const prevBtn        = document.getElementById('tablePrevBtn')     as HTMLButtonElement;
const nextBtn        = document.getElementById('tableNextBtn')     as HTMLButtonElement;
const pageLabel      = document.getElementById('tablePageLabel')   as HTMLElement;
const pageInput      = document.getElementById('tablePageInput')   as HTMLInputElement;
const pageJumpBtn    = document.getElementById('tablePageJumpBtn') as HTMLButtonElement;
const theadRow       = document.getElementById('tableViewHeadRow') as HTMLElement;
const filterRow      = document.getElementById('tableViewFilterRow') as HTMLElement;
const colgroupEl     = document.getElementById('tableViewColgroup') as HTMLTableColElement | null;
const tbody          = document.getElementById('tableViewBody')    as HTMLElement;

// ── State ────────────────────────────────────────────────────────────────────

let page = 1;
let pages = 1;
/** word -> its current row data (edited in place as inputs change). */
let rows = new Map<string, TableWord>();
/** words with at least one unsaved edit. */
const dirty = new Set<string>();
let metaLoaded = false;

let sortKey: string | null = null;
let sortDir: 'asc' | 'desc' = 'asc';
/** column key -> substring filter, case-insensitive. */
const columnFilters = new Map<string, string>();

// Same 8-value fallback Word Editor's own #editPos ships with before /meta
// answers (admin-editor.ts's DEFAULT_POS_OPTIONS) — replaced wholesale with
// the DB's actual set once loadMeta() resolves, same as that select is.
let posOptions: string[] = ['adjective', 'adverb', 'article', 'conjunction', 'noun', 'preposition', 'pronoun', 'verb'];

function debounce<Args extends unknown[]>(fn: (...args: Args) => void, ms: number): (...args: Args) => void {
  let t: ReturnType<typeof setTimeout>;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/** Keeps the flag next to #tableLangSelect in sync — <option> can't hold
 *  an <img> itself, so this is the closest a native select gets to one. */
function refreshLangFlag(): void {
  langSelectFlag.innerHTML = '';
  if (langSelect.value) langSelectFlag.appendChild(langFlagImg(langSelect.value));
}

function markDirty(word: string): void {
  dirty.add(word);
  saveAllBtn.disabled = dirty.size === 0;
  dirtyCountEl.textContent = String(dirty.size);
}

function clearDirty(): void {
  dirty.clear();
  saveAllBtn.disabled = true;
  dirtyCountEl.textContent = '0';
}

/** Whether any row on the current page has an unsaved edit — admin.ts reads
 *  this before letting the Word Editor / Table View toggle switch away. */
export function isTableDirty(): boolean {
  return dirty.size > 0;
}

/** admin.ts's discard half of "save or discard before switching" — drops
 *  every in-memory edit and reloads the current page fresh from the server,
 *  same as loadPage()'s own already-confirmed discard path. */
export async function discardTableChanges(): Promise<void> {
  clearDirty();
  await loadPage();
}

// ── Loading ──────────────────────────────────────────────────────────────────

async function loadMeta(): Promise<void> {
  if (metaLoaded) return;
  try {
    const { languages, pos } = await getAdminDataClient().getMeta();
    if (languages?.length) {
      const cur = langSelect.value;
      langSelect.innerHTML = languages
        .map(l => `<option value="${escapeHtml(l)}">${escapeHtml(l.charAt(0).toUpperCase() + l.slice(1))}</option>`)
        .join('');
      langSelect.value = languages.includes(cur) ? cur : languages[0];
      refreshLangFlag();
    }
    if (pos.length) posOptions = pos;
    metaLoaded = true;
  } catch (err) {
    logger.error('Table view /meta failed:', err);
  }
}

async function loadPage(): Promise<void> {
  if (dirty.size > 0 && !window.confirm('You have unsaved changes on this page. Load a new page and discard them?')) {
    return;
  }
  tbody.innerHTML = `<tr><td colspan="${visibleColumns().length}" class="table-view-empty">Loading…</td></tr>`;
  clearDirty();
  try {
    const data = await getAdminDataClient().getVocabPage({
      lang:   langSelect.value,
      limit:  getPageSize(),
      page,
      search: searchInput.value.trim() || undefined,
    });
    page  = data.page;
    pages = Math.max(1, data.pages);
    rows  = new Map(data.words.map(w => [w.word, structuredClone(w)]));
    pageLabel.textContent = `Page ${page} of ${pages}`;
    prevBtn.disabled = page <= 1;
    nextBtn.disabled = page >= pages;
    pageInput.max   = String(pages);
    pageInput.value = String(page);
    renderRows();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="${visibleColumns().length}" class="table-view-empty">Failed to load.</td></tr>`;
    showStatus('Table view error: ' + (err instanceof Error ? err.message : String(err)), 'error');
  }
}

// ── Header: labels, sort, resize, filter ─────────────────────────────────────

function buildColgroup(): void {
  if (!colgroupEl) return;
  colgroupEl.innerHTML = '';
  visibleColumns().forEach(col => {
    const c = document.createElement('col');
    c.style.width = `${col.width}px`;
    c.dataset.col = col.key;
    colgroupEl.appendChild(c);
  });
}

function colEl(key: string): HTMLTableColElement | undefined {
  return colgroupEl?.querySelector<HTMLTableColElement>(`col[data-col="${key}"]`) ?? undefined;
}

/** Refreshes every header's arrow/aria-sort from the current sortKey/sortDir
 *  — called after each click instead of rebuilding the whole header, which
 *  would also tear down and reattach the resize-handle listeners for no
 *  reason. Before this existed, the arrow span's text was only ever set
 *  once at buildHeaderRow() time (when nothing was sorted yet), so a column
 *  header never actually showed which way it was sorted no matter how many
 *  times you clicked it. */
function updateSortIndicators(): void {
  theadRow.querySelectorAll<HTMLElement>('th').forEach(th => {
    const key    = th.dataset.col;
    const active = sortKey === key;
    const arrow  = th.querySelector<HTMLElement>('.table-view-sort-arrow');
    if (arrow) arrow.textContent = active ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';
    th.classList.toggle('table-view-th--sorted', active);
    th.setAttribute('aria-sort', active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none');
  });
}

// ── Column auto-size (double-click the resize handle) ───────────────────────

/** Canvas 2D context reused across calls purely to avoid re-creating one on
 *  every double-click — text measurement itself is stateless. */
let measureCtx: CanvasRenderingContext2D | null = null;

function getMeasureCtx(): CanvasRenderingContext2D {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
  return measureCtx as CanvasRenderingContext2D;
}

/** Widest cell wins, header label included — measured with canvas text
 *  metrics rather than a real DOM element because doing this for every row
 *  on the page, on every double-click, would mean forcing a layout/reflow
 *  per row instead of one cheap measureText() call each. */
function autoSizeColumn(col: ColumnDef): void {
  const ctx = getMeasureCtx();
  const sample = tbody.querySelector<HTMLElement>('.table-view-cell-input, .table-view-cell-readonly');
  const font = sample ? getComputedStyle(sample).font : getComputedStyle(theadRow).font;
  ctx.font = font;

  let maxWidth = ctx.measureText(col.label).width + 24; // + sort arrow / affordance
  rows.forEach(w => {
    const text = col.get(w);
    if (!text) return;
    const width = ctx.measureText(text).width;
    if (width > maxWidth) maxWidth = width;
  });

  const next = Math.max(50, Math.min(480, Math.round(maxWidth) + 28)); // + cell padding
  col.width = next;
  const c = colEl(col.key);
  if (c) c.style.width = `${next}px`;

  const widths = loadWidths();
  widths[col.key] = next;
  saveWidths(widths);
}

function buildHeaderRow(): void {
  theadRow.innerHTML = '';
  visibleColumns().forEach(col => {
    const th = document.createElement('th');
    th.dataset.col = col.key;

    // Drag-to-reorder — the whole header cell is the drag handle (a plain
    // click still reaches the sort button underneath just fine; only an
    // actual click-and-drag gesture starts a native HTML5 drag). Dropping
    // on another column's th moves this one to sit just before it, via the
    // same reorderColumn() the Settings tab's up/down buttons use.
    th.draggable = true;
    th.addEventListener('dragstart', e => {
      e.dataTransfer?.setData('text/plain', col.key);
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
      th.classList.add('table-view-th--dragging');
    });
    th.addEventListener('dragend', () => th.classList.remove('table-view-th--dragging'));
    th.addEventListener('dragover', e => { e.preventDefault(); th.classList.add('table-view-th--drop-target'); });
    th.addEventListener('dragleave', () => th.classList.remove('table-view-th--drop-target'));
    th.addEventListener('drop', e => {
      e.preventDefault();
      th.classList.remove('table-view-th--drop-target');
      const draggedKey = e.dataTransfer?.getData('text/plain');
      if (!draggedKey || draggedKey === col.key) return;
      reorderColumn(draggedKey, col.key);
      buildColgroup();
      buildHeaderRow();
      buildFilterRow();
      updateSortIndicators();
      renderRows();
      renderColumnSettingsChecklist();
    });

    const labelBtn = document.createElement('button');
    labelBtn.type = 'button';
    labelBtn.className = 'table-view-sort-btn';
    labelBtn.textContent = col.label;
    if (col.title) th.title = col.title;
    labelBtn.addEventListener('click', () => {
      // asc -> desc -> unsorted, cycling — the third click returns to
      // whatever order the server sent (rank, then word), same as never
      // having clicked at all.
      if (sortKey !== col.key) { sortKey = col.key; sortDir = 'asc'; }
      else if (sortDir === 'asc') { sortDir = 'desc'; }
      else { sortKey = null; }
      updateSortIndicators();
      renderRows();
    });
    th.appendChild(labelBtn);

    const arrow = document.createElement('span');
    arrow.className = 'table-view-sort-arrow';
    labelBtn.appendChild(arrow);

    // Resize handle — drag the right edge to change this column's <col>
    // width. Column widths live on <col> elements (table-layout: fixed),
    // not on each <th>/<td>, so every row's cell in this column resizes
    // together without touching a single one of them.
    const handle = document.createElement('span');
    handle.className = 'table-view-col-resize';
    // Not the drag-to-reorder handle — resizing is its own mousedown-driven
    // drag (below), which a native HTML5 drag starting from the same
    // pointer-down would otherwise fight with.
    handle.draggable = false;
    handle.addEventListener('mousedown', e => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startWidth = col.width;
      function onMove(ev: MouseEvent): void {
        const next = Math.max(50, startWidth + (ev.clientX - startX));
        col.width = next;
        const c = colEl(col.key);
        if (c) c.style.width = `${next}px`;
      }
      function onUp(): void {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        const widths = loadWidths();
        widths[col.key] = col.width;
        saveWidths(widths);
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
    handle.addEventListener('dblclick', e => {
      e.preventDefault();
      e.stopPropagation();
      autoSizeColumn(col);
    });
    th.appendChild(handle);
    theadRow.appendChild(th);
  });
}

function buildFilterRow(): void {
  filterRow.innerHTML = '';
  visibleColumns().forEach(col => {
    const th = document.createElement('th');
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'table-view-filter-input';
    // A narrow numeric column (Rank, Band…) can't fit "Filter…" without
    // clipping it to an illegible "Fil…" — shorten the placeholder instead
    // of widening the column just to hold hint text nobody reads twice.
    input.placeholder = col.width < 90 ? '…' : 'Filter…';
    input.title = `Filter ${col.label}`;
    input.setAttribute('aria-label', `Filter ${col.label}`);
    input.value = columnFilters.get(col.key) ?? '';
    input.addEventListener('input', () => {
      if (input.value.trim()) columnFilters.set(col.key, input.value.trim());
      else columnFilters.delete(col.key);
      renderRows();
    });
    th.appendChild(input);
    filterRow.appendChild(th);
  });
}

// ── Rendering ────────────────────────────────────────────────────────────────

/** One text `<input>` cell bound to a getter/setter on the row's own data. */
function cellInput(word: string, col: ColumnDef, value: string): HTMLTableCellElement {
  const td = document.createElement('td');
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'table-view-cell-input';
  input.value = value;
  input.addEventListener('change', () => {
    const w = rows.get(word);
    if (w && col.set) col.set(w, input.value);
    markDirty(word);
  });
  td.appendChild(input);
  return td;
}

/** POS's own cell — a `<select>` locked to the same preset list Word
 *  Editor's own #editPos offers (posOptions, populated from /api/admin/meta
 *  by loadMeta() below), not free text. A free-text POS cell let a typo or
 *  a stray plural ("verbs") silently create a part-of-speech the rest of
 *  the app — POS filter chips, badge coloring, verb-rules.ts's conjugation
 *  engine keyed on pos === 'verb' — would never recognize. Colored the same
 *  way #editPos is (edit-form.css's [data-pos] rules copied into
 *  table-view.css) so this reads as the same control wherever it appears. */
function posCellSelect(word: string, value: string): HTMLTableCellElement {
  const td = document.createElement('td');
  const select = document.createElement('select');
  select.className = 'table-view-cell-select';
  select.innerHTML = '<option value="">—</option>' +
    posOptions.map(p => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join('');
  select.value = value;
  if (value) select.setAttribute('data-pos', value);
  select.addEventListener('change', () => {
    const w = rows.get(word);
    if (w) w.pos = select.value || null;
    if (select.value) select.setAttribute('data-pos', select.value); else select.removeAttribute('data-pos');
    markDirty(word);
  });
  td.appendChild(select);
  return td;
}

/** Gender's own cell — masculine/feminine/none only, same "locked to a
 *  preset list, not free text" reasoning as posCellSelect() above, and
 *  matching #editGender's own comment (admin.html) for why "neuter" isn't
 *  offered even though a few non-Spanish words in the real data carry it. */
function genderCellSelect(word: string, value: string): HTMLTableCellElement {
  const td = document.createElement('td');
  const select = document.createElement('select');
  select.className = 'table-view-cell-select';
  select.innerHTML = '<option value="">—</option><option value="masculine">masculine</option><option value="feminine">feminine</option>';
  // A handful of non-Spanish words carry a gender outside this preset list
  // (German/Dutch "neuter", Dutch "common", a few Spanish "m/f") — shown via
  // a synthetic option rather than silently falling back to blank, same as
  // Word Editor's own setSelectValue() does for #editGender.
  if (value && value !== 'masculine' && value !== 'feminine') {
    select.innerHTML += `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`;
  }
  select.value = value;
  if (value === 'masculine' || value === 'feminine') select.setAttribute('data-gender', value);
  select.addEventListener('change', () => {
    const w = rows.get(word);
    if (w) w.linguistic = { ...w.linguistic, gender: select.value || null };
    if (select.value) select.setAttribute('data-gender', select.value); else select.removeAttribute('data-gender');
    markDirty(word);
  });
  td.appendChild(select);
  return td;
}

/** A read-only cell's content lives in a child <span>, not on the <td>
 *  itself — matching cellInput()'s own td-wraps-child structure exactly.
 *  It used to carry the class directly on the <td>, which put its padding
 *  in a specificity fight with `.table-view-grid tbody td`'s own padding
 *  (the td's plain tag+class selector outranks a single class) and lost,
 *  so a readonly cell (Word, Tags, Band) ended up shorter than an editable
 *  one — the input's padding is safely inside a plain, unstyled <td> the
 *  same way this span now is, never competing with anything.
 *  `colorAttr` colors Band the same [data-band] way #editBand is (Word
 *  Editor), via an optional {name, value} pair rather than a Band-specific
 *  parameter, so this stays usable for any future color-coded readonly
 *  column too. */
function readonlyCell(value: string, title?: string, colorAttr?: { name: string; value: string }): HTMLTableCellElement {
  const td = document.createElement('td');
  const span = document.createElement('span');
  span.className = 'table-view-cell-readonly';
  span.textContent = value;
  if (colorAttr?.value) span.setAttribute(colorAttr.name, colorAttr.value);
  td.appendChild(span);
  if (title) td.title = title;
  return td;
}

/** The current page's rows, filtered then sorted — a fresh derived view
 *  built on every render rather than mutating `rows` itself, since editing
 *  keeps writing straight into that map. */
function visibleWords(): string[] {
  let words = [...rows.keys()];

  if (columnFilters.size > 0) {
    words = words.filter(word => {
      const w = rows.get(word);
      if (!w) return false;
      for (const [key, needle] of columnFilters) {
        const col = COLUMNS.find(c => c.key === key);
        if (!col) continue;
        if (!col.get(w).toLowerCase().includes(needle.toLowerCase())) return false;
      }
      return true;
    });
  }

  if (sortKey) {
    const col = COLUMNS.find(c => c.key === sortKey);
    if (col) {
      const dir = sortDir === 'asc' ? 1 : -1;
      words.sort((wa, wb) => {
        const a = rows.get(wa); const b = rows.get(wb);
        if (!a || !b) return 0;
        const av = col.get(a); const bv = col.get(b);
        if (col.numeric) {
          const an = av === '' ? null : Number(av);
          const bn = bv === '' ? null : Number(bv);
          if (an == null && bn == null) return 0;
          if (an == null) return 1;   // blanks sort last regardless of direction
          if (bn == null) return -1;
          return (an - bn) * dir;
        }
        return av.localeCompare(bv) * dir;
      });
    }
  }

  return words;
}

function renderRows(): void {
  tbody.innerHTML = '';
  const words = visibleWords();
  if (words.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${visibleColumns().length}" class="table-view-empty">No words match.</td></tr>`;
    return;
  }
  words.forEach(word => {
    const w = rows.get(word);
    if (!w) return;
    const tr = document.createElement('tr');
    tr.dataset.word = word;

    visibleColumns().forEach(col => {
      const value = col.get(w);
      if (col.key === 'pos') { tr.appendChild(posCellSelect(word, value)); return; }
      if (col.key === 'gender') { tr.appendChild(genderCellSelect(word, value)); return; }
      if (col.key === 'band') { tr.appendChild(readonlyCell(value, col.title, { name: 'data-band', value })); return; }
      tr.appendChild(col.readonly ? readonlyCell(value, col.title) : cellInput(word, col, value));
    });

    if (dirty.has(word)) tr.classList.add('table-view-row--dirty');
    tbody.appendChild(tr);
  });
}

// ── Saving ───────────────────────────────────────────────────────────────────

async function saveAll(): Promise<void> {
  const updates: BatchUpdateItem[] = [];
  dirty.forEach(word => {
    const w = rows.get(word);
    if (!w) return;
    updates.push({
      word,
      data: {
        translation: w.translation,
        pos:         w.pos,
        difficulty:  w.difficulty,
        domains:     w.domains,
        notes:       w.notes,
        glosses:     w.glosses,
        examples:    w.examples,
        linguistic: {
          ipa:        w.linguistic?.ipa,
          gender:     w.linguistic?.gender,
          plural:     w.linguistic?.plural,
          infinitive: w.linguistic?.infinitive,
          register:   w.linguistic?.register,
          reflexive:  w.linguistic?.reflexive,
        },
        frequency: { rank: w.frequency?.rank },
      },
    });
  });

  if (updates.length === 0) return;

  saveAllBtn.disabled    = true;
  saveAllBtn.textContent = 'Saving…';
  try {
    const result = await getAdminDataClient().batchUpdate(langSelect.value, updates);
    showStatus(`Saved ${result.updated} word(s)`, 'success');
    clearDirty();
    await loadPage();
  } catch (err) {
    showStatus('Save error: ' + (err instanceof Error ? err.message : String(err)), 'error');
  } finally {
    saveAllBtn.textContent = `💾 Save All Changes (${dirty.size})`;
    saveAllBtn.disabled = dirty.size === 0;
  }
}

// ── Search autosuggest ───────────────────────────────────────────────────────
// A dropdown of live matches under the search box, the same live-narrowing
// idea Word Editor's search already gives you via its word list sitting
// right underneath — Table View's search box doesn't have a list directly
// under it to narrow, so this gives it one of its own instead.

let suggestionWords: TableWord[] = [];
let suggestionIndex = -1;

function hideSuggestions(): void {
  suggestionsEl.hidden = true;
  suggestionsEl.innerHTML = '';
  suggestionWords = [];
  suggestionIndex = -1;
}

function renderSuggestions(): void {
  suggestionsEl.innerHTML = suggestionWords.map((w, i) => `
    <div class="table-search-suggestion${i === suggestionIndex ? ' active' : ''}" data-index="${i}">
      <span class="table-search-suggestion-word">${escapeHtml(w.word)}</span>
      <span class="table-search-suggestion-translation">${escapeHtml(w.translation ?? '')}</span>
    </div>
  `).join('');
  suggestionsEl.hidden = false;
}

function runSearch(): void {
  hideSuggestions();
  page = 1;
  void loadPage();
}

function selectSuggestion(index: number): void {
  const w = suggestionWords[index];
  if (!w) return;
  searchInput.value = w.word;
  runSearch();
}

async function fetchSuggestions(query: string): Promise<void> {
  const trimmed = query.trim();
  if (trimmed.length < 2) { hideSuggestions(); return; }
  try {
    const result = await getAdminDataClient().getVocabPage({ lang: langSelect.value, search: trimmed, limit: 8 });
    // A slow response for a query the box has since moved on from
    // shouldn't clobber whatever the user's typed since — only render if
    // the box still holds what was actually searched for.
    if (searchInput.value.trim() !== trimmed) return;
    suggestionWords = result.words;
    suggestionIndex = -1;
    if (suggestionWords.length) renderSuggestions();
    else hideSuggestions();
  } catch {
    hideSuggestions();
  }
}

const debouncedSuggest = debounce((q: string) => void fetchSuggestions(q), 250);

// ── Column visibility UI ─────────────────────────────────────────────────────
// Two entry points onto the same hiddenColumns set: this tab's own
// "Columns" dropdown (for "I don't want to see this right now") and the
// Settings tab's checklist (for "this is what I always want to see" — see
// admin.html's #settingsColumnsChecklist). Either one toggling a column
// updates both UIs and re-renders the grid immediately.

function rebuildTableColumns(): void {
  buildColgroup();
  buildHeaderRow();
  buildFilterRow();
  updateSortIndicators();
  renderRows();
}

function updateColumnsSummary(): void {
  const summary = document.getElementById('columnsFilterSummary');
  if (!summary) return;
  const shown = COLUMNS.length - hiddenColumns.size;
  summary.textContent = hiddenColumns.size === 0 ? 'All' : `${shown} of ${COLUMNS.length}`;
  summary.classList.toggle('filter-chip-trigger-value--active', hiddenColumns.size > 0);
}

function toggleColumnVisibility(key: string, visible: boolean): void {
  if (visible) hiddenColumns.delete(key); else hiddenColumns.add(key);
  if (!visible) {
    // A filter or sort on a column that's no longer even shown would
    // otherwise keep silently narrowing/ordering the grid with no control
    // left on screen to explain why.
    columnFilters.delete(key);
    if (sortKey === key) sortKey = null;
  }
  saveHiddenColumns(hiddenColumns);
  updateColumnsSummary();
  rebuildTableColumns();
  renderColumnSettingsChecklist();
}

function renderColumnCheckboxes(): void {
  const panel = document.getElementById('columnsFilterPanel');
  if (!panel) return;
  panel.innerHTML = '';
  orderedColumns().forEach(col => {
    const label = document.createElement('label');
    label.className = 'filter-checkbox-row';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = !hiddenColumns.has(col.key);
    checkbox.addEventListener('change', () => toggleColumnVisibility(col.key, checkbox.checked));
    label.append(checkbox, document.createTextNode(col.label));
    panel.appendChild(label);
  });

  const footer = document.createElement('div');
  footer.className = 'filter-chip-panel-footer';
  const showAllBtn = document.createElement('button');
  showAllBtn.type = 'button';
  showAllBtn.className = 'filter-chip-panel-clear';
  showAllBtn.textContent = 'Show All';
  showAllBtn.addEventListener('click', () => {
    if (hiddenColumns.size === 0) return;
    hiddenColumns.clear();
    saveHiddenColumns(hiddenColumns);
    updateColumnsSummary();
    renderColumnCheckboxes();
    rebuildTableColumns();
    renderColumnSettingsChecklist();
  });
  footer.appendChild(showAllBtn);
  panel.appendChild(footer);

  updateColumnsSummary();
}

/** Settings tab's own copy of the same checklist — exported so admin.ts can
 *  render it once at startup regardless of which tab is currently active
 *  (Settings isn't necessarily open yet, but its DOM already exists). */
/** The "default set of hidden/shown columns... in the settings" control —
 *  also where column ORDER is set from outside Table View itself (dragging
 *  a header there is the quicker way to reorder while you're already
 *  looking at the grid; this is the discoverable one). Up/down buttons
 *  rather than drag-and-drop here — a plain vertical list of rows in a
 *  settings panel doesn't carry the same "these are table columns" framing
 *  a header row does, so dragging one wouldn't read as obviously as it
 *  does there. */
export function renderColumnSettingsChecklist(): void {
  const container = document.getElementById('settingsColumnsChecklist');
  if (!container) return;
  container.innerHTML = '';
  const cols = orderedColumns();
  cols.forEach((col, i) => {
    const row = document.createElement('div');
    row.className = 'settings-columns-row';

    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = !hiddenColumns.has(col.key);
    checkbox.addEventListener('change', () => toggleColumnVisibility(col.key, checkbox.checked));
    label.append(checkbox, document.createTextNode(col.label));

    const moveUpBtn = document.createElement('button');
    moveUpBtn.type = 'button';
    moveUpBtn.className = 'settings-columns-move';
    moveUpBtn.textContent = '▲';
    moveUpBtn.title = `Move ${col.label} up`;
    moveUpBtn.disabled = i === 0;
    moveUpBtn.addEventListener('click', () => {
      if (i === 0) return;
      reorderColumn(col.key, cols[i - 1].key);
      rebuildTableColumns();
      renderColumnCheckboxes();
      renderColumnSettingsChecklist();
    });

    const moveDownBtn = document.createElement('button');
    moveDownBtn.type = 'button';
    moveDownBtn.className = 'settings-columns-move';
    moveDownBtn.textContent = '▼';
    moveDownBtn.title = `Move ${col.label} down`;
    moveDownBtn.disabled = i === cols.length - 1;
    moveDownBtn.addEventListener('click', () => {
      if (i >= cols.length - 1) return;
      // Moving down means sitting after the NEXT column, i.e. before
      // whatever comes after that one — reorderColumn only knows "insert
      // before", so this targets i+2's key (or falls through to append at
      // the end when i+1 is already last).
      const targetKey = cols[i + 2]?.key;
      if (targetKey) reorderColumn(col.key, targetKey);
      else { columnOrder = columnOrder.filter(k => k !== col.key); columnOrder.push(col.key); saveColumnOrder(columnOrder); }
      rebuildTableColumns();
      renderColumnCheckboxes();
      renderColumnSettingsChecklist();
    });

    row.append(moveUpBtn, moveDownBtn, label);
    container.appendChild(row);
  });
}

function initColumnsDropdown(): void {
  const fieldEl   = document.getElementById('columnsFilterField');
  const triggerEl = document.getElementById('columnsFilterTrigger');
  const panelEl   = document.getElementById('columnsFilterPanel');
  if (!fieldEl || !triggerEl || !panelEl) return;

  const field   = fieldEl as HTMLElement;
  const trigger = triggerEl as HTMLButtonElement;
  const panel   = panelEl as HTMLElement;

  renderColumnCheckboxes();

  function open(): void  { panel.hidden = false; trigger.setAttribute('aria-expanded', 'true'); }
  function close(): void { panel.hidden = true;  trigger.setAttribute('aria-expanded', 'false'); }

  trigger.addEventListener('click', () => { if (panel.hidden) open(); else close(); });
  document.addEventListener('click', e => { if (!field.contains(e.target as Node)) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) close(); });
}

// ── Init ─────────────────────────────────────────────────────────────────────

export function initTable(): void {
  buildColgroup();
  buildHeaderRow();
  buildFilterRow();
  updateSortIndicators();
  initColumnsDropdown();
  renderColumnSettingsChecklist();

  searchBtn.addEventListener('click', runSearch);
  searchInput.addEventListener('input', () => debouncedSuggest(searchInput.value));
  searchInput.addEventListener('keydown', e => {
    if (!suggestionsEl.hidden && suggestionWords.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); suggestionIndex = Math.min(suggestionIndex + 1, suggestionWords.length - 1); renderSuggestions(); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); suggestionIndex = Math.max(suggestionIndex - 1, 0);                          renderSuggestions(); return; }
      if (e.key === 'Escape')    { hideSuggestions(); return; }
      if (e.key === 'Enter' && suggestionIndex >= 0) { e.preventDefault(); selectSuggestion(suggestionIndex); return; }
    }
    if (e.key === 'Enter') runSearch();
  });
  // mousedown, not click: it fires before the input's own blur handler, so
  // the dropdown is still in the DOM (with its data-index) when this reads it.
  suggestionsEl.addEventListener('mousedown', e => {
    const item = (e.target as HTMLElement).closest<HTMLElement>('.table-search-suggestion');
    if (!item) return;
    e.preventDefault();
    selectSuggestion(Number(item.dataset.index));
  });
  searchInput.addEventListener('blur', () => { setTimeout(hideSuggestions, 150); });

  refreshLangFlag();
  langSelect.addEventListener('change', () => { refreshLangFlag(); hideSuggestions(); page = 1; void loadPage(); });

  const restoreAndReload = (): void => { page = 1; void loadPage(); };
  pageSizeSelect.addEventListener('change', () => {
    writeString(PAGE_SIZE_KEY, pageSizeSelect.value);
    pageSizeCustomEl.style.display = pageSizeSelect.value === 'custom' ? 'inline-block' : 'none';
    if (pageSizeSelect.value === 'custom') pageSizeCustomEl.focus();
    restoreAndReload();
  });
  const debouncedCustomReload = debounce(restoreAndReload, 300);
  pageSizeCustomEl.addEventListener('input', () => {
    writeString(PAGE_SIZE_CUSTOM_KEY, pageSizeCustomEl.value);
    debouncedCustomReload();
  });
  // Restore whatever page size was picked last session — same convenience
  // as column widths already get (see WIDTHS_KEY above).
  const savedPageSize = readString(PAGE_SIZE_KEY);
  if (savedPageSize && [...pageSizeSelect.options].some(o => o.value === savedPageSize)) {
    pageSizeSelect.value = savedPageSize;
  }
  const savedCustomSize = readString(PAGE_SIZE_CUSTOM_KEY);
  if (savedCustomSize) pageSizeCustomEl.value = savedCustomSize;
  pageSizeCustomEl.style.display = pageSizeSelect.value === 'custom' ? 'inline-block' : 'none';

  prevBtn.addEventListener('click', () => { if (page > 1) { page--; void loadPage(); } });
  nextBtn.addEventListener('click', () => { if (page < pages) { page++; void loadPage(); } });
  saveAllBtn.addEventListener('click', () => void saveAll());

  const goToEnteredPage = (): void => {
    const n = parseInt(pageInput.value, 10);
    if (!Number.isFinite(n)) { pageInput.value = String(page); return; }
    const clamped = Math.min(Math.max(n, 1), pages);
    pageInput.value = String(clamped);
    if (clamped !== page) { page = clamped; void loadPage(); }
  };
  pageJumpBtn.addEventListener('click', goToEnteredPage);
  pageInput.addEventListener('keydown', e => { if (e.key === 'Enter') goToEnteredPage(); });
}

// Loaded lazily, the first time this sub-view is actually shown — the table
// view's own vocab fetch is no lighter than the Word Editor's, and most
// sessions never switch to it. Called from admin.ts's Word Editor/Table View
// toggle rather than this module's own tab click listener, since both views
// now live under one tab (see admin.html's #wordsViewToggle).
let tableViewLoaded = false;
export function ensureTableLoaded(): void {
  if (tableViewLoaded) return;
  tableViewLoaded = true;
  void loadMeta().then(loadPage);
}
