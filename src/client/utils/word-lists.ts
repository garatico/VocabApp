/**
 * word-lists.ts
 *
 * Multi-list known-word tracking, per language.
 * Storage: localStorage key `vq_lists_<lang>` => JSON object { [listName]: string[] }
 *
 * Migrates old `vq_known_<lang>` (single Set) to a list named "Known".
 */

const LISTS_PREFIX         = 'vq_lists_';
const OLD_PREFIX           = 'vq_known_';
const DEFAULT_LIST         = 'Known';
const FILTER_STATE_PREFIX  = 'vq_listfilter_';

type ListStore = Record<string, string[]>;

/** 'off' keeps your list selections but stops them filtering the quiz. */
export type ListFilterMode = 'off' | 'hide' | 'focus';

export interface ListFilterState {
  mode:     ListFilterMode;
  selected: string[];
}

const LIST_FILTER_MODES: ListFilterMode[] = ['off', 'hide', 'focus'];

export const LIST_FILTER_DESC: Record<ListFilterMode, string> = {
  off:   'Lists are ignored — every word is in play',
  hide:  'Checked lists are removed from the quiz',
  focus: 'Quiz shows only words from checked lists',
};

export function getListFilterState(lang: string): ListFilterState {
  try {
    const raw = localStorage.getItem(FILTER_STATE_PREFIX + lang.toLowerCase());
    if (raw) {
      const parsed = JSON.parse(raw) as ListFilterState;
      if (LIST_FILTER_MODES.includes(parsed.mode) && Array.isArray(parsed.selected)) {
        return parsed;
      }
    }
  } catch { /* ignore */ }
  return { mode: 'hide', selected: [] };
}

export function saveListFilterState(lang: string, state: ListFilterState): void {
  try {
    localStorage.setItem(FILTER_STATE_PREFIX + lang.toLowerCase(), JSON.stringify(state));
  } catch { /* ignore */ }
}

function storageKey(lang: string): string {
  return LISTS_PREFIX + lang.toLowerCase();
}

function loadStore(lang: string): ListStore {
  maybeRunMigration(lang);
  try {
    const raw = localStorage.getItem(storageKey(lang));
    if (!raw) return {};
    return JSON.parse(raw) as ListStore;
  } catch {
    return {};
  }
}

function saveStore(lang: string, store: ListStore): void {
  try {
    localStorage.setItem(storageKey(lang), JSON.stringify(store));
  } catch {}
}

function maybeRunMigration(lang: string): void {
  const newKey = storageKey(lang);
  if (localStorage.getItem(newKey) !== null) return;

  const oldKey = OLD_PREFIX + lang.toLowerCase();
  const oldRaw = localStorage.getItem(oldKey);
  if (!oldRaw) return;

  try {
    const oldWords: string[] = JSON.parse(oldRaw);
    if (oldWords.length > 0) {
      const store: ListStore = { [DEFAULT_LIST]: oldWords };
      localStorage.setItem(newKey, JSON.stringify(store));
    }
    localStorage.removeItem(oldKey);
  } catch {}
}

export function getListNames(lang: string): string[] {
  const store = loadStore(lang);
  return Object.keys(store);
}

export function getList(lang: string, listName: string): string[] {
  const store = loadStore(lang);
  return store[listName] ? [...store[listName]] : [];
}

export function getAllListedWords(lang: string): Set<string> {
  const store = loadStore(lang);
  const all   = new Set<string>();
  for (const words of Object.values(store)) {
    for (const w of words) all.add(w);
  }
  return all;
}

export function getWordLists(lang: string, word: string): string[] {
  const store = loadStore(lang);
  return Object.entries(store)
    .filter(([, words]) => words.includes(word))
    .map(([name]) => name);
}

export function isInList(lang: string, listName: string, word: string): boolean {
  const store = loadStore(lang);
  return !!(store[listName]?.includes(word));
}

export function isInAnyList(lang: string, word: string): boolean {
  return getWordLists(lang, word).length > 0;
}

export function addToList(lang: string, listName: string, word: string): void {
  const store = loadStore(lang);
  if (!store[listName]) store[listName] = [];
  if (!store[listName].includes(word)) {
    store[listName].push(word);
    saveStore(lang, store);
    refreshCountBadge(lang);
  }
}

