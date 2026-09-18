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

import { apiCall, escapeHtml } from './admin-api.js';
import { logger } from '../utils/logger.js';
import { readString, writeString } from '../utils/storage.ts';

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
  { key: 'pos', label: 'POS', width: 90,
    get: w => w.pos ?? '', set: (w, v) => { w.pos = v.trim() || null; } },
  { key: 'difficulty', label: 'Difficulty', width: 90,
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
  { key: 'gender', label: 'Gender', width: 90,
    get: w => w.linguistic?.gender ?? '', set: (w, v) => { w.linguistic = { ...w.linguistic, gender: v.trim() || null }; } },
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

const COLUMN_COUNT = COLUMNS.length;

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

// ── DOM refs ─────────────────────────────────────────────────────────────────

const langSelect     = document.getElementById('tableLangSelect')  as HTMLSelectElement;
const searchInput    = document.getElementById('tableSearchInput') as HTMLInputElement;
const searchBtn      = document.getElementById('tableSearchBtn')   as HTMLButtonElement;
const pageSizeSelect = document.getElementById('tablePageSize')    as HTMLSelectElement;
const saveAllBtn     = document.getElementById('tableSaveAllBtn')  as HTMLButtonElement;
const dirtyCountEl   = document.getElementById('tableDirtyCount')  as HTMLElement;
const prevBtn        = document.getElementById('tablePrevBtn')     as HTMLButtonElement;
const nextBtn        = document.getElementById('tableNextBtn')     as HTMLButtonElement;
const pageLabel      = document.getElementById('tablePageLabel')   as HTMLElement;
const theadRow       = document.getElementById('tableViewHeadRow') as HTMLElement;
const filterRow      = document.getElementById('tableViewFilterRow') as HTMLElement;
const colgroupEl     = document.getElementById('tableViewColgroup') as HTMLTableColElement | null;
const tbody          = document.getElementById('tableViewBody')    as HTMLElement;
const statusEl       = document.getElementById('tableStatusMessage') as HTMLElement | null;

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

function showTableStatus(message: string, type: 'info' | 'success' | 'error' = 'info'): void {
  if (!statusEl) return;
  statusEl.innerHTML = `<div class="status ${type}">${escapeHtml(message)}</div>`;
  setTimeout(() => { statusEl.innerHTML = ''; }, type === 'error' ? 5000 : 3000);
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

// ── Loading ──────────────────────────────────────────────────────────────────

async function loadMeta(): Promise<void> {
  if (metaLoaded) return;
  try {
    const { languages } = await apiCall('/meta') as { languages?: string[] };
    if (languages?.length) {
      const cur = langSelect.value;
      langSelect.innerHTML = languages
        .map(l => `<option value="${escapeHtml(l)}">${escapeHtml(l.charAt(0).toUpperCase() + l.slice(1))}</option>`)
        .join('');
      langSelect.value = languages.includes(cur) ? cur : languages[0];
    }
    metaLoaded = true;
  } catch (err) {
    logger.error('Table view /meta failed:', err);
  }
}

function buildQuery(): string {
  const params = new URLSearchParams();
  params.set('lang',  langSelect.value);
  params.set('limit', pageSizeSelect.value);
  params.set('page',  String(page));
  const q = searchInput.value.trim();
  if (q) params.set('search', q);
  return params.toString();
}

async function loadPage(): Promise<void> {
  if (dirty.size > 0 && !window.confirm('You have unsaved changes on this page. Load a new page and discard them?')) {
    return;
  }
  tbody.innerHTML = `<tr><td colspan="${COLUMN_COUNT}" class="table-view-empty">Loading…</td></tr>`;
  clearDirty();
  try {
    const data = await apiCall(`/vocab?${buildQuery()}`) as { words: TableWord[]; page: number; pages: number };
    page  = data.page;
    pages = Math.max(1, data.pages);
    rows  = new Map(data.words.map(w => [w.word, structuredClone(w)]));
    pageLabel.textContent = `Page ${page} of ${pages}`;
    prevBtn.disabled = page <= 1;
    nextBtn.disabled = page >= pages;
    renderRows();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="${COLUMN_COUNT}" class="table-view-empty">Failed to load.</td></tr>`;
    showTableStatus('Table view error: ' + (err instanceof Error ? err.message : String(err)), 'error');
  }
}

// ── Header: labels, sort, resize, filter ─────────────────────────────────────

function buildColgroup(): void {
  if (!colgroupEl) return;
  colgroupEl.innerHTML = '';
  COLUMNS.forEach(col => {
    const c = document.createElement('col');
    c.style.width = `${col.width}px`;
    c.dataset.col = col.key;
    colgroupEl.appendChild(c);
  });
}

function colEl(key: string): HTMLTableColElement | undefined {
  return colgroupEl?.querySelector<HTMLTableColElement>(`col[data-col="${key}"]`) ?? undefined;
}

function buildHeaderRow(): void {
  theadRow.innerHTML = '';
  COLUMNS.forEach(col => {
    const th = document.createElement('th');
    th.dataset.col = col.key;

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
      renderRows();
    });
    th.appendChild(labelBtn);

    const arrow = document.createElement('span');
    arrow.className = 'table-view-sort-arrow';
    arrow.textContent = sortKey === col.key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';
    labelBtn.appendChild(arrow);

    // Resize handle — drag the right edge to change this column's <col>
    // width. Column widths live on <col> elements (table-layout: fixed),
    // not on each <th>/<td>, so every row's cell in this column resizes
    // together without touching a single one of them.
    const handle = document.createElement('span');
    handle.className = 'table-view-col-resize';
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
    th.appendChild(handle);
    theadRow.appendChild(th);
  });
}

function buildFilterRow(): void {
  filterRow.innerHTML = '';
  COLUMNS.forEach(col => {
    const th = document.createElement('th');
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'table-view-filter-input';
    input.placeholder = 'Filter…';
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

function readonlyCell(value: string, title?: string): HTMLTableCellElement {
  const td = document.createElement('td');
  td.className = 'table-view-cell-readonly';
  td.textContent = value;
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
    tbody.innerHTML = `<tr><td colspan="${COLUMN_COUNT}" class="table-view-empty">No words match.</td></tr>`;
    return;
  }
  words.forEach(word => {
    const w = rows.get(word);
    if (!w) return;
    const tr = document.createElement('tr');
    tr.dataset.word = word;

    COLUMNS.forEach(col => {
      const value = col.get(w);
      tr.appendChild(col.readonly ? readonlyCell(value, col.title) : cellInput(word, col, value));
    });

    if (dirty.has(word)) tr.classList.add('table-view-row--dirty');
    tbody.appendChild(tr);
  });
}

// ── Saving ───────────────────────────────────────────────────────────────────

async function saveAll(): Promise<void> {
  const updates: { word: string; data: unknown }[] = [];
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
    const result = await apiCall(`/vocab?lang=${langSelect.value}`, 'POST', { updates }) as { updated: number };
    showTableStatus(`Saved ${result.updated} word(s)`, 'success');
    clearDirty();
    await loadPage();
  } catch (err) {
    showTableStatus('Save error: ' + (err instanceof Error ? err.message : String(err)), 'error');
  } finally {
    saveAllBtn.textContent = `💾 Save All Changes (${dirty.size})`;
    saveAllBtn.disabled = dirty.size === 0;
  }
}

// ── Init ─────────────────────────────────────────────────────────────────────

export function initTable(): void {
  buildColgroup();
  buildHeaderRow();
  buildFilterRow();

  searchBtn.addEventListener('click', () => { page = 1; void loadPage(); });
  searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') { page = 1; void loadPage(); } });
  langSelect.addEventListener('change', () => { page = 1; void loadPage(); });
  pageSizeSelect.addEventListener('change', () => { page = 1; void loadPage(); });
  prevBtn.addEventListener('click', () => { if (page > 1) { page--; void loadPage(); } });
  nextBtn.addEventListener('click', () => { if (page < pages) { page++; void loadPage(); } });
  saveAllBtn.addEventListener('click', () => void saveAll());

  // Loaded lazily, the first time this tab is actually opened — the table
  // view's own vocab fetch is no lighter than the Word Editor's, and most
  // sessions never open this tab at all.
  let loaded = false;
  document.querySelector('.tab-btn[data-tab="tableview"]')?.addEventListener('click', () => {
    if (loaded) return;
    loaded = true;
    void loadMeta().then(loadPage);
  });
}
