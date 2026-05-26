/**
 * word-filters.ts
 *
 * Exports filterWords() used by start-handler, and buildFilterUI() which
 * is called on language/size change to update the known-word count badge.
 *
 * Note: the domain chip filter is handled by domain-filter.ts.
 * The difficulty/register filters are not yet surfaced in the UI.
 */

import type { Word } from '../types.js';
import { getKnownWords, getKnownCount } from '../utils/known-words.ts';

export interface FilterState {
  domains:      string[];
  bands:        string[];
  difficulties: number[];
  registers:    string[];
}

/** Called on language/size change — updates the known-word count badge. */
export function buildFilterUI(
  _allWords:    Word[],
  _baseList:    Word[] = _allWords,
  _containerId: string = 'wordFilters',
): void {
  const lang         = (document.getElementById('langSelect') as HTMLSelectElement | null)?.value ?? 'spanish';
  const knownCountEl = document.getElementById('knownWordCount');
  if (knownCountEl) knownCountEl.textContent = String(getKnownCount(lang));
}

/** Always returns empty arrays — domain filtering is handled by domain-filter.ts. */
export function getFilterState(): FilterState {
  return { domains: [], bands: [], difficulties: [], registers: [] };
}

export function filterWords(words: Word[]): Word[] {
  const hideKnown = (document.getElementById('filterHideKnown') as HTMLInputElement | null)?.checked ?? false;
  const lang      = (document.getElementById('langSelect') as HTMLSelectElement | null)?.value ?? 'spanish';
  const knownSet  = hideKnown ? getKnownWords(lang) : null;

  if (!knownSet) return words;
  return words.filter(w => !knownSet.has(w.word));
}