export function removeFromList(lang: string, listName: string, word: string): void {
  const store = loadStore(lang);
  if (!store[listName]) return;
  store[listName] = store[listName].filter(w => w !== word);
  if (store[listName].length === 0) delete store[listName];
  saveStore(lang, store);
  refreshCountBadge(lang);
}

export function createList(lang: string, listName: string): boolean {
  const store = loadStore(lang);
  if (store[listName]) return false;
  store[listName] = [];
  saveStore(lang, store);
  return true;
}

export function deleteList(lang: string, listName: string): void {
  const store = loadStore(lang);
  delete store[listName];
  saveStore(lang, store);
  refreshCountBadge(lang);
}

export function renameList(lang: string, oldName: string, newName: string): boolean {
  const store = loadStore(lang);
  if (!store[oldName] || store[newName]) return false;
  store[newName] = store[oldName];
  delete store[oldName];
  saveStore(lang, store);
  return true;
}

export function getTotalListedCount(lang: string): number {
  return getAllListedWords(lang).size;
}

export function getListCount(lang: string, listName: string): number {
  const store = loadStore(lang);
  return store[listName]?.length ?? 0;
}

export function refreshCountBadge(lang: string): void {
  const el = document.getElementById('knownWordCount');
  if (el) el.textContent = String(getTotalListedCount(lang));
  refreshFilterSelect(lang);
}

export function refreshFilterSelect(lang: string): void {
  const container = document.getElementById('listFilterCheckboxes');
  if (!container) return;

  const names = getListNames(lang);

  // Load persisted state and prune any selections for lists that no longer exist
  const state    = getListFilterState(lang);
  const validSet = new Set(names);
  const pruned   = state.selected.filter(n => validSet.has(n));
  if (pruned.length !== state.selected.length) {
    state.selected = pruned;
    saveListFilterState(lang, state);
  }

  // Rebuild checkbox list
  container.innerHTML = '';

  if (names.length === 0) {
    const empty       = document.createElement('span');
    empty.className   = 'list-filter-empty';
    empty.textContent = 'No lists yet — create one in My Lists';
    container.appendChild(empty);
  } else {
    for (const name of names) {
      const label       = document.createElement('label');
      label.className   = 'list-filter-item';

      const cb          = document.createElement('input');
      cb.type           = 'checkbox';
      cb.value          = name;
      cb.checked        = state.selected.includes(name);
      cb.addEventListener('change', () => {
        const s = getListFilterState(lang);
        if (cb.checked) {
          if (!s.selected.includes(name)) s.selected.push(name);
        } else {
          s.selected = s.selected.filter(n => n !== name);
        }
        saveListFilterState(lang, s);
      });

      const nameSpan       = document.createElement('span');
      nameSpan.className   = 'list-filter-name';
      nameSpan.textContent = name;

      const countSpan       = document.createElement('span');
      countSpan.className   = 'list-filter-item-count';
      countSpan.textContent = String(getListCount(lang, name));

      label.appendChild(cb);
      label.appendChild(nameSpan);
      label.appendChild(countSpan);
      container.appendChild(label);
    }
  }

  // Sync mode toggle button active state
  const modeWrap = document.getElementById('listFilterMode');
  if (modeWrap) {
    modeWrap.querySelectorAll<HTMLButtonElement>('.list-filter-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === state.mode);
    });
  }

  // Stamp data-mode on the wrapper so CSS can key checked-item colours off it
  const wrap = container.closest<HTMLElement>('.list-filter-wrap');
  if (wrap) wrap.dataset.mode = state.mode;

  // Description line — explains what the active mode does in plain language
  const desc = document.getElementById('listFilterDesc');
  if (desc) {
    desc.textContent = LIST_FILTER_DESC[state.mode];
  }

  // Update total-count badge
  const countEl = document.getElementById('knownWordCount');
  if (countEl) countEl.textContent = String(getTotalListedCount(lang));
}

// Backwards-compat shims
export function markKnown(lang: string, word: string): void {
  addToList(lang, DEFAULT_LIST, word);
}

export function unmarkKnown(lang: string, word: string): void {
  removeFromList(lang, DEFAULT_LIST, word);
}

export function isKnown(lang: string, word: string): boolean {
  return isInList(lang, DEFAULT_LIST, word);
}

export function getKnownCount(lang: string): number {
  return getTotalListedCount(lang);
}

export function getKnownWords(lang: string): Set<string> {
  return getAllListedWords(lang);
}
