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

import {
  getList, getListMeta, setListMeta, metaFolders,
} from '../../utils/word-lists.ts';
import { FILTER_SCOPES, SCOPE_LABELS, type FilterScope } from '../../filters/filter-scope.ts';
import { BROWSE_ALL_LIST, type ListsCtx } from './context.ts';
import { renderBrowsePanel } from './browse-panel.ts';
import { cachedVocab, cachedVocabMap, fetchVocab } from './vocab-cache.ts';
import { logger } from '../../utils/logger.ts';
import { createAddSearch } from './add-search.ts';
import { createBulkImport } from './bulk-import.ts';
import { createWordList } from './word-list.ts';
import { renderSmartPanel } from './smart-panel.ts';
import { renderMultiPanel } from './multi-panel.ts';
import { renderProfilePanel } from './profile-panel.ts';
import { renderVisualPanel } from './visual-panel.ts';
import { exportList } from './export-list.ts';
import { buildExportControls, buildQuizButton } from './list-actions.ts';
import { closePopover, clickedOutsidePopover } from './move-popover.ts';
import { BANDS, POS_CHIPS, type SortMode, type VocabEntry } from './types.ts';
import { buildLangBadge } from '../../ui/lang-badge.ts';
import { buildChipDropdown, buildChecklistDropdown, closeAllChipDropdowns } from './chip-dropdown.ts';
import { getFolderRegistry, addFolder } from './folders.ts';

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

  if (ctx.selectedVisual) { renderVisualPanel(ctx, ctx.selectedVisual); return; }

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

  const exportControls = buildExportControls(fmt => {
    // Exported in the order shown, so the file matches what is on screen.
    exportList(
      wordList.sortWords(getList(ctx.lang, ctx.selectedList)),
      cachedVocabMap(ctx.lang), ctx.selectedList, ctx.lang, fmt,
    );
  });
  const quizBtn = buildQuizButton(ctx.lang, () => ctx.selectedList || null);

  // Export + Quiz sit at the right end of the title row.
  const titleActions = document.createElement('span');
  titleActions.className = 'ml-title-actions';
  titleActions.append(...exportControls, quizBtn);

  // Stats row (word count, ranks, mastered) — filled in by the word list on
  // every render; sits on the title row itself, between the title and the actions.
  const statsRow = document.createElement('div');
  statsRow.className = 'ml-stats-row';

  titleGroup.append(flagBadge, title, statsRow, titleActions);

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

  // ── Part of Speech / Level / Folders / Hide from — dropdowns, one row ───────
  // POS and Level keep the exact chip markup/colouring they always had (see
  // chip-dropdown.ts) — just collapsed behind a summary button instead of
  // always expanded, with Folder/Hide-from moved in next to them (they used
  // to live in the sidebar's own per-card "⚙ Settings" panel).

  const filterDropdownsRow = document.createElement('div');
  filterDropdownsRow.className = 'ml-filter-dropdowns-row';

  const posDropdown = buildChipDropdown('Part of Speech', 'pos', POS_CHIPS.filter(c => c.value), ctx.selectedPos, () => {
    add.refresh(); wordList.render();
  });
  const posChipBtns = posDropdown.chips;

  const bandDropdown = buildChipDropdown(
    'Level', 'band', BANDS.map(b => ({ value: b, label: b })), ctx.selectedBands,
    () => { add.refresh(); wordList.render(); },
  );

  const singleFolderScope = `single_${ctx.lang}`;
  function buildFolderFooter(scope: string, onAdd: (name: string) => void): HTMLElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ml-chip-dropdown-new-folder';
    btn.textContent = '+ new folder…';
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const name = window.prompt('New folder name:');
      if (!name?.trim()) return;
      addFolder(scope, name.trim());
      onAdd(name.trim());
    });
    return btn;
  }

  const folderSelected = new Set(metaFolders(getListMeta(ctx.lang, ctx.selectedList)));
  const folderDropdown = buildChecklistDropdown(
    'Folders',
    getFolderRegistry(singleFolderScope).map(f => ({ value: f, label: f })),
    folderSelected,
    () => {
      const meta = getListMeta(ctx.lang, ctx.selectedList);
      setListMeta(ctx.lang, ctx.selectedList, { ...meta, folders: [...folderSelected], folder: undefined });
      ctx.renderSidebar(false);
    },
    buildFolderFooter(singleFolderScope, name => {
      folderSelected.add(name);
      const meta = getListMeta(ctx.lang, ctx.selectedList);
      setListMeta(ctx.lang, ctx.selectedList, { ...meta, folders: [...folderSelected], folder: undefined });
      ctx.renderSidebar(false);
      renderPanel(ctx); // rebuild so the new folder shows as a selectable option
    }),
  );

  const hiddenSelected = new Set(getListMeta(ctx.lang, ctx.selectedList).hiddenModes ?? []);
  const hideFromDropdown = buildChecklistDropdown(
    'Hide From', FILTER_SCOPES.map(s => ({ value: s, label: SCOPE_LABELS[s] })), hiddenSelected,
    () => {
      const meta = getListMeta(ctx.lang, ctx.selectedList);
      setListMeta(ctx.lang, ctx.selectedList, { ...meta, hiddenModes: [...hiddenSelected] as FilterScope[] });
      ctx.renderSidebar(false);
    },
  );

  filterDropdownsRow.append(posDropdown.wrap, bandDropdown.wrap, folderDropdown.wrap, hideFromDropdown.wrap);

  panelHeader.appendChild(titleGroup);
  panelHeader.appendChild(filterDropdownsRow);
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
  ctx.panel.appendChild(wordList.pagerEl);
  ctx.panel.appendChild(wordList.listEl);

  filterInp.addEventListener('input', () => wordList.render());

  // ── Dismissal ──────────────────────────────────────────────────────────────

  if (outsideClickHandler) {
    document.removeEventListener('click', outsideClickHandler, true);
  }
  outsideClickHandler = (e: MouseEvent) => {
    if (!addSection.contains(e.target as Node)) add.results.hidden = true;
    if (clickedOutsidePopover(e.target as Node)) closePopover();
    if (!(e.target as HTMLElement).closest('.ml-chip-dropdown')) closeAllChipDropdowns();
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
