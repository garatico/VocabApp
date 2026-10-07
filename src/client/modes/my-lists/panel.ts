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
  getListMeta, setListMeta, metaFolders,
  getListSources, setListSources, getListSourceCandidates,
} from '../../utils/word-lists.ts';
import { FILTER_SCOPES, SCOPE_LABELS, type FilterScope } from '../../filters/filter-scope.ts';
import { BROWSE_ALL_LIST, NO_SELECTION, deselectAll, type ListsCtx } from './context.ts';
import { renderBrowsePanel } from './browse-panel.ts';
import { cachedVocab, fetchVocab } from './vocab-cache.ts';
import { logger } from '../../utils/logger.ts';
import { createAddSearch } from './add-search.ts';
import { createBulkImport } from './bulk-import.ts';
import { createWordList } from './word-list.ts';
import { createColumnHeader, ACTIONS_WIDTH } from './column-header.ts';
import { renderSmartPanel } from './smart-panel.ts';
import { renderMultiPanel } from './multi-panel.ts';
import { renderProfilePanel } from './profile-panel.ts';
import { renderVisualPanel } from './visual-panel.ts';
import { buildQuizButton } from './list-actions.ts';
import { closePopover, clickedOutsidePopover } from './move-popover.ts';
import type { VocabEntry } from './types.ts';
import { buildLangBadge } from '../../ui/lang-badge.ts';
import { buildChecklistDropdown, closeAllChipDropdowns } from './chip-dropdown.ts';
import { getFolderRegistry, addFolder } from './folders.ts';
import '../../styles-lazy/my-lists.css';
import { askText } from '../../ui/dialog.ts';

/**
 * The outside-click listener is captured on the document, so it has to be
 * removed before the next render installs its replacement. Registering one per
 * render and never removing it left a listener per panel redraw, each holding
 * the elements of a panel that no longer existed.
 */
let outsideClickHandler: ((e: MouseEvent) => void) | null = null;

/** Whether anything is open in the panel: a real list, a smart list, a profile or Browse All Words. */
function hasSelection(ctx: ListsCtx): boolean {
  return !!(ctx.selectedMultiList || ctx.selectedSmart || ctx.selectedVisual || ctx.selectedProfile)
    || (!!ctx.selectedList && ctx.selectedList !== NO_SELECTION);
}

export function renderPanel(ctx: ListsCtx): void {
  renderPanelBody(ctx);
  if (!hasSelection(ctx)) return;
  // A close button at the panel's top-right corner. Sticky inside a zero-height wrapper, so it
  // stays put while a long list scrolls without pushing anything down.
  const wrap = document.createElement('div');
  wrap.className = 'ml-panel-close-wrap';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'ml-panel-close';
  // Drawn, not a text glyph, so the cross sits dead centre in the square.
  btn.innerHTML = '<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M2 2 L10 10 M10 2 L2 10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"/></svg>';
  btn.title = 'Close this and deselect';
  btn.setAttribute('aria-label', 'Deselect');
  btn.addEventListener('click', () => { deselectAll(ctx); ctx.renderSidebar(); });
  wrap.appendChild(btn);
  ctx.panel.prepend(wrap);
}

function renderPanelBody(ctx: ListsCtx): void {
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

  if (ctx.selectedList === NO_SELECTION) {
    const empty = document.createElement('p');
    empty.className = 'ml-panel-empty'; empty.textContent = 'Select a list to see its words.';
    ctx.panel.appendChild(empty); return;
  }

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

  const quizBtn = buildQuizButton(ctx.lang, () => ctx.selectedList || null);

  // Quiz sits at the right end of the title row (Export is in the list card's gear menu).
  const titleActions = document.createElement('span');
  titleActions.className = 'ml-title-actions';
  titleActions.append(quizBtn);

  // Stats row (word count, ranks, mastered) — filled in by the word list on
  // every render; sits on the title row itself, between the title and the actions.
  const statsRow = document.createElement('div');
  statsRow.className = 'ml-stats-row';

  titleGroup.append(flagBadge, title, statsRow, titleActions);

  // ── Filter / sort toolbar ──────────────────────────────────────────────────

  // Column sort / filters over the list (shared by every list type — column-header.ts). Its onChange redraws
  // the list; the word list it belongs to is created further down, which is fine: this only runs on a click.
  // POS and CEFR share the selection Add Vocabulary's results are narrowed by (ctx.selectedPos/Bands), so a
  // change there redraws both.
  const columns = createColumnHeader({
    hasCheckbox: true,
    posSet: ctx.selectedPos,
    bandSet: ctx.selectedBands,
    // A list with no column selected is alphabetical (ctx.sortMode), which the Word column shows.
    initialSort: { key: 'word', dir: 'asc' },
    onChange: () => { add.refresh(); wordList.render(); },
  });


  // ── Part of Speech / Level / Folders / Hide from — dropdowns, one row ───────
  // POS and Level keep the exact chip markup/colouring they always had (see
  // chip-dropdown.ts) — just collapsed behind a summary button instead of
  // always expanded, with Folder/Hide-from moved in next to them (they used
  // to live in the sidebar's own per-card "⚙ Settings" panel).

  const filterDropdownsRow = document.createElement('div');
  filterDropdownsRow.className = 'ml-filter-dropdowns-row';

  const singleFolderScope = `single_${ctx.lang}`;
  function buildFolderFooter(scope: string, onAdd: (name: string) => void): HTMLElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ml-chip-dropdown-new-folder';
    btn.textContent = '+ new folder…';
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const name = await askText({ title: 'New folder', placeholder: 'Folder name', confirmLabel: 'Create' });
      if (!name) return;
      addFolder(scope, name);
      onAdd(name);
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

  // Aggregate lists: other lists of this language this one is made of. Their words are members
  // live (nothing is copied), shown read-only in the list below with the list they came from.
  const sourceSelected = new Set(getListSources(ctx.lang, ctx.selectedList).map(s => s.list));
  const sourceDropdown = buildChecklistDropdown(
    'Made of',
    getListSourceCandidates(ctx.lang, ctx.selectedList).map(n => ({ value: n, label: n, language: ctx.lang })),
    sourceSelected,
    () => {
      setListSources(ctx.lang, ctx.selectedList, [...sourceSelected].map(list => ({ lang: ctx.lang, list })));
      ctx.renderSidebar(false);
      renderPanel(ctx); // rebuild so the word list and count reflect the new sources
    },
  );
  sourceDropdown.wrap.title = 'Build this list from other lists instead of copying their words';

  filterDropdownsRow.append(folderDropdown.wrap, sourceDropdown.wrap, hideFromDropdown.wrap);

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
    statsRow,
    refreshCount,
    refreshAddResults: () => { if (add.input.value.trim()) add.refresh(); },
    columns,
  });

  const listToolbar = document.createElement('div');
  listToolbar.className = 'ml-list-toolbar';
  listToolbar.appendChild(wordList.bulkBar);
  ctx.panel.appendChild(listToolbar);
  ctx.panel.appendChild(wordList.pagerEl);
  ctx.panel.appendChild(columns.el);
  ctx.panel.appendChild(wordList.listEl);
  columns.attach(wordList.listEl, ACTIONS_WIDTH);

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
