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
  parseSelected,
  isInMultiList,
  LIST_FILTER_DESC,
  type ListFilterMode,
} from '../utils/word-lists.ts';
import { Settings } from '../settings.ts';
import { getCurrentMode } from '../ui/ui-state.ts';
import { isSwearWord } from '../data/swear-words.ts';
import { getCachedWords } from '../data/data-loader.ts';
import { evaluateSmart, getSmartLists } from '../modes/my-lists/smart-lists.ts';
import type { VocabEntry } from '../modes/my-lists/types.ts';
import {
  bindFilterHeader, syncFilterHeader, type FilterHeaderConfig,
} from './filter-header.ts';

/** Word -> VocabEntry, the shape evaluateSmart's rules were written against.
 *  Not a drop-in — band lives nested under `frequency` on Word but flat on
 *  VocabEntry, and ipa/audioUrl similarly move out of `linguistic`. */
function toVocabEntry(w: Word): VocabEntry {
  return {
    word: w.word, translation: w.translation, pos: w.pos,
    rank: w.rank ?? null, band: w.frequency?.band ?? null,
    glosses: w.glosses, examples: w.examples, domains: w.domains ?? [],
    ipa: w.linguistic?.ipa ?? null, audioUrl: w.audio_url ?? null,
    disambiguator: w.disambiguator ?? null,
    meaningDisambiguators: w.meaningDisambiguators ?? null,
    conjugations: w.linguistic?.conjugations ?? null,
  };
}

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
 *
 * Also applies the (independent, Settings-level) swear word filter — see
 * data/swear-words.ts. Unlike the list filter, that one isn't per-mode/
 * chainable state; it's a single on/off Settings toggle, so it always
 * applies here rather than being gated on `state.active`.
 */
export function filterWords(words: Word[]): Word[] {
  const lang  = (document.getElementById('langSelect') as HTMLSelectElement | null)?.value ?? 'spanish';
  const state = getListFilterState(lang);

  let out = words;

  // See class-filter.ts's getSelectedClasses() for why Simple Mode is
  // checked here rather than cleared once, at the moment it's toggled on.
  if (!Settings.getSimpleMode()
      && !Settings.getHideListsFilter(getCurrentMode()) && state.active && state.selected.length > 0) {
    // A selected entry may name a list in a language other than `lang` (a
    // "+ Languages" extra, merged into a Compare/multi-language table) or a
    // Cross-Language list — see refreshFilterSelect(). Single-language
    // membership is keyed by language *and* word (the same word can appear
    // in two languages' lists with no relation to each other); Cross-
    // Language membership is checked directly, since a multi-list entry
    // already carries its own language.
    const singleKeys = new Set<string>();   // `${language} ${word}`
    const multiNames: string[] = [];
    for (const entry of state.selected) {
      const parsed = parseSelected(entry, lang);
      if (parsed.kind === 'multi') { multiNames.push(parsed.name); continue; }
      if (parsed.kind === 'smart') {
        // A smart list is a rule, not a stored word array — evaluate it
        // against whatever vocab for its language is already loaded this
        // session. Nothing loaded means it contributes nothing rather than
        // triggering a fetch mid-filter (filterWords is synchronous).
        const rule = getSmartLists(parsed.lang)[parsed.name];
        const vocab = getCachedWords(parsed.lang);
        if (rule && vocab) {
          for (const w of evaluateSmart(parsed.lang, rule, vocab.map(toVocabEntry))) {
            singleKeys.add(parsed.lang + ' ' + w);
          }
        }
        continue;
      }
      for (const w of getList(parsed.lang, parsed.name)) singleKeys.add(parsed.lang + ' ' + w);
    }

    const inSelection = (w: Word): boolean => {
      const wordLang = w.language ?? lang;
      if (singleKeys.has(wordLang + ' ' + w.word)) return true;
      return multiNames.some(name => isInMultiList(name, w.word, wordLang));
    };

    out = state.mode === 'hide'
      ? out.filter(w => !inSelection(w))
      // focus: only words that appear in at least one selected list
      : out.filter(w => inSelection(w));
  }

  if (Settings.getSwearFilterEnabled()) {
    // Two signals, since neither covers everything on its own: the database
    // does carry `register: "vulgar"` on some entries (confirmed on Spanish
    // "mierda"), but that's the pipeline's own tagging and this app doesn't
    // control its coverage — so the static list in swear-words.ts still
    // catches whatever isn't (or never gets) tagged that way, and for
    // languages with no list yet, the register alone still does something.
    out = out.filter(w =>
      w.linguistic?.register !== 'vulgar' &&
      !isSwearWord(w.language ?? lang, w.word),
    );
  }

  return out;
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
