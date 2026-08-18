/**
 * word-filters.ts
 *
 * Exports filterWords() used by start-handler, and buildFilterUI() which
 * is called on language/size change to update the known-word count badge
 * and repopulate the list-filter panel.
 *
 * Note: the domain chip filter is handled by domain-filter.ts.
 */

import type { Word } from '../types.js';
import {
  getTotalListedCount,
  getList,
  getListFilterState,
  saveListFilterState,
  copyListFilterState,
  refreshFilterSelect,
  LIST_FILTER_DESC,
  type ListFilterMode,
} from '../utils/word-lists.ts';
import {
  bindFilterHeader, syncFilterHeader, type FilterHeaderConfig,
} from './filter-header.ts';

export interface FilterState {
  domains:      string[];
  bands:        string[];
  difficulties: number[];
  registers:    string[];
}

/** Called on language/size change — updates the count badge and list-filter panel. */
export function buildFilterUI(
  _allWords:    Word[],
  _baseList:    Word[] = _allWords,
  _containerId: string = 'wordFilters',
): void {
  const lang         = (document.getElementById('langSelect') as HTMLSelectElement | null)?.value ?? 'spanish';
  const knownCountEl = document.getElementById('knownWordCount');
  if (knownCountEl) knownCountEl.textContent = String(getTotalListedCount(lang));
  refreshFilterSelect(lang);
  // The filter is per mode now, so switching tabs or languages can change what
  // the header should say without anything else on it having been touched.
  syncListFilterUI(lang);
}

/** Always returns empty arrays — domain filtering is handled by domain-filter.ts. */
export function getFilterState(): FilterState {
  return { domains: [], bands: [], difficulties: [], registers: [] };
}

/**
 * Apply the multi-list Hide / Focus filter to a word list.
 *
 * Hide mode  — remove words that appear in ANY selected list.
 * Focus mode — keep ONLY words that appear in at least one selected list.
 * No lists selected — return the list unchanged.
 */
export function filterWords(words: Word[]): Word[] {
  const lang  = (document.getElementById('langSelect') as HTMLSelectElement | null)?.value ?? 'spanish';
  const state = getListFilterState(lang);

  if (!state.active || state.selected.length === 0) return words;

  // Build a union set of all words across the selected lists
  const wordSet = new Set<string>();
  for (const listName of state.selected) {
    for (const w of getList(lang, listName)) {
      wordSet.add(w);
    }
  }

  if (state.mode === 'hide') {
    return words.filter(w => !wordSet.has(w.word));
  } else {
    // focus: only words that appear in at least one selected list
    return words.filter(w => wordSet.has(w.word));
  }
}

function currentLang(fallback = 'spanish'): string {
  return (document.getElementById('langSelect') as HTMLSelectElement | null)?.value ?? fallback;
}

/** Config for the shared On/Off + chain header. */
const listHeader: FilterHeaderConfig = {
  id:          'list',
  activeBtnId: 'listFilterActive',
  chainBtnId:  'listFilterChain',
  noteId:      'listFilterChainNote',
  isActive:    () => getListFilterState(currentLang()).active,
  setActive:   on => {
    const lang  = currentLang();
    const state = getListFilterState(lang);
    state.active = on;
    saveListFilterState(lang, state);
  },
  copyState:   (from, to) => copyListFilterState(currentLang(), from, to),
  onChange:    () => {
    const lang = currentLang();
    refreshFilterSelect(lang);
    syncListFilterUI(lang);
  },
};

/**
 * Repaint the header from stored state.
 *
 * The header is the whole status display: whether the filter is on, which kind
 * it is, and — because it sits outside the collapsible body — it has to say all
 * of that while the filter is collapsed. Everything below reads from here so
 * there is one description of what the controls should look like.
 */
export function syncListFilterUI(lang: string): void {
  const state = getListFilterState(currentLang(lang));

  syncFilterHeader(listHeader);

  document.querySelectorAll<HTMLButtonElement>('#listFilterMode .list-filter-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === state.mode);
  });

  // Drives the checked-item colour via CSS. The dimming while inactive is
  // handled by syncFilterHeader, which puts filter-box--inactive on the wrap.
  const wrap = document.querySelector<HTMLElement>('.list-filter-wrap');
  if (wrap) wrap.dataset.mode = state.mode;

  const desc = document.getElementById('listFilterDesc');
  if (desc) {
    desc.textContent = state.active
      ? LIST_FILTER_DESC[state.mode]
      : 'Filter is off — your checked lists are remembered but not applied';
  }
}

/**
 * Bind the Active toggle, the Hide/Focus toggle and the chain button.
 * Call once on app init. Uses event delegation so it survives
 * refreshFilterSelect rebuilds.
 */
export function initListFilter(lang: string): void {
  bindFilterHeader(listHeader);

  document.getElementById('listFilterMode')?.addEventListener('click', e => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.list-filter-btn');
    if (!btn?.dataset.mode) return;

    const mode    = btn.dataset.mode as ListFilterMode;
    const curLang = currentLang(lang);
    const state   = getListFilterState(curLang);
    if (state.mode === mode && state.active) return;   // already there — no-op

    state.mode = mode;
    // Picking a kind of filtering is a clear statement that you want it on.
    state.active = true;
    saveListFilterState(curLang, state);
    syncListFilterUI(curLang);
  });

  syncListFilterUI(lang);
}
