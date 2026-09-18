/**
 * multi-panel.ts — the right pane for a cross-language list.
 *
 * Brought to parity with panel.ts/word-list.ts: filter, sort, hide-mastered,
 * POS/Level chips, per-row mastery scale and quiz badge, bulk select. The one
 * thing missing on purpose is "Move to…" — a cross-language entry's mastery
 * and quiz history live under its own language (mastery.ts, session-history.ts
 * are both keyed by `lang`), and there is no single-language destination a
 * mixed-language selection could move to that would mean the same thing for
 * every word in it.
 *
 * Every per-word lookup below takes the entry's own `language`, not one
 * `ctx.lang` — that is the whole difference from word-list.ts, and the reason
 * this isn't just that module generalized. `getMasteryLevel`, `quizStrength`,
 * `getMastered` and `cachedVocabMap` are all keyed by language already, so
 * this mostly means passing `entry.language` through instead of `ctx.lang`.
 *
 * Also has its own Add Vocabulary box — a word can be added from the ★
 * button elsewhere, but that requires already being on a word from the right
 * language, and starting a list from nothing needs somewhere to search from
 * scratch.
 */

import {
  getMultiList, getMultiListLanguages, removeFromMultiList, addToMultiList, isInMultiList,
  getMultiAddedDate, getMultiListMeta, setMultiListMeta, metaFolders,
  type MultiListEntry,
} from '../../utils/word-lists.ts';
import { FILTER_SCOPES, SCOPE_LABELS, type FilterScope } from '../../filters/filter-scope.ts';
import { buildChipDropdown, buildChecklistDropdown, closeAllChipDropdowns } from './chip-dropdown.ts';
import { getFolderRegistry, addFolder } from './folders.ts';
import { foldKey as norm } from '../../utils/match.ts';
import type { ListsCtx } from './context.ts';
import { fetchVocab, cachedVocabMap } from './vocab-cache.ts';
import { getMastered, setMasteryLevel, MASTERY_LEVELS } from './mastery.ts';
import { showUndo } from './undo-toast.ts';
import { logger } from '../../utils/logger.ts';
import { buildLangBadge } from '../../ui/lang-badge.ts';
import { LANGUAGES } from '../../data/languages.ts';
import {
  POS_ABBREV, POS_CHIPS, BANDS, type SortMode, type VocabEntry,
} from './types.ts';
import { buildMasteryControls, appendCountChip, appendMasteredChip, buildWordDetail, buildEditInMyContentButton } from './row-shared.ts';
import { buildAudioButton } from '../../ui/audio-play-button.ts';
import { fillHighlighted } from '../../utils/dom.ts';

const SORT_OPTIONS: readonly [SortMode, string][] = [
  ['alpha-asc',   'A → Z'],
  ['alpha-desc',  'Z → A'],
  ['rank-asc',    'Easiest first'],
  ['rank-desc',   'Hardest first'],
  ['added-desc',  'Recently added'],
  ['added-asc',   'Oldest first'],
];

/** Closes the Part of Speech/Level/Folders/Hide-from dropdowns on an outside
 *  click — same "remove before the next render installs its replacement"
 *  reasoning as panel.ts's own outsideClickHandler. */
let outsideClickHandler: ((e: MouseEvent) => void) | null = null;

/** A stable, unique key for an entry — word alone can repeat across languages. */
function entryKey(e: MultiListEntry): string {
  return e.language + '\u0000' + e.word;
}

