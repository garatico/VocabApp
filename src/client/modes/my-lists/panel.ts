/**
 * panel.ts — the right pane for an ordinary list.
 *
 * Assembles the pieces and owns the wiring between them: which redraw follows
 * which action. The pieces themselves — add-search, bulk import, the word list
 * and its bulk bar — are separate modules that know nothing about each other.
 *
 * Layout note: the filter/sort toolbar is built with the header but appended
 * just above the word list, so the filter sits next to what it filters.
 *
 * A smart list takes a different route entirely — see smart-panel.ts.
 */

import { getList, saveListFilterState, refreshFilterSelect } from '../../utils/word-lists.ts';
import type { FilterScope } from '../../filters/filter-scope.ts';
import { BROWSE_ALL_LIST, type ListsCtx } from './context.ts';
import { renderBrowsePanel } from './browse-panel.ts';
import { cachedVocab, cachedVocabMap, fetchVocab } from './vocab-cache.ts';
import { readString } from '../../utils/storage.ts';
import { logger } from '../../utils/logger.ts';
import { createAddSearch } from './add-search.ts';
import { createBulkImport } from './bulk-import.ts';
import { createWordList } from './word-list.ts';
import { renderSmartPanel } from './smart-panel.ts';
import { renderMultiPanel } from './multi-panel.ts';
import { renderProfilePanel } from './profile-panel.ts';
import { exportList } from './export-list.ts';
import { closePopover, clickedOutsidePopover } from './move-popover.ts';
import { BANDS, POS_CHIPS, type ExportFormat, type SortMode, type VocabEntry } from './types.ts';
import { buildLangBadge } from '../../ui/lang-badge.ts';

/**
 * The outside-click listener is captured on the document, so it has to be
 * removed before the next render installs its replacement. Registering one per
 * render and never removing it left a listener per panel redraw, each holding
 * the elements of a panel that no longer existed.
 */
let outsideClickHandler: ((e: MouseEvent) => void) | null = null;

const SORT_OPTIONS: readonly [SortMode, string][] = [
  ['alpha-asc',   'A → Z'],
  ['alpha-desc',  'Z → A'],
  ['rank-asc',    'Easiest first'],
  ['rank-desc',   'Hardest first'],
  ['added-desc',  'Recently added'],
  ['added-asc',   'Oldest first'],
];

