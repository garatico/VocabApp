/**
 * word-lists.ts
 *
 * Multi-list known-word tracking, per language.
 * Storage: localStorage key `vq_lists_<lang>` => JSON object { [listName]: string[] }
 *
 * Migrates old `vq_known_<lang>` (single Set) to a list named "Known".
 */

const LISTS_PREFIX = 'vq_lists_';
const OLD_PREFIX   = 'vq_known_';
const DEFAULT_LIST = 'Known';

type ListStore = Record<string, string[]>;

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
  const sel = document.getElementById('filterListSelect') as HTMLSelectElement | null;
  if (!sel) return;

  const current = sel.value;
  sel.innerHTML = '';

  const noneOpt       = document.createElement('option');
  noneOpt.value       = '';
  noneOpt.textContent = 'Show all words';
  sel.appendChild(noneOpt);

  for (const name of getListNames(lang)) {
    const opt       = document.createElement('option');
    opt.value       = name;
    const count     = getListCount(lang, name);
    opt.textContent = 'Hide "' + name + '" (' + count + ')';
    sel.appendChild(opt);
  }

  if (current && [...sel.options].some(o => o.value === current)) {
    sel.value = current;
  }
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
