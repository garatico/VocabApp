/**
 * browse-panel.ts — the right-hand pane for "Browse All Words" (see
 * context.ts's BROWSE_ALL_LIST sentinel and sidebar.ts's renderBrowseNav).
 *
 * A read-mostly view over a whole language's vocabulary — not list
 * membership, so none of panel.ts's add/remove/move/export machinery
 * applies here. Rows reuse row-shared.ts's mastery controls (marking
 * mastery and viewing quiz history are per-word, not per-list, so they
 * still make sense) but drop word-list.ts's own checkbox/move/remove
 * buttons entirely — a word being browsed isn't "in" this view in any
 * sense that removing it could undo.
 *
 * Paginated, unlike word-list.ts's infinite-scroll chunking — this view is
 * the *entire* vocabulary (tens of thousands of words for some languages),
 * and a page you can jump to by number is a better fit for "I want to look
 * something up" than scrolling through an ever-growing feed. Reuses
 * table-mode's own pageSlice/pageCountFor for the same reason table-controls.ts
 * and browse-panel.ts should never compute page math two slightly different
 * ways.
 *
 * POS/level chips and the expanded-word detail reuse `ctx.selectedPos`/
 * `ctx.selectedBands`/`ctx.expandedWord` — the same shared state panel.ts's
 * ordinary-list view uses — rather than resetting to "All" every time this
 * view opens; sort order and the search text are local to this view instead,
 * since "added"/"recently added" (two of the ordinary list's six sort
 * options) have no meaning for the whole vocabulary.
 *
 * Above the rows is a spreadsheet-style header (the Admin panel's Table View
 * does the same): each column - Word, POS, Rank, Definition, Percent,
 * Mastered - has a button that sorts by it (ascending, descending, off) and a
 * box that filters it. The rules for both live in utils/column-view.ts, which
 * the Admin grid now uses too. Rank, Percent and Mastered are numbers, so
 * their boxes also take `>100`, `<=50`, `=7` or a range `10-50`.
 */

import type { ListsCtx } from './context.ts';
import { cachedVocab, fetchVocab } from './vocab-cache.ts';
import { getMastered } from './mastery.ts';
import { buildRowCells, buildActionsCell, appendCountChip, appendMasteredChip, buildWordDetail, buildEditInMyContentButton } from './row-shared.ts';
import {
  createColumnHeader, createCellReader, applyColumnFilters, applyColumnSort, ACTIONS_WIDTH, type ColumnItem,
} from './column-header.ts';
import type { SortState } from '../../utils/column-view.ts';
import { buildLangBadge } from '../../ui/lang-badge.ts';
import { logger } from '../../utils/logger.ts';
import { pageCountFor, pageSlice } from '../table-controls.ts';
import { openMovePopover, closePopover, clickedOutsidePopover } from './move-popover.ts';
import type { VocabEntry } from './types.ts';
import { closeAllChipDropdowns } from './chip-dropdown.ts';
import '../../styles-lazy/my-lists.css';

/** Words per page — matches Table mode's own default page size, so a
 *  learner already used to that number doesn't have to learn a new one. */
const BROWSE_PAGE_SIZE = 100;

/** No column selected (the third click) is the vocabulary's own order: most frequent first. */
const DEFAULT_SORT: SortState = { key: 'rank', dir: 'asc' };

// Remembered across visits (see ml_ prefix in storage.ts) — unlike the
// ordinary list view, this one has no per-list identity to key state off
// of, so there's exactly one saved sort/filter for "Browse All Words",
// shared across languages the same way the view itself is per-language but
// otherwise identical everywhere.
const SORT_KEY   = 'ml_browse_sort';

/** Same reasoning as panel.ts's own module-level outsideClickHandler: has to
 *  be removed before the next render installs its replacement, or every
 *  visit to this view stacks one more listener holding a panel that no
 *  longer exists. */
let outsideClickHandler: ((e: MouseEvent) => void) | null = null;