export function renderPanel(ctx: ListsCtx): void {
  closePopover();
  ctx.expandedWord = null;
  ctx.panel.innerHTML = '';

  if (ctx.selectedMultiList) { renderMultiPanel(ctx, ctx.selectedMultiList); return; }

  if (ctx.selectedSmart) { renderSmartPanel(ctx, ctx.selectedSmart); return; }

  if (ctx.selectedProfile) {
    renderProfilePanel(ctx, ctx.selectedProfile.mode, ctx.selectedProfile.name);
    return;
  }

  if (ctx.selectedList === BROWSE_ALL_LIST) { renderBrowsePanel(ctx); return; }

  if (!ctx.selectedList) {
    const empty = document.createElement('p');
    empty.className = 'ml-panel-empty'; empty.textContent = 'Create a list to get started.';
    ctx.panel.appendChild(empty); return;
  }

  // ── Header: title, count, export, quiz ─────────────────────────────────────

  const panelHeader = document.createElement('div');
  panelHeader.className = 'ml-panel-header';

  const titleGroup = document.createElement('div');
  titleGroup.className = 'ml-panel-title-group';

  const listLabel = document.createElement('span');
  listLabel.className = 'ml-panel-list-label';
  listLabel.innerHTML = '<span class="ml-panel-selected-dot" aria-hidden="true"></span>Selected List:';

  const flagBadge = buildLangBadge([ctx.lang]);
  flagBadge.classList.add('ml-panel-flag');

  const title = document.createElement('h2');
  title.className = 'ml-panel-title'; title.textContent = ctx.selectedList;

  // The word count now lives in the stats row as its own chip, next to Ranks
  // and Mastered (see word-list.ts's renderStats) — it redraws itself on
  // every wordList.render(), which every mutating action below already
  // triggers, so there is nothing left for this callback to actually do.
  // Kept as a no-op rather than threaded out of every call site below.
  function refreshCount(): void {}

  const exportBtn = document.createElement('button');
  exportBtn.type = 'button'; exportBtn.className = 'ml-export-btn';
  exportBtn.textContent = '↓ Export';

  const exportFmtLabel = document.createElement('span');
  exportFmtLabel.className = 'ml-export-format-label'; exportFmtLabel.textContent = 'Export Format:';

  const exportFmtSel = document.createElement('select');
  exportFmtSel.className = 'ml-export-format-sel';
  exportFmtSel.title = 'Export format';
  ([
    ['with-translation', 'Word + Translation'],
    ['words-only',       'Words Only'],
  ] as const).forEach(([value, label]) => {
    const opt = document.createElement('option');
    opt.value = value; opt.textContent = label;
    exportFmtSel.appendChild(opt);
  });

  exportBtn.addEventListener('click', () => {
    const fmt = exportFmtSel.value as ExportFormat;
    // Exported in the order shown, so the file matches what is on screen.
    exportList(
      wordList.sortWords(getList(ctx.lang, ctx.selectedList)),
      cachedVocabMap(ctx.lang), ctx.selectedList, ctx.lang, fmt,
    );
  });

  const quizBtn = document.createElement('button');
  quizBtn.type = 'button';
  quizBtn.className = 'ml-quiz-btn';
  quizBtn.title = 'Focus this list and start a quiz';
  quizBtn.textContent = '▶ Quiz';
  quizBtn.addEventListener('click', () => {
    if (!ctx.selectedList) return;
    // Quizzing from here means leaving this tab, so pick the mode the user was
    // last in — but only if it's actually a mode this list filter can reach.
    // Trivia has no vocabulary-list concept (its own question bank, not
    // `list`) and My Lists/Settings/History have no quiz at all, so landing
    // on any of those left Start Quiz doing nothing. Same allowlist as
    // history-mode.ts's own "quiz these" action.
    const savedMode = readString('vq_mode');
    const usableModes = new Set(['table', 'picture']);
    const targetMode = savedMode && usableModes.has(savedMode) ? savedMode : 'table';
    // The list filter is per mode, so this has to be written for the mode we
    // are about to switch to. Writing it for My Lists would set up a filter on
    // the tab we are leaving and land on an unfiltered quiz.
    saveListFilterState(
      ctx.lang,
      { active: true, mode: 'focus', selected: [ctx.selectedList] },
      targetMode as FilterScope,
    );
    refreshFilterSelect(ctx.lang);
    document.querySelector<HTMLElement>(`.mode-tab[data-mode="${targetMode}"]`)?.click();
    (document.getElementById('startBtn') as HTMLButtonElement | null)?.click();
  });

  titleGroup.appendChild(listLabel); titleGroup.appendChild(flagBadge);
  titleGroup.appendChild(title);
  titleGroup.appendChild(exportBtn);
  titleGroup.appendChild(exportFmtLabel); titleGroup.appendChild(exportFmtSel);
  // Inline with Export/Export Format rather than its own full-width row
  // below — one less row means the word list gets that height back.
  titleGroup.appendChild(quizBtn);

  // Stats row — filled in by the word list on every render.
  const statsRow = document.createElement('div');
  statsRow.className = 'ml-stats-row';

  // ── Filter / sort toolbar ──────────────────────────────────────────────────

  const controlsGroup = document.createElement('div');
  controlsGroup.className = 'ml-panel-controls';

  const filterLabel = document.createElement('span');
  filterLabel.className = 'ui-label ml-toolbar-label'; filterLabel.textContent = 'Filter';

  const filterInp = document.createElement('input');
  filterInp.type = 'text'; filterInp.placeholder = 'Filter by word, translation or gloss…';
  filterInp.className = 'ml-search';
  filterInp.title = 'Accent-insensitive — searches word, translation and glosses';

  const sortLabel = document.createElement('span');
  sortLabel.className = 'ui-label ml-toolbar-label'; sortLabel.textContent = 'Sort';

  const sortSel = document.createElement('select');
  sortSel.className = 'ml-sort-select'; sortSel.title = 'Sort order';
  SORT_OPTIONS.forEach(([value, label]) => {
    const opt = document.createElement('option');
    opt.value = value; opt.textContent = label; opt.selected = value === ctx.sortMode;
    sortSel.appendChild(opt);
  });
  sortSel.addEventListener('change', () => {
    ctx.sortMode = sortSel.value as SortMode; wordList.render();
  });

  const hideMasteredBtn = document.createElement('button');
  hideMasteredBtn.type = 'button';
  hideMasteredBtn.className = 'ml-hide-mastered-btn';
  hideMasteredBtn.textContent = 'Hide mastered';
  hideMasteredBtn.title = 'Hide words you have marked as mastered';
  hideMasteredBtn.addEventListener('click', () => {
    ctx.hideMastered = !ctx.hideMastered;
    hideMasteredBtn.classList.toggle('ml-hide-mastered-btn--active', ctx.hideMastered);
    wordList.render();
  });
  controlsGroup.appendChild(filterLabel); controlsGroup.appendChild(filterInp);
  controlsGroup.appendChild(sortLabel); controlsGroup.appendChild(sortSel);
  controlsGroup.appendChild(hideMasteredBtn);

  // ── POS chips ──────────────────────────────────────────────────────────────

  const posRow = document.createElement('div');
  posRow.className = 'ml-pos-row';
  const posLabel = document.createElement('span');
  posLabel.className = 'ml-band-label'; posLabel.textContent = 'Part of Speech';
  posRow.appendChild(posLabel);
  const posChipBtns = new Map<string, HTMLButtonElement>();
  POS_CHIPS.forEach(({ value, label }) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'pos-chip' + (value === '' ? ' pos-chip-all active' : '');
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
      add.refresh(); wordList.render();
    });
    posRow.appendChild(chip);
  });

  // ── CEFR level chips ───────────────────────────────────────────────────────
  // band is populated for every word server-side (derived from rank), so this
  // filter works across the whole vocabulary rather than a curated subset.

  const bandRow = document.createElement('div');
  bandRow.className = 'ml-band-row';
  const bandLabel = document.createElement('span');
  bandLabel.className = 'ml-band-label';
  bandLabel.textContent = 'Level';
  bandRow.appendChild(bandLabel);

  const bandChipBtns = new Map<string, HTMLButtonElement>();
  const bandAllChip = document.createElement('button');
  bandAllChip.type = 'button';
  bandAllChip.className = 'pos-chip pos-chip-all active';
  bandAllChip.textContent = 'All';
  bandAllChip.addEventListener('click', () => {
    ctx.selectedBands.clear(); syncBandChips();
    add.refresh(); wordList.render();
  });
  bandRow.appendChild(bandAllChip);

  BANDS.forEach(band => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'pos-chip ml-band-chip';
    chip.dataset.band = band;
    chip.textContent = band;
    bandChipBtns.set(band, chip);
    chip.addEventListener('click', () => {
      if (ctx.selectedBands.has(band)) ctx.selectedBands.delete(band);
      else ctx.selectedBands.add(band);
      syncBandChips();
      add.refresh(); wordList.render();
    });
    bandRow.appendChild(chip);
  });

  function syncBandChips(): void {
    bandAllChip.classList.toggle('active', ctx.selectedBands.size === 0);
    bandChipBtns.forEach((btn, band) =>
      btn.classList.toggle('active', ctx.selectedBands.has(band)));
  }

  panelHeader.appendChild(titleGroup);
  panelHeader.appendChild(statsRow);
  panelHeader.appendChild(posRow);
  panelHeader.appendChild(bandRow);
  ctx.panel.appendChild(panelHeader);

  // ── Vocabulary ─────────────────────────────────────────────────────────────
  // Starts with whatever is cached so the panel renders immediately, then is
  // replaced when the fetch lands.

  let allVocab: VocabEntry[] = cachedVocab(ctx.lang);
  const getVocab = (): VocabEntry[] => allVocab;

  // ── Add words ──────────────────────────────────────────────────────────────

  const addSection = document.createElement('div');
  addSection.className = 'ml-add-section';

  const addHeading = document.createElement('div');
  addHeading.className = 'ml-add-heading';
  addHeading.textContent = '+ Add Vocabulary';

  const add = createAddSearch(ctx, getVocab, (fullSidebar = false) => {
    refreshCount();
    ctx.updateBadge();
    wordList.render();
    ctx.renderSidebar(fullSidebar);
  });

  const bulk = createBulkImport(ctx, getVocab, () => {
    refreshCount();
    ctx.updateBadge();
    wordList.render();
    ctx.renderSidebar(false);
  });

  // Heading, search box and bulk-import toggle all share one line now — the
  // heading used to sit on its own row above, costing a full row of height
  // for a label the search box's placeholder text already implies.
  const addTopRow = document.createElement('div');
  addTopRow.className = 'ml-add-top-row';
  addTopRow.append(addHeading, add.row, bulk.toggle);

  addSection.appendChild(addTopRow);
  addSection.appendChild(add.results);
  addSection.appendChild(bulk.panel);
  ctx.panel.appendChild(addSection);

  // ── Word list ──────────────────────────────────────────────────────────────

  const wordList = createWordList(ctx, {
    filterInput: filterInp,
    statsRow,
    posChipBtns,
    refreshCount,
    refreshAddResults: () => { if (add.input.value.trim()) add.refresh(); },
  });

  const listToolbar = document.createElement('div');
  listToolbar.className = 'ml-list-toolbar';
  listToolbar.appendChild(controlsGroup);
  listToolbar.appendChild(wordList.bulkBar);
  ctx.panel.appendChild(listToolbar);
  ctx.panel.appendChild(wordList.listEl);

  filterInp.addEventListener('input', () => wordList.render());

  // ── Dismissal ──────────────────────────────────────────────────────────────

  if (outsideClickHandler) {
    document.removeEventListener('click', outsideClickHandler, true);
  }
  outsideClickHandler = (e: MouseEvent) => {
    if (!addSection.contains(e.target as Node)) add.results.hidden = true;
    if (clickedOutsidePopover(e.target as Node)) closePopover();
  };
  document.addEventListener('click', outsideClickHandler, true);

  // ── Go ─────────────────────────────────────────────────────────────────────

  wordList.render();

  fetchVocab(ctx.lang).then(entries => {
    allVocab = entries;
    if (document.activeElement === add.input && add.input.value.trim()) add.refresh();
    wordList.render();
  }).catch(logger.error);
}
