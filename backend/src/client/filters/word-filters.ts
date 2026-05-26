/**
 * word-filters.ts
 *
 * Exports filterWords() used by start-handler, and buildFilterUI() which
 * is called on language/size change to update the known-word count badge
 * and repopulate the list-select dropdown.
 *
 * Note: the domain chip filter is handled by domain-filter.ts.
 */

import type { Word } from '../types.js';
import {
  getTotalListedCount,
  getList,
  refreshFilterSelect,
} from '../utils/word-lists.ts';

export interface FilterState {
  domains:      string[];
  bands:        string[];
  difficulties: number[];
  registers:    string[];
}

/** Called on language/size change — updates the known-word count badge and list dropdown. */
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

export function filterWords(words: Word[]): Word[] {
  const sel  = document.getElementById('filterListSelect') as HTMLSelectElement | null;
  const lang = (document.getElementById('langSelect') as HTMLSelectElement | null)?.value ?? 'spanish';

  const listName = sel?.value ?? '';
  if (!listName) return words;

  const listed = new Set(getList(lang, listName));
  return words.filter(w => !listed.has(w.word));
}