export function renderBrowsePanel(ctx: ListsCtx): void {
  // ── Header ─────────────────────────────────────────────────────────────

  const header = document.createElement('div');
  header.className = 'ml-panel-header';

  const titleGroup = document.createElement('div');
  titleGroup.className = 'ml-panel-title-group';
  const flagBadge = buildLangBadge([ctx.lang]);
  flagBadge.classList.add('ml-panel-flag');
  const title = document.createElement('h2');
  title.className = 'ml-panel-title';
  title.textContent = 'Browse All Words';
  titleGroup.append(flagBadge, title);
  header.appendChild(titleGroup);

  const statsRow = document.createElement('div');
  statsRow.className = 'ml-stats-row';
  header.appendChild(statsRow);

  // ── Filter / sort toolbar ──────────────────────────────────────────────

  // Sort and per-column filters live in the column header above the list (column-header.ts, shared with every
  // other list type). Its sort is remembered across visits; its filters are not. POS and CEFR share the
  // selection the other list views use (ctx.selectedPos / ctx.selectedBands).
  const columns = createColumnHeader({
    hasCheckbox: false,
    storageKey: SORT_KEY,
    initialSort: DEFAULT_SORT,
    posSet: ctx.selectedPos,
    bandSet: ctx.selectedBands,
    onChange: () => render(true),
  });

  // A pending "jump to this word" target (see context.ts's focusWord) wins
  // over whatever filter/expansion was left from a previous visit — it's
  // one-shot, so it's cleared the moment it's read here.
  const scrollToFocusWord = ctx.focusWord !== null;
  if (ctx.focusWord !== null) {
    columns.reset(DEFAULT_SORT);
    columns.setFilter('word', ctx.focusWord);
    ctx.expandedWord = ctx.focusWord;
    ctx.focusWord = null;
  }

  ctx.panel.appendChild(header);

  // ── Pager ────────────────────────────────────────────────────────────────
  // Built once, before the list itself, so page N is right there above what
  // it controls rather than only at the bottom after scrolling past it.

  const pagerRow = document.createElement('div');
  pagerRow.className = 'ml-browse-pager';

  const prevBtn = document.createElement('button');
  prevBtn.type = 'button'; prevBtn.className = 'ml-icon-btn ml-text-btn';
  prevBtn.textContent = '← Prev';
  prevBtn.addEventListener('click', () => { pageIndex--; render(); });

  const pageSel = document.createElement('select');
  pageSel.className = 'ml-sort-select ml-browse-page-select';
  pageSel.title = 'Jump to page';
  pageSel.addEventListener('change', () => { pageIndex = Number(pageSel.value); render(); });

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button'; nextBtn.className = 'ml-icon-btn ml-text-btn';
  nextBtn.textContent = 'Next →';
  nextBtn.addEventListener('click', () => { pageIndex++; render(); });

  // Jump straight to the page holding a given frequency rank — forces
  // rank-ascending sort and clears the text filter first, since "page 12"
  // only means the same thing to both of those as it does to this jump when
  // nothing else is reordering or hiding words out from under it.
  const rankJumpInp = document.createElement('input');
  rankJumpInp.type = 'number'; rankJumpInp.min = '1';
  rankJumpInp.className = 'ml-browse-rank-input';
  rankJumpInp.placeholder = 'Rank #';
  rankJumpInp.title = 'Jump to the page containing this frequency rank';

  const rankJumpBtn = document.createElement('button');
  rankJumpBtn.type = 'button'; rankJumpBtn.className = 'ml-icon-btn ml-text-btn';
  rankJumpBtn.textContent = 'Go to rank →';

  function jumpToRank(): void {
    const target = Number(rankJumpInp.value);
    if (!Number.isFinite(target) || target <= 0) return;
    const ranked = allWords.filter((e): e is VocabEntry & { rank: number } => e.rank != null)
      .sort((a, b) => a.rank - b.rank);
    if (ranked.length === 0) return;
    let idx = ranked.findIndex(e => e.rank >= target);
    if (idx === -1) idx = ranked.length - 1;

    columns.reset(DEFAULT_SORT);
    pageIndex = Math.floor(idx / BROWSE_PAGE_SIZE);
    render();
  }
  rankJumpBtn.addEventListener('click', jumpToRank);
  rankJumpInp.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); jumpToRank(); }
  });

  pagerRow.append(prevBtn, pageSel, nextBtn, rankJumpInp, rankJumpBtn);
  ctx.panel.appendChild(pagerRow);

  /** Rebuilds the page-jump options (only when the page count actually
   *  changed — a long vocabulary can run to hundreds of pages) and syncs
   *  the prev/next buttons' disabled state and the dropdown's own value. */
  function updatePager(pages: number, totalFiltered: number): void {
    pagerRow.hidden = pages <= 1;
    prevBtn.disabled = pageIndex === 0;
    nextBtn.disabled = pageIndex >= pages - 1;
    if (pageSel.options.length !== pages) {
      pageSel.innerHTML = '';
      for (let i = 0; i < pages; i++) {
        const opt = document.createElement('option');
        opt.value = String(i);
        const from = i * BROWSE_PAGE_SIZE + 1;
        const to   = Math.min((i + 1) * BROWSE_PAGE_SIZE, totalFiltered);
        opt.textContent = `Page ${i + 1} of ${pages}  (${from}–${to})`;
        pageSel.appendChild(opt);
      }
    }
    pageSel.value = String(pageIndex);
  }

  // ── Column header ───────────────────────────────────────────────────────────────────────────────
  // Above the list, on the same named grid tracks as its rows. Rows here are list items, not a <table>.
  ctx.panel.appendChild(columns.el);

  // ── Word list ──────────────────────────────────────────────────────────

  const listEl = document.createElement('ul');
  listEl.className = 'ml-word-list';
  ctx.panel.appendChild(listEl);

  columns.attach(listEl, ACTIONS_WIDTH);

  // Starts with whatever is cached so the panel renders immediately, then is
  // replaced when the fetch lands — same pattern as panel.ts's own allVocab.
  let allWords: VocabEntry[] = cachedVocab(ctx.lang);
  let visible: VocabEntry[] = [];
  let pageIndex = 0;

  /** A browse row is already a vocabulary entry: it is its own item for the column filters and sort. */
  const columnItem = (e: VocabEntry): ColumnItem => ({ lang: ctx.lang, word: e.word, entry: e });

  /** Per-chip counts, always over the *whole* vocabulary regardless of the
   *  current filter/search — "if you clicked this chip, you'd see N words,"
   *  same as the ordinary list view's own updateChipCounts. */
  function updateChipCounts(): void {
    const pos: Record<string, number> = {};
    const band: Record<string, number> = {};
    for (const e of allWords) {
      if (e.pos) pos[e.pos] = (pos[e.pos] ?? 0) + 1;
      if (e.band) band[e.band] = (band[e.band] ?? 0) + 1;
    }
    columns.setCounts('pos', pos);
    columns.setCounts('band', band);
  }

  function renderStats(words: VocabEntry[]): void {
    statsRow.innerHTML = '';
    appendCountChip(statsRow, allWords.length);
    if (allWords.length === 0) return;

    if (words.length > 0) {
      let minRank = Infinity; let maxRank = -Infinity; let rankedCount = 0;
      for (const e of words) {
        if (e.rank != null) {
          if (e.rank < minRank) minRank = e.rank;
          if (e.rank > maxRank) maxRank = e.rank;
          rankedCount++;
        }
      }
      if (rankedCount > 1) {
        const chip = document.createElement('span');
        chip.className = 'ml-stat-chip ml-stat-chip--ranks';
        chip.textContent = `Ranks #${minRank}–#${maxRank}`;
        statsRow.appendChild(chip);
      } else if (rankedCount === 1) {
        const chip = document.createElement('span');
        chip.className = 'ml-stat-chip ml-stat-chip--ranks';
        chip.textContent = `Rank #${minRank}`;
        statsRow.appendChild(chip);
      }
    }

    const mastered = getMastered(ctx.lang);
    const masteredCount = words.filter(e => mastered.has(e.word)).length;
    appendMasteredChip(statsRow, masteredCount);
  }

  /**
   * @param resetPage Pass true whenever the *filtered set itself* just
   * changed (search text, a POS/level chip, sort order) — staying on, say,
   * page 5 of a search that now matches two words would just show an empty
   * page. Left false (the default) for a redraw that doesn't change which
   * words match — marking a word's mastery or expanding its detail row —
   * so doing either doesn't bounce you back to page 1 of whatever you were
   * looking at.
   */
  function render(resetPage = false): void {
    if (resetPage) pageIndex = 0;

    const read = createCellReader();
    const filtered = applyColumnFilters(allWords, columns, columnItem, read);

    renderStats(filtered);
    updateChipCounts();
    visible = applyColumnSort(filtered, columns, columnItem, read)
      ?? applyColumnSort(filtered, { sort: DEFAULT_SORT, filters: new Map(), sets: { pos: new Set(), band: new Set(), mastered: new Set() } }, columnItem, read)
      ?? filtered;
    listEl.innerHTML = '';

    if (allWords.length === 0) {
      const loading = document.createElement('li');
      loading.className = 'ml-word-empty';
      loading.textContent = 'Loading vocabulary…';
      listEl.appendChild(loading);
      pagerRow.hidden = true;
      return;
    }
    if (visible.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'ml-word-empty';
      empty.textContent = columns.hasFilters() ? 'No matches.' : 'No words match the current filters.';
      listEl.appendChild(empty);
      pagerRow.hidden = true;
      return;
    }

    const pages = pageCountFor(visible.length, BROWSE_PAGE_SIZE);
    pageIndex = Math.min(Math.max(0, pageIndex), pages - 1);
    pageSlice(visible, BROWSE_PAGE_SIZE, pageIndex).forEach(entry => listEl.appendChild(buildRow(entry)));
    updatePager(pages, visible.length);
    columns.sync();
  }

  function buildRow(entry: VocabEntry): HTMLLIElement {
    const li = document.createElement('li');
    li.className = 'ml-word-item' + (entry.word === ctx.expandedWord ? ' ml-word-item--expanded' : '');

    // The data cells are the same ones every list's rows use (row-shared.ts), so the column header sits over
    // them the same way.
    const { cells } = buildRowCells({
      lang: ctx.lang, word: entry.word, entry,
      filter: columns.filters.get('word') ?? '', transFilter: columns.filters.get('definition') ?? '',
      redraw: render,
    });

    const addBtn = document.createElement('button');
    addBtn.type = 'button'; addBtn.className = 'ml-move-btn';
    addBtn.title = 'Add to a list'; addBtn.dataset.label = 'Add to a list'; addBtn.textContent = '+';
    addBtn.addEventListener('click', e => {
      e.stopPropagation();
      openMovePopover(ctx, addBtn, [entry.word], () => { /* nothing else to redraw here */ }, { copyOnly: true });
    });

    const editBtn = buildEditInMyContentButton(ctx.lang, entry.word);

    li.append(...cells, buildActionsCell([editBtn, addBtn]));

    // ── Preview row (collapsed unless expanded) ────────────────────────────
    const detail = entry.word === ctx.expandedWord
      ? buildWordDetail(entry, ctx.lang)
      : document.createElement('div');
    detail.classList.add('ml-word-detail');
    li.appendChild(detail);

    li.addEventListener('click', e => {
      if ((e.target as HTMLElement).closest('button')) return;
      ctx.expandedWord = (ctx.expandedWord === entry.word) ? null : entry.word;
      render();
    });

    return li;
  }

  // ── Dismissal ──────────────────────────────────────────────────────────

  if (outsideClickHandler) document.removeEventListener('click', outsideClickHandler, true);
  outsideClickHandler = (e: MouseEvent) => {
    if (clickedOutsidePopover(e.target as Node)) closePopover();
    if (!(e.target as HTMLElement).closest('.ml-chip-dropdown')) closeAllChipDropdowns();
  };
  document.addEventListener('click', outsideClickHandler, true);

  // ── Go ─────────────────────────────────────────────────────────────────

  render();
  if (scrollToFocusWord) {
    // Deferred to the next tick so the freshly-built list is actually in
    // the document by the time this runs (same reasoning as My Content's
    // own openWordInMyContentEditor scroll).
    setTimeout(() => {
      listEl.querySelector('.ml-word-item--expanded')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 0);
  }

  fetchVocab(ctx.lang).then(entries => {
    allWords = entries;
    render();
  }).catch(logger.error);
}
