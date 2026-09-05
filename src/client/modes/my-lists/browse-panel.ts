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
 */

import { foldKey as norm } from '../../utils/match.ts';
import type { ListsCtx } from './context.ts';
import { cachedVocab, fetchVocab } from './vocab-cache.ts';
import { getMastered } from './mastery.ts';
import { buildMasteryControls, appendCountChip, appendMasteredChip, buildWordDetail } from './row-shared.ts';
import { buildAudioButton } from '../../ui/audio-play-button.ts';
import { buildLangBadge } from '../../ui/lang-badge.ts';
import { logger } from '../../utils/logger.ts';
import { pageCountFor, pageSlice } from '../table-controls.ts';
import { readString, writeString } from '../../utils/storage.ts';
import { fillHighlighted } from '../../utils/dom.ts';
import { openMovePopover, closePopover, clickedOutsidePopover } from './move-popover.ts';
import { BANDS, POS_ABBREV, POS_CHIPS, type VocabEntry } from './types.ts';

/** Words per page — matches Table mode's own default page size, so a
 *  learner already used to that number doesn't have to learn a new one. */
const BROWSE_PAGE_SIZE = 100;

type BrowseSortMode = 'rank-asc' | 'rank-desc' | 'alpha-asc' | 'alpha-desc';
const VALID_SORT_MODES: readonly BrowseSortMode[] = ['rank-asc', 'rank-desc', 'alpha-asc', 'alpha-desc'];

const SORT_OPTIONS: readonly [BrowseSortMode, string][] = [
  ['rank-asc',   'Most Frequent First'],
  ['rank-desc',  'Least Frequent First'],
  ['alpha-asc',  'A → Z'],
  ['alpha-desc', 'Z → A'],
];

