import { Settings } from '../../settings.ts';
import { pageCountFor } from '../table-controls.ts';

/**
 * my-content/shared.ts — small DOM builders and widgets the My Content sections
 * all use: element/field helpers, the sort-direction toggle, domain chips and
 * the shared paginated-list pager.
 */

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, className?: string, text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function field(labelText: string, input: HTMLElement): HTMLElement {
  const wrap = el('label', 'mc-field');
  wrap.appendChild(el('span', 'mc-field-label', labelText));
  wrap.appendChild(input);
  return wrap;
}

export function textInput(placeholder = '', value = ''): HTMLInputElement {
  const i = el('input', 'mc-input');
  i.type = 'text';
  i.placeholder = placeholder;
  i.value = value;
  return i;
}

export function selectInput(options: readonly string[], value?: string): HTMLSelectElement {
  const s = el('select', 'mc-input');
  for (const o of options) {
    const opt = el('option', undefined, o);
    opt.value = o;
    s.appendChild(opt);
  }
  if (value) s.value = value;
  return s;
}

export function csv(s: string): string[] {
  return s.split(',').map(x => x.trim()).filter(Boolean);
}

/** One example sentence per line, rather than comma-separated — a sentence
 *  routinely contains commas of its own. */
export function lines(s: string): string[] {
  return s.split('\n').map(x => x.trim()).filter(Boolean);
}

export function textArea(placeholder = '', value = ''): HTMLTextAreaElement {
  const t = document.createElement('textarea');
  t.className = 'mc-input mc-textarea';
  t.rows = 2;
  t.placeholder = placeholder;
  t.value = value;
  return t;
}

// ── Sort direction (shared by the Trivia / Guess the Blank editors) ─────────

export type MCSortDir = 'asc' | 'desc';

/** Ascending/Descending — reuses Settings' own .sort-order-toggle/
 *  .sort-order-btn pill-pair styling (buttons.css) so this reads as the same
 *  kind of control wherever it shows up in the app, rather than a bespoke
 *  one just for this toolbar. Takes just `{ dir }` rather than the full
 *  MCListState so a caller with its own differently-shaped sort state (the
 *  trivia/Guess the Blank editors' own TriviaListState) can reuse this
 *  exact control too, not just the word editors. */
export function buildSortDirToggle(state: { dir: MCSortDir }, onChange: () => void): HTMLElement {
  const wrap = el('div', 'sort-order-toggle mc-sort-dir-toggle');
  const ascBtn = el('button', 'sort-order-btn', 'Ascending');
  ascBtn.type = 'button';
  const descBtn = el('button', 'sort-order-btn', 'Descending');
  descBtn.type = 'button';
  function sync(): void {
    ascBtn.classList.toggle('active', state.dir === 'asc');
    descBtn.classList.toggle('active', state.dir === 'desc');
  }
  sync();
  ascBtn.addEventListener('click', () => { state.dir = 'asc'; sync(); onChange(); });
  descBtn.addEventListener('click', () => { state.dir = 'desc'; sync(); onChange(); });
  wrap.append(ascBtn, descBtn);
  return wrap;
}

/** "food" → "Food", "daily_life" → "Daily life" — same capitalization Table
 *  mode's own Domains filter uses (filters/domain-filter.ts's own private
 *  fmt()), reproduced here rather than imported since that module pulls in
 *  a whole quiz-filter-chaining system this lightweight toolbar has no use
 *  for. */
function formatDomainLabel(d: string): string {
  return d.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
}

/** Appends a "Domains" label + one pill per domain actually present in
 *  `counts` (alphabetical by display label, distinct — there's no fixed enum
 *  for domains the way there is for Part of Speech/Level) to `target`. Each
 *  pill shows how many of the words currently in view carry that domain,
 *  and the label itself is capitalized — both matching Table mode's own
 *  Domains filter (.domain-qpick/.domain-qpick-count, domain-filter.css)
 *  rather than this toolbar's plain .pos-chip look, since this is the one
 *  filter here without a small fixed vocabulary a reader would already
 *  recognize the way Verb/Noun/A1/B2 read at a glance. A no-op when
 *  `counts` is empty, so a caller with nothing to filter by doesn't render a
 *  bare "Domains / All" row with nothing underneath it. */