export function renderMultiPanel(ctx: ListsCtx, listName: string): void {
  ctx.panel.innerHTML = '';

  const entries = getMultiList(listName);

  // ── Filter/sort/select state — local to this render, like panel.ts's own
  //    closures, since a cross-language list has no ctx fields of its own. ──
  let filterQuery   = '';
  let sortMode: SortMode = 'added-desc';
  let hideMastered  = false;
  let expandedKey: string | null = null;
  const selectedKeys = new Set<string>();
  const selectedPos   = new Set<string>();
  const selectedBands = new Set<string>();

  // ── Header ───────────────────────────────────────────────────────────────
  const header = document.createElement('div');
  header.className = 'ml-panel-header';

  const titleGroup = document.createElement('div');
  titleGroup.className = 'ml-panel-title-group';
  const title = document.createElement('h2');
  title.className = 'ml-panel-title'; title.textContent = listName;
  titleGroup.appendChild(title);
  header.appendChild(titleGroup);

  // Flags + count sit on their own line, below the title — see sidebar.ts's
  // card for the same split (name can run long; the meta shouldn't have to
  // fight it for a line).
  const metaRow = document.createElement('div');
  metaRow.className = 'ml-panel-meta-row';
  let langBadge = buildLangBadge(getMultiListLanguages(listName));
  const countBadge = document.createElement('span');
  countBadge.className = 'ml-list-count';
  function refreshCountBadge(): void {
    countBadge.textContent = `${entries.length} word${entries.length === 1 ? '' : 's'}`;
  }
  refreshCountBadge();
  metaRow.append(langBadge, countBadge);
  header.appendChild(metaRow);

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
  filterInp.addEventListener('input', () => { filterQuery = filterInp.value; renderRows(); });

  const sortLabel = document.createElement('span');
  sortLabel.className = 'ui-label ml-toolbar-label'; sortLabel.textContent = 'Sort';
  const sortSel = document.createElement('select');
  sortSel.className = 'ml-sort-select'; sortSel.title = 'Sort order';
  SORT_OPTIONS.forEach(([value, label]) => {
    const opt = document.createElement('option');
    opt.value = value; opt.textContent = label; opt.selected = value === sortMode;
    sortSel.appendChild(opt);
  });
  sortSel.addEventListener('change', () => { sortMode = sortSel.value as SortMode; renderRows(); });

  const hideMasteredBtn = document.createElement('button');
  hideMasteredBtn.type = 'button';
  hideMasteredBtn.className = 'ml-hide-mastered-btn';
  hideMasteredBtn.textContent = 'Hide mastered';
  hideMasteredBtn.title = 'Hide words you have marked as mastered';
  hideMasteredBtn.addEventListener('click', () => {
    hideMastered = !hideMastered;
    hideMasteredBtn.classList.toggle('ml-hide-mastered-btn--active', hideMastered);
    renderRows();
  });
  controlsGroup.append(filterLabel, filterInp, sortLabel, sortSel, hideMasteredBtn);

  // ── Part of Speech / Level / Folders / Hide from — dropdowns, one row ───────
  // Same chip-dropdown treatment as panel.ts — see that file's own comment.

  const filterDropdownsRow = document.createElement('div');
  filterDropdownsRow.className = 'ml-filter-dropdowns-row';

  const posDropdown = buildChipDropdown(
    'Part of Speech', 'pos', POS_CHIPS.filter(c => c.value), selectedPos, renderRows,
  );
  const bandDropdown = buildChipDropdown(
    'Level', 'band', BANDS.map(b => ({ value: b, label: b })), selectedBands, renderRows,
  );

  const multiFolderScope = 'multi';
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

  const folderSelected = new Set(metaFolders(getMultiListMeta(listName)));
  const folderDropdown = buildChecklistDropdown(
    'Folders',
    getFolderRegistry(multiFolderScope).map(f => ({ value: f, label: f })),
    folderSelected,
    () => {
      const meta = getMultiListMeta(listName);
      setMultiListMeta(listName, { ...meta, folders: [...folderSelected], folder: undefined });
      ctx.renderSidebar(false);
    },
    buildFolderFooter(multiFolderScope, name => {
      folderSelected.add(name);
      const meta = getMultiListMeta(listName);
      setMultiListMeta(listName, { ...meta, folders: [...folderSelected], folder: undefined });
      ctx.renderSidebar(false);
      renderMultiPanel(ctx, listName); // rebuild so the new folder is selectable
    }),
  );

  const hiddenSelected = new Set(getMultiListMeta(listName).hiddenModes ?? []);
  const hideFromDropdown = buildChecklistDropdown(
    'Hide from', FILTER_SCOPES.map(s => ({ value: s, label: SCOPE_LABELS[s] })), hiddenSelected,
    () => {
      const meta = getMultiListMeta(listName);
      setMultiListMeta(listName, { ...meta, hiddenModes: [...hiddenSelected] as FilterScope[] });
      ctx.renderSidebar(false);
    },
  );

  filterDropdownsRow.append(posDropdown.wrap, bandDropdown.wrap, folderDropdown.wrap, hideFromDropdown.wrap);

  header.appendChild(statsRow);
  header.appendChild(filterDropdownsRow);
  ctx.panel.appendChild(header);

  // ── Add Vocabulary ─────────────────────────────────────────────────────────
  // A plain, one-language-at-a-time search — the ★ picker on a word already
  // knows that word's language, but starting a list from nothing needs
  // somewhere to search from scratch.

  const addSection = document.createElement('div');
  addSection.className = 'ml-add-section';
  const addHeading = document.createElement('div');
  addHeading.className = 'ml-add-heading';
  addHeading.textContent = '+ Add Vocabulary';

  const addTopRow = document.createElement('div');
  addTopRow.className = 'ml-add-top-row';
  addTopRow.appendChild(addHeading);

  const langSel = document.createElement('select');
  langSel.className = 'ml-lang-select ml-multi-add-lang';
  LANGUAGES.forEach(({ name, label }) => {
    const opt = document.createElement('option');
    opt.value = name; opt.textContent = label;
    langSel.appendChild(opt);
  });
  // Default to a language already in the list, if any — most likely what
  // the user wants to add more of — otherwise the first supported language.
  const existingLangs = getMultiListLanguages(listName);
  langSel.value = existingLangs[0] ?? LANGUAGES[0].name;

  const addRow = document.createElement('div');
  addRow.className = 'ml-add-row';
  const icon = document.createElement('span');
  icon.className = 'ml-add-icon'; icon.textContent = '+';
  const addInput = document.createElement('input');
  addInput.type = 'text'; addInput.placeholder = 'Search vocabulary to add…';
  addInput.className = 'ml-add-input';
  addRow.append(icon, addInput);

  addTopRow.append(langSel, addRow);
  addSection.appendChild(addTopRow);

  const addResults = document.createElement('ul');
  addResults.className = 'ml-add-results'; addResults.hidden = true;
  addSection.appendChild(addResults);
  ctx.panel.appendChild(addSection);

  function doAdd(entry: VocabEntry): void {
    addToMultiList(listName, entry.word, langSel.value);
    entries.push({ word: entry.word, language: langSel.value });
    refreshCountBadge();
    const nextBadge = buildLangBadge(getMultiListLanguages(listName));
    langBadge.replaceWith(nextBadge);
    langBadge = nextBadge;
    ctx.renderSidebar(false);
    renderRows();
    renderAddResults(addInput.value.trim());
    addInput.focus();
  }

  function renderAddResults(query: string): void {
    addResults.innerHTML = '';
    if (!query) { addResults.hidden = true; return; }
    const vocab = cachedVocabMap(langSel.value);
    if (!vocab) { addResults.hidden = true; return; }
    const q = norm(query);
    const matches = [...vocab.values()]
      .filter(e => !isInMultiList(listName, e.word, langSel.value))
      .filter(e => norm(e.word).includes(q)
                || norm(e.translation).includes(q)
                || e.glosses.some(g => norm(g).includes(q)))
      .slice(0, 12);
    if (matches.length === 0) { addResults.hidden = true; return; }

    matches.forEach(entry => {
      const li = document.createElement('li');
      li.className = 'ml-add-result-item';
      const wordSpan = document.createElement('span');
      wordSpan.className = 'ml-add-result-word'; wordSpan.textContent = entry.word;
      const posSpan = document.createElement('span');
      posSpan.className = 'ml-word-pos ml-word-pos--result';
      posSpan.textContent = POS_ABBREV[entry.pos ?? ''] ?? '';
      if (entry.pos) posSpan.dataset.pos = entry.pos;
      if (!posSpan.textContent) posSpan.hidden = true;
      const transSpan = document.createElement('span');
      transSpan.className = 'ml-add-result-trans'; transSpan.textContent = entry.translation;
      const addBtn = document.createElement('button');
      addBtn.type = 'button'; addBtn.className = 'ml-add-btn';
      addBtn.title = 'Add to list'; addBtn.textContent = '+';
      addBtn.addEventListener('click', e => { e.stopPropagation(); doAdd(entry); });
      li.addEventListener('click', () => doAdd(entry));
      li.append(wordSpan, posSpan, transSpan, addBtn);
      addResults.appendChild(li);
    });
    addResults.hidden = false;
  }

  addInput.addEventListener('input', () => renderAddResults(addInput.value.trim()));
  langSel.addEventListener('change', () => {
    addInput.value = ''; addResults.hidden = true;
    ensureVocabLoaded(langSel.value);
  });

  function ensureVocabLoaded(lang: string): void {
    if (cachedVocabMap(lang)) return;
    addInput.disabled = true;
    addInput.placeholder = 'Loading vocabulary…';
    fetchVocab(lang).then(() => {
      addInput.disabled = false;
      addInput.placeholder = 'Search vocabulary to add…';
    }).catch(logger.error);
  }
  ensureVocabLoaded(langSel.value);

  // ── Bulk action bar ────────────────────────────────────────────────────────
  // No "Move to…" here — see the module doc for why.

  const bulkBar = document.createElement('div');
  bulkBar.className = 'ml-bulk-bar';
  bulkBar.hidden = true;
  const bulkCount = document.createElement('span');
  bulkCount.className = 'ml-bulk-count';
  function makeBulkBtn(label: string, title: string, cls = ''): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'ml-bulk-btn' + (cls ? ' ' + cls : '');
    b.textContent = label; b.title = title;
    return b;
  }
  const bulkSelectAll = makeBulkBtn('Select all', 'Select every word currently shown');
  const bulkMaster    = makeBulkBtn('✓ Mastered', 'Mark the selected words as mastered');
  const bulkUnmaster  = makeBulkBtn('Unmark', 'Clear mastered on the selected words');
  const bulkRemove    = makeBulkBtn('× Remove', 'Remove the selected words from this list',
                                    'ml-bulk-btn--danger');
  const bulkClear     = makeBulkBtn('Clear', 'Deselect everything');
  bulkBar.append(bulkCount, bulkSelectAll, bulkMaster, bulkUnmaster, bulkRemove, bulkClear);

  const listToolbar = document.createElement('div');
  listToolbar.className = 'ml-list-toolbar';
  listToolbar.append(controlsGroup, bulkBar);
  ctx.panel.appendChild(listToolbar);

  // ── Word list ────────────────────────────────────────────────────────────
  const listEl = document.createElement('ul');
  listEl.className = 'ml-word-list';
  ctx.panel.appendChild(listEl);

  let visible: MultiListEntry[] = [];

  function syncBulkBar(): void {
    const visibleKeys = new Set(visible.map(entryKey));
    [...selectedKeys].forEach(k => { if (!visibleKeys.has(k)) selectedKeys.delete(k); });
    const n = selectedKeys.size;
    bulkBar.hidden = n === 0;
    bulkCount.textContent = n === 1 ? '1 selected' : `${n} selected`;
    bulkSelectAll.textContent = n > 0 && n === visible.length ? 'Select none' : 'Select all';
    listEl.querySelectorAll<HTMLInputElement>('.ml-word-check').forEach(cb => {
      cb.checked = selectedKeys.has(cb.dataset.key ?? '');
    });
  }

  bulkSelectAll.addEventListener('click', () => {
    if (selectedKeys.size === visible.length) selectedKeys.clear();
    else visible.forEach(e => selectedKeys.add(entryKey(e)));
    syncBulkBar();
  });
  bulkClear.addEventListener('click', () => { selectedKeys.clear(); syncBulkBar(); });
  bulkMaster.addEventListener('click', () => {
    visible.filter(e => selectedKeys.has(entryKey(e)))
      .forEach(e => setMasteryLevel(e.language, e.word, MASTERY_LEVELS.length - 1));
    selectedKeys.clear(); renderRows();
  });
  bulkUnmaster.addEventListener('click', () => {
    visible.filter(e => selectedKeys.has(entryKey(e)))
      .forEach(e => setMasteryLevel(e.language, e.word, 0));
    selectedKeys.clear(); renderRows();
  });
  bulkRemove.addEventListener('click', () => {
    const toRemove = visible.filter(e => selectedKeys.has(entryKey(e)));
    if (toRemove.length === 0) return;
    toRemove.forEach(e => {
      removeFromMultiList(listName, e.word, e.language);
      const idx = entries.findIndex(x => x.word === e.word && x.language === e.language);
      if (idx !== -1) entries.splice(idx, 1);
    });
    selectedKeys.clear();
    refreshCountBadge(); ctx.renderSidebar(false); renderRows();
    showUndo(`Removed ${toRemove.length} word${toRemove.length === 1 ? '' : 's'}`, () => {
      toRemove.forEach(e => { entries.push(e); addToMultiList(listName, e.word, e.language); });
      refreshCountBadge(); ctx.renderSidebar(false); renderRows();
    });
  });

  // ── Sort / filter / render ──────────────────────────────────────────────────

  function sortEntries(list: MultiListEntry[]): MultiListEntry[] {
    const F = 9999;
    const rankOf = (e: MultiListEntry) => cachedVocabMap(e.language)?.get(e.word)?.rank ?? F;
    switch (sortMode) {
      case 'alpha-asc':  return [...list].sort((a, b) => norm(a.word).localeCompare(norm(b.word)));
      case 'alpha-desc': return [...list].sort((a, b) => norm(b.word).localeCompare(norm(a.word)));
      case 'rank-asc':   return [...list].sort((a, b) => rankOf(a) - rankOf(b));
      case 'rank-desc':  return [...list].sort((a, b) => rankOf(b) - rankOf(a));
      case 'added-asc':  return [...list];
      case 'added-desc': return [...list].reverse();
    }
  }

  function updateChipCounts(list: MultiListEntry[]): void {
    const counts: Record<string, number> = {};
    for (const e of list) {
      const pos = cachedVocabMap(e.language)?.get(e.word)?.pos;
      if (pos) counts[pos] = (counts[pos] ?? 0) + 1;
    }
    posDropdown.wrap.querySelectorAll<HTMLButtonElement>('.pos-chip[data-pos]').forEach(btn => {
      const pos = btn.dataset.pos ?? '';
      const chipDef = POS_CHIPS.find(c => c.value === pos);
      btn.textContent = `${chipDef?.label ?? pos} (${counts[pos] ?? 0})`;
    });
  }

  function renderStats(list: MultiListEntry[]): void {
    statsRow.innerHTML = '';
    appendCountChip(statsRow, entries.length);
    const masteredCount = list.filter(e => getMastered(e.language).has(e.word)).length;
    appendMasteredChip(statsRow, masteredCount);
  }

  function renderRows(): void {
    listEl.innerHTML = '';
    const q = norm(filterQuery);
    const filtered = entries.filter(e => {
      if (hideMastered && getMastered(e.language).has(e.word)) return false;
      const ve = cachedVocabMap(e.language)?.get(e.word);
      if (selectedPos.size > 0 && !selectedPos.has(ve?.pos ?? '')) return false;
      if (selectedBands.size > 0 && !selectedBands.has(ve?.band ?? '')) return false;
      if (!q) return true;
      if (norm(e.word).includes(q)) return true;
      if (!ve) return false;
      return norm(ve.translation).includes(q) || ve.glosses.some(g => norm(g).includes(q));
    });

    renderStats(filtered);
    updateChipCounts(filtered);
    visible = sortEntries(filtered);
    syncBulkBar();

    if (visible.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'ml-word-empty';
      empty.textContent = entries.length === 0
        ? 'No words yet — search above, or use the ★ button on any word.'
        : (filterQuery ? 'No matches.' : 'No words match the current filters.');
      listEl.appendChild(empty);
      return;
    }
    visible.forEach(e => listEl.appendChild(buildRow(e)));
  }

  function buildRow(entry: MultiListEntry): HTMLLIElement {
    const key   = entryKey(entry);
    const ve    = cachedVocabMap(entry.language)?.get(entry.word);
    const posLabel   = POS_ABBREV[ve?.pos ?? ''] ?? '';
    const isMastered = getMastered(entry.language).has(entry.word);

    const li = document.createElement('li');
    li.className = 'ml-word-item'
      + (key === expandedKey ? ' ml-word-item--expanded' : '')
      + (isMastered ? ' ml-word-item--mastered' : '');

    const check = document.createElement('input');
    check.type = 'checkbox';
    check.className = 'ml-word-check';
    check.dataset.key = key;
    check.checked = selectedKeys.has(key);
    check.title = 'Select for bulk actions';
    check.addEventListener('click', e => e.stopPropagation());
    check.addEventListener('change', () => {
      if (check.checked) selectedKeys.add(key); else selectedKeys.delete(key);
      syncBulkBar();
    });

    const wordSpan = document.createElement('span');
    wordSpan.className = 'ml-word-text';
    fillHighlighted(wordSpan, entry.word, filterQuery);

    const audioBtn = buildAudioButton(ve?.audioUrl);

    const posSpan = document.createElement('span');
    posSpan.className = 'ml-word-pos'; posSpan.textContent = posLabel;
    if (posLabel && ve?.pos) posSpan.dataset.pos = ve.pos; else posSpan.hidden = true;

    const transSpan = document.createElement('span');
    transSpan.className = 'ml-word-trans';
    if (ve?.translation) fillHighlighted(transSpan, ve.translation, filterQuery);

    const rankBadge = document.createElement('span');
    rankBadge.className = 'ml-word-rank';
    if (ve?.rank != null) rankBadge.textContent = '#' + ve.rank; else rankBadge.hidden = true;

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'ml-word-actions';

    const { masteryBtn, quizBadge } = buildMasteryControls(entry.language, entry.word, renderRows);

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button'; removeBtn.className = 'ml-remove-btn';
    removeBtn.title = 'Remove from this list'; removeBtn.textContent = '×';
    removeBtn.addEventListener('click', e => {
      e.stopPropagation();
      removeFromMultiList(listName, entry.word, entry.language);
      const idx = entries.findIndex(x => x.word === entry.word && x.language === entry.language);
      if (idx !== -1) entries.splice(idx, 1);
      refreshCountBadge(); ctx.renderSidebar(false); renderRows();
      showUndo(`Removed "${entry.word}"`, () => {
        entries.push(entry);
        addToMultiList(listName, entry.word, entry.language);
        refreshCountBadge(); ctx.renderSidebar(false); renderRows();
      });
    });

    const editBtn = buildEditInMyContentButton(entry.language, entry.word);

    actionsDiv.append(quizBadge, masteryBtn, editBtn, removeBtn);
    li.append(buildLangBadge([entry.language]), check, wordSpan);
    if (audioBtn) li.appendChild(audioBtn);
    li.append(posSpan, rankBadge, transSpan, actionsDiv);

    // ── Preview row (collapsed unless expanded) ──────────────────────────────
    const detail = (key === expandedKey && ve)
      ? buildWordDetail(ve, entry.language, getMultiAddedDate(listName, entry.language, entry.word))
      : document.createElement('div');
    detail.classList.add('ml-word-detail');
    li.appendChild(detail);

    li.addEventListener('click', e => {
      if ((e.target as HTMLElement).closest('button')) return;
      expandedKey = (expandedKey === key) ? null : key;
      renderRows();
    });

    return li;
  }

  renderRows();

  // Distinct languages this list actually holds — fetched once, cached
  // per-language by vocab-cache.ts for every other mode that already uses it.
  const distinctLangs = getMultiListLanguages(listName);
  Promise.all(distinctLangs.map(fetchVocab)).then(() => renderRows()).catch(logger.error);

  if (outsideClickHandler) document.removeEventListener('click', outsideClickHandler, true);
  outsideClickHandler = (e: MouseEvent) => {
    if (!(e.target as HTMLElement).closest('.ml-chip-dropdown')) closeAllChipDropdowns();
  };
  document.addEventListener('click', outsideClickHandler, true);
}
