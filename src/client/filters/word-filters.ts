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
  refreshFilterSelect,
} from '../utils/word-lists.ts';

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

  if (state.selected.length === 0) return words;

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

/**
 * Bind the Hide / Focus mode toggle.
 * Call once on app init. Uses event delegation so it survives refreshFilterSelect rebuilds.
 */
export function initListFilter(lang: string): void {
  const modeWrap = document.getElementById('listFilterMode');
  if (!modeWrap) return;

  modeWrap.addEventListener('click', e => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.list-filter-btn');
    if (!btn?.dataset.mode) return;

    const mode    = btn.dataset.mode as 'hide' | 'focus';
    const curLang = (document.getElementById('langSelect') as HTMLSelectElement | null)?.value ?? lang;
    const state   = getListFilterState(curLang);
    if (state.mode === mode) return;          // already active — no-op

    state.mode = mode;
    saveListFilterState(curLang, state);

    // Update button active classes
    modeWrap.querySelectorAll<HTMLButtonElement>('.list-filter-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.mode === mode);
    });

    // Update data-mode on the wrapper (drives checked-item colour via CSS)
    const wrap = modeWrap.closest<HTMLElement>('.list-filter-wrap');
    if (wrap) wrap.dataset.mode = mode;

    // Update description text immediately
    const desc = document.getElementById('listFilterDesc');
    if (desc) {
      desc.textContent = mode === 'hide'
        ? 'Checked lists are removed from the quiz'
        : 'Quiz shows only words from checked lists';
    }
  });
}