// Remembered across visits (see ml_ prefix in storage.ts) — unlike the
// ordinary list view, this one has no per-list identity to key state off
// of, so there's exactly one saved sort/filter for "Browse All Words",
// shared across languages the same way the view itself is per-language but
// otherwise identical everywhere.
const SORT_KEY   = 'ml_browse_sort';
const FILTER_KEY = 'ml_browse_filter';

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

  const controlsGroup = document.createElement('div');
  controlsGroup.className = 'ml-panel-controls';

  const filterLabel = document.createElement('span');
  filterLabel.className = 'ui-label ml-toolbar-label'; filterLabel.textContent = 'Filter';
  const filterInp = document.createElement('input');
  filterInp.type = 'text'; filterInp.placeholder = 'Filter by word, translation or gloss…';
  filterInp.className = 'ml-search';
  filterInp.title = 'Accent-insensitive — searches word, translation and glosses';
  filterInp.value = readString(FILTER_KEY) ?? '';

  const sortLabel = document.createElement('span');
  sortLabel.className = 'ui-label ml-toolbar-label'; sortLabel.textContent = 'Sort';
  const sortSel = document.createElement('select');
  sortSel.className = 'ml-sort-select'; sortSel.title = 'Sort order';
  const savedSort = readString(SORT_KEY);
  let sortMode: BrowseSortMode = (VALID_SORT_MODES as readonly string[]).includes(savedSort ?? '')
    ? (savedSort as BrowseSortMode) : 'rank-asc';
  SORT_OPTIONS.forEach(([value, label]) => {
    const opt = document.createElement('option');
    opt.value = value; opt.textContent = label; opt.selected = value === sortMode;
    sortSel.appendChild(opt);
  });
  sortSel.addEventListener('change', () => {
    sortMode = sortSel.value as BrowseSortMode;
    writeString(SORT_KEY, sortMode);
    render(true);
  });

  controlsGroup.append(filterLabel, filterInp, sortLabel, sortSel);

  // ── POS chips (shared with the ordinary list view — see ctx.selectedPos) ──

  const posRow = document.createElement('div');
  posRow.className = 'ml-pos-row';
  const posLabel = document.createElement('span');
  posLabel.className = 'ml-band-label'; posLabel.textContent = 'Part of Speech';
  posRow.appendChild(posLabel);
  const posChipBtns = new Map<string, HTMLButtonElement>();
  POS_CHIPS.forEach(({ value, label }) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'pos-chip'
      + (value === '' ? ' pos-chip-all' : '')
      + ((value === '' ? ctx.selectedPos.size === 0 : ctx.selectedPos.has(value)) ? ' active' : '');
    chip.textContent = label;
    if (value) { chip.dataset.pos = value; posChipBtns.set(value, chip); }
    chip.addEventListener('click', () => {
      if (value === '') ctx.selectedPos.clear();
      else {
        if (ctx.selectedPos.has(value)) ctx.selectedPos.delete(value);
        else ctx.selectedPos.add(value);
      }
      posRow.querySelectorAll<HTMLButtonElement>('.pos-chip').forEach(c => {
        c.classList.toggle('active',
          c.dataset.pos ? ctx.selectedPos.has(c.dataset.pos) : ctx.selectedPos.size === 0);
      });
      render(true);
    });
    posRow.appendChild(chip);
  });

  // ── CEFR level chips (shared — see ctx.selectedBands). Populated for every
  // word server-side, so this works across the whole vocabulary. ──

  const bandRow = document.createElement('div');
  bandRow.className = 'ml-band-row';
  const bandLabel = document.createElement('span');
  bandLabel.className = 'ml-band-label'; bandLabel.textContent = 'Level';
  bandRow.appendChild(bandLabel);

  const bandChipBtns = new Map<string, HTMLButtonElement>();
  const bandAllChip = document.createElement('button');
  bandAllChip.type = 'button';
  bandAllChip.className = 'pos-chip pos-chip-all' + (ctx.selectedBands.size === 0 ? ' active' : '');
  bandAllChip.textContent = 'All';
  bandAllChip.addEventListener('click', () => { ctx.selectedBands.clear(); syncBandChips(); render(true); });
  bandRow.appendChild(bandAllChip);

  BANDS.forEach(band => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'pos-chip ml-band-chip' + (ctx.selectedBands.has(band) ? ' active' : '');
    chip.dataset.band = band;
    chip.textContent = band;
    bandChipBtns.set(band, chip);
    chip.addEventListener('click', () => {
      if (ctx.selectedBands.has(band)) ctx.selectedBands.delete(band);
      else ctx.selectedBands.add(band);
      syncBandChips();
      render(true);
    });
    bandRow.appendChild(chip);
  });

  function syncBandChips(): void {
    bandAllChip.classList.toggle('active', ctx.selectedBands.size === 0);
    bandChipBtns.forEach((btn, band) => btn.classList.toggle('active', ctx.selectedBands.has(band)));
  }

  header.append(controlsGroup, posRow, bandRow);
  ctx.panel.appendChild(header);

  filterInp.addEventListener('input', () => {
    writeString(FILTER_KEY, filterInp.value);
    render(true);
  });

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

    sortMode = 'rank-asc';
    sortSel.value = 'rank-asc';
    writeString(SORT_KEY, sortMode);
    filterInp.value = '';
    writeString(FILTER_KEY, '');
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

  // ── Word list ──────────────────────────────────────────────────────────

  const listEl = document.createElement('ul');
  listEl.className = 'ml-word-list';
  ctx.panel.appendChild(listEl);

  // Starts with whatever is cached so the panel renders immediately, then is
  // replaced when the fetch lands — same pattern as panel.ts's own allVocab.
  let allWords: VocabEntry[] = cachedVocab(ctx.lang);
  let visible: VocabEntry[] = [];
  let pageIndex = 0;

  function sortEntries(entries: VocabEntry[]): VocabEntry[] {
    const F = 9999;
    switch (sortMode) {
      case 'rank-asc':   return [...entries].sort((a, b) => (a.rank ?? F) - (b.rank ?? F));
      case 'rank-desc':  return [...entries].sort((a, b) => (b.rank ?? F) - (a.rank ?? F));
      case 'alpha-asc':  return [...entries].sort((a, b) => norm(a.word).localeCompare(norm(b.word)));
      case 'alpha-desc': return [...entries].sort((a, b) => norm(b.word).localeCompare(norm(a.word)));
    }
  }

  /** Per-chip counts, always over the *whole* vocabulary regardless of the
   *  current filter/search — "if you clicked this chip, you'd see N words,"
   *  same as the ordinary list view's own updateChipCounts. */
  function updateChipCounts(): void {
    const counts: Record<string, number> = {};
    for (const e of allWords) {
      if (e.pos) counts[e.pos] = (counts[e.pos] ?? 0) + 1;
    }
    for (const [pos, btn] of posChipBtns) {
      const n = counts[pos] ?? 0;
      const chipDef = POS_CHIPS.find(c => c.value === pos);
      btn.textContent = `${chipDef?.label ?? pos} (${n})`;
    }
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

    const q = norm(filterInp.value);
    const filtered = allWords.filter(e => {
      if (ctx.selectedPos.size > 0 && !ctx.selectedPos.has(e.pos ?? '')) return false;
      if (ctx.selectedBands.size > 0 && !ctx.selectedBands.has(e.band ?? '')) return false;
      if (!q) return true;
      if (norm(e.word).includes(q) || norm(e.translation).includes(q)) return true;
      return e.glosses.some(g => norm(g).includes(q));
    });

    renderStats(filtered);
    updateChipCounts();
    visible = sortEntries(filtered);
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
      empty.textContent = filterInp.value ? 'No matches.' : 'No words match the current filters.';
      listEl.appendChild(empty);
      pagerRow.hidden = true;
      return;
    }

    const pages = pageCountFor(visible.length, BROWSE_PAGE_SIZE);
    pageIndex = Math.min(Math.max(0, pageIndex), pages - 1);
    const mastered = getMastered(ctx.lang);
    pageSlice(visible, BROWSE_PAGE_SIZE, pageIndex).forEach(entry => listEl.appendChild(buildRow(entry, mastered)));
    updatePager(pages, visible.length);
  }

  function buildRow(entry: VocabEntry, mastered: Set<string>): HTMLLIElement {
    const isMastered = mastered.has(entry.word);
    const li = document.createElement('li');
    li.className = 'ml-word-item'
      + (entry.word === ctx.expandedWord ? ' ml-word-item--expanded' : '')
      + (isMastered ? ' ml-word-item--mastered' : '');

    // Word/meaning disambiguators moved into the expanded detail below (see
    // row-shared.ts's buildWordDetail) rather than inline here — this is
    // the one panel with no per-list membership to fall back on, so keeping
    // every row's columns the same width regardless of which words happen
    // to carry a disambiguator matters even more here than elsewhere.
    const wordSpan = document.createElement('span');
    wordSpan.className = 'ml-word-text';
    fillHighlighted(wordSpan, entry.word, filterInp.value);

    const audioBtn = buildAudioButton(entry.audioUrl);

    const posSpan = document.createElement('span');
    posSpan.className = 'ml-word-pos';
    posSpan.textContent = POS_ABBREV[entry.pos ?? ''] ?? '';
    if (posSpan.textContent && entry.pos) posSpan.dataset.pos = entry.pos; else posSpan.hidden = true;

    const transSpan = document.createElement('span');
    transSpan.className = 'ml-word-trans';
    if (entry.translation) fillHighlighted(transSpan, entry.translation, filterInp.value);

    const rankBadge = document.createElement('span');
    rankBadge.className = 'ml-word-rank';
    if (entry.rank != null) rankBadge.textContent = '#' + entry.rank;
    else rankBadge.hidden = true;

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'ml-word-actions';
    // Your own rating and quiz history — per word/language, not per list, so
    // these still apply here exactly as they do on an ordinary list's row.
    const { masteryBtn, quizBadge } = buildMasteryControls(ctx.lang, entry.word, render);

    const addBtn = document.createElement('button');
    addBtn.type = 'button'; addBtn.className = 'ml-move-btn';
    addBtn.title = 'Add to a list'; addBtn.textContent = '+';
    addBtn.addEventListener('click', e => {
      e.stopPropagation();
      openMovePopover(ctx, addBtn, [entry.word], () => { /* nothing else to redraw here */ }, { copyOnly: true });
    });

    actionsDiv.append(quizBadge, masteryBtn, addBtn);

    li.appendChild(wordSpan);
    if (audioBtn) li.appendChild(audioBtn);
    li.appendChild(posSpan);
    li.append(rankBadge, transSpan, actionsDiv);

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
  };
  document.addEventListener('click', outsideClickHandler, true);

  // ── Go ─────────────────────────────────────────────────────────────────

  render();

  fetchVocab(ctx.lang).then(entries => {
    allWords = entries;
    render();
  }).catch(logger.error);
}