export function appendDomainChips(
  target: HTMLElement, counts: Map<string, number>, selected: Set<string>, totalCount: number, onChange: () => void,
): void {
  if (counts.size === 0) return;
  target.appendChild(el('span', 'ml-band-label mc-toolbar-group-label', 'Domains'));

  const allChip = el('button', 'domain-qpick pos-chip-all');
  allChip.type = 'button';
  allChip.append(el('span', undefined, 'All'), el('span', 'domain-qpick-count', String(totalCount)));
  allChip.classList.toggle('active', selected.size === 0);
  allChip.addEventListener('click', () => { selected.clear(); onChange(); });
  target.appendChild(allChip);

  [...counts.keys()]
    .sort((a, b) => formatDomainLabel(a).localeCompare(formatDomainLabel(b)))
    .forEach(domain => {
      const chip = el('button', 'domain-qpick mc-domain-chip');
      chip.type = 'button';
      chip.append(el('span', undefined, formatDomainLabel(domain)), el('span', 'domain-qpick-count', String(counts.get(domain))));
      chip.classList.toggle('active', selected.has(domain));
      chip.addEventListener('click', () => {
        if (selected.has(domain)) selected.delete(domain);
        else selected.add(domain);
        onChange();
      });
      target.appendChild(chip);
    });
}

// ── Shared paginated-list pager (Add a New Word / Edit an Existing Word) ────
//
// Same page-size math as Table mode (table-controls.ts's own pageSlice/
// pageCountFor), so a list here paginates exactly the way that one does —
// not reinvented, just reused for a much shorter list. Styled with Table
// mode's own pager classes (.table-pager/.pager-btn/.pager-status,
// table.css) rather than this file's own, so the two look identical; a
// page-size <select> (.pager-select, controls-bar.css) is the one addition
// Table mode's own pager doesn't have, since that mode sets its page size
// from the WORDS control bar instead.

const MC_PAGE_SIZES = [5, 10, 15] as const;
type MCPageSize = (typeof MC_PAGE_SIZES)[number];

interface ListPager {
  row: HTMLElement;
  /** Repaints prev/next/status for `page` (already clamped by the caller)
   *  against `totalItems`. */
  sync: (page: number, totalItems: number) => void;
  getPageSize: () => MCPageSize;
}

export function buildListPager(
  onPageChange: (page: number) => void, onPageSizeChange: () => void, initialPageSize: MCPageSize = 10,
): ListPager {
  const row = el('div', 'mc-list-pager');

  let pageSize: MCPageSize = initialPageSize;
  const sizeSelect = el('select', 'pager-select mc-list-pager-size');
  MC_PAGE_SIZES.forEach(n => sizeSelect.appendChild(new Option(`${n} per page`, String(n))));
  sizeSelect.value = String(pageSize);
  sizeSelect.addEventListener('change', () => {
    pageSize = Number(sizeSelect.value) as MCPageSize;
    onPageSizeChange();
  });

  const nav = el('div', 'table-pager');
  const prevBtn = el('button', 'pager-btn', '←');
  prevBtn.type = 'button';
  prevBtn.setAttribute('aria-label', 'Previous page');
  const status = el('span', 'pager-status');
  const nextBtn = el('button', 'pager-btn', '→');
  nextBtn.type = 'button';
  nextBtn.setAttribute('aria-label', 'Next page');

  let currentPage = 0;
  prevBtn.addEventListener('click', () => onPageChange(Math.max(0, currentPage - 1)));
  nextBtn.addEventListener('click', () => onPageChange(currentPage + 1));
  nav.append(prevBtn, status, nextBtn);
  row.append(sizeSelect, nav);

  function sync(page: number, totalItems: number): void {
    currentPage = page;
    // The size picker stays available even at one page — smaller pages are
    // still a reasonable thing to want before there's enough to actually
    // paginate — only the prev/status/next group hides.
    row.hidden = totalItems === 0;
    const pages = pageCountFor(totalItems, pageSize);
    nav.hidden = pages <= 1;
    prevBtn.disabled = page === 0;
    nextBtn.disabled = page >= pages - 1;
    const first = totalItems === 0 ? 0 : page * pageSize + 1;
    const last  = Math.min((page + 1) * pageSize, totalItems);
    status.textContent = totalItems > 0 ? `Page ${page + 1} of ${pages}  (${first}–${last})` : '';
  }
  return { row, sync, getPageSize: () => pageSize };
}

/** Settings.getMyContentPageSize() reads back a plain number — clamped to
 *  one of buildListPager's own three options rather than trusted outright,
 *  in case a future release narrows MC_PAGE_SIZES and leaves an old saved
 *  value that no longer matches any of them. */
export function myContentInitialPageSize(): MCPageSize {
  const n = Settings.getMyContentPageSize();
  return (MC_PAGE_SIZES as readonly number[]).includes(n) ? (n as MCPageSize) : 5;
}
