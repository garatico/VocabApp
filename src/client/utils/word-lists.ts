/**
 * word-lists.ts
 *
 * Multi-list known-word tracking, per language.
 * Storage: localStorage key `vq_lists_<lang>` => JSON object { [listName]: string[] }
 *
 * The lists themselves are per language. The *filter* over them is per language
 * and per mode (`vq_listfilter_<lang>__<scope>`), so Table can drill the list
 * that Recall is hiding. See filters/filter-scope.ts.
 *
 * Migrates old `vq_known_<lang>` (single Set) to a list named "Known", and the
 * old single per-language filter to one setting per mode.
 */

import { readString, readJson, writeJson, remove as removeKey, isRecord, isStringArray }
  from './storage.ts';
import { currentScope, type FilterScope } from '../filters/filter-scope.ts';
import { bucketFor, bucketForRead, SHARED_BUCKET, type Bucket } from '../filters/filter-state.ts';
import { buildLangBadge } from '../ui/lang-badge.ts';

const LISTS_PREFIX         = 'vq_lists_';
const OLD_PREFIX           = 'vq_known_';
const DEFAULT_LIST         = 'Known';
const FILTER_STATE_PREFIX  = 'vq_listfilter_';
const MULTI_LISTS_KEY      = 'vq_lists_multi';

type ListStore = Record<string, string[]>;

// ── Cross-language lists ────────────────────────────────────────────────────
//
// A separate, global (not per-language) store, additive alongside the
// per-language one above — no existing call site or storage shape changes.
// A list holds `{word, language}` pairs rather than bare word strings, since
// membership must survive two languages sharing a spelling (the same
// collision this app already handles via table-mode.ts's rowKey()).

export interface MultiListEntry {
  word:     string;
  language: string;
}

type MultiListStore = Record<string, MultiListEntry[]>;

function isMultiListEntry(v: unknown): v is MultiListEntry {
  return isRecord(v) && typeof v['word'] === 'string' && typeof v['language'] === 'string';
}

function isMultiListStore(v: unknown): v is MultiListStore {
  return isRecord(v) && Object.values(v).every(
    entries => Array.isArray(entries) && entries.every(isMultiListEntry),
  );
}

function loadMultiStore(): MultiListStore {
  return readJson<MultiListStore>(MULTI_LISTS_KEY, {}, isMultiListStore);
}

function saveMultiStore(store: MultiListStore): void {
  writeJson(MULTI_LISTS_KEY, store);
}

export function getMultiListNames(): string[] {
  return Object.keys(loadMultiStore());
}

export function getMultiList(listName: string): MultiListEntry[] {
  const store = loadMultiStore();
  return store[listName] ? [...store[listName]] : [];
}

/** Distinct languages present — empty for a new list with no words yet. */
export function getMultiListLanguages(listName: string): string[] {
  return [...new Set(getMultiList(listName).map(e => e.language))];
}

export function isInMultiList(listName: string, word: string, language: string): boolean {
  const store = loadMultiStore();
  return !!store[listName]?.some(e => e.word === word && e.language === language);
}

export function addToMultiList(listName: string, word: string, language: string): void {
  const store = loadMultiStore();
  if (!store[listName]) store[listName] = [];
  if (!store[listName].some(e => e.word === word && e.language === language)) {
    store[listName].push({ word, language });
    saveMultiStore(store);
  }
}

export function removeFromMultiList(listName: string, word: string, language: string): void {
  const store = loadMultiStore();
  if (!store[listName]) return;
  store[listName] = store[listName].filter(e => !(e.word === word && e.language === language));
  if (store[listName].length === 0) delete store[listName];
  saveMultiStore(store);
}

export function createMultiList(listName: string): boolean {
  const store = loadMultiStore();
  if (store[listName]) return false;
  store[listName] = [];
  saveMultiStore(store);
  return true;
}

export function deleteMultiList(listName: string): void {
  const store = loadMultiStore();
  delete store[listName];
  saveMultiStore(store);
}

export function renameMultiList(oldName: string, newName: string): boolean {
  const store = loadMultiStore();
  if (!store[oldName] || store[newName]) return false;
  store[newName] = store[oldName];
  delete store[oldName];
  saveMultiStore(store);
  return true;
}

export function getMultiListCount(listName: string): number {
  return loadMultiStore()[listName]?.length ?? 0;
}

/**
 * What the checked lists do to the quiz.
 *
 * 'off' used to be a third value here, meaning "keep my selections but stop
 * filtering". That is the same question as whether the filter is switched on,
 * which every other filter now answers with its own Active toggle — so it is
 * `active: false` instead, and Hide/Focus is only ever the *kind* of filtering.
 */
export type ListFilterMode = 'hide' | 'focus';

export interface ListFilterState {
  /** False keeps the selections and stops them filtering. */
  active:   boolean;
  mode:     ListFilterMode;
  selected: string[];
}

const LIST_FILTER_MODES: ListFilterMode[] = ['hide', 'focus'];

export const LIST_FILTER_DESC: Record<ListFilterMode, string> = {
  hide:  'Checked lists are removed from the quiz',
  focus: 'Quiz shows only words from checked lists',
};

function filterKey(lang: string, bucket: Bucket): string {
  return `${FILTER_STATE_PREFIX}${lang.toLowerCase()}__${bucket}`;
}

/** The pre-bucket key, read once by migrateListFilter(). */
function legacyFilterKey(lang: string): string {
  return FILTER_STATE_PREFIX + lang.toLowerCase();
}

const migratedFilterLangs = new Set<string>();

/**
 * Move the old single per-language setting into the shared bucket.
 *
 * Every mode was on one filter before, and every mode starts chained, so the
 * shared bucket *is* what they all had — nothing changes until a mode is
 * unlinked. Runs once per language per page load and removes the legacy key as
 * it goes, so it cannot re-run over a bucket that has since been edited.
 */
function migrateListFilter(lang: string): void {
  if (migratedFilterLangs.has(lang)) return;
  migratedFilterLangs.add(lang);

  const old = readJson<{ mode?: string; selected?: string[] } | null>(
    legacyFilterKey(lang), null, isRecord);
  if (old) {
    const selected = Array.isArray(old.selected) ? old.selected : [];
    // 'off' meant "stop filtering but keep my lists checked", which is exactly
    // inactive. The kind of filtering it would do when switched back on is
    // unknowable from the old value, so it gets the default.
    const state: ListFilterState = old.mode === 'off'
      ? { active: false, mode: 'hide', selected }
      : {
          active: true,
          mode: LIST_FILTER_MODES.includes(old.mode as ListFilterMode)
            ? old.mode as ListFilterMode
            : 'hide',
          selected,
        };
    // A corrupt legacy value reads as absent rather than failing the page.
    if (readString(filterKey(lang, SHARED_BUCKET)) === null) {
      writeJson(filterKey(lang, SHARED_BUCKET), state);
    }
  }

  removeKey(legacyFilterKey(lang));
}

function readBucket(lang: string, bucket: Bucket): ListFilterState {
  const parsed = readJson<ListFilterState | null>(filterKey(lang, bucket), null, isRecord);
  if (parsed && LIST_FILTER_MODES.includes(parsed.mode) && Array.isArray(parsed.selected)) {
    // active was added after the key existed, so absent means the old
    // behaviour: a stored hide/focus was always doing something.
    return { ...parsed, active: parsed.active !== false };
  }
  return { active: true, mode: 'hide', selected: [] };
}

/** @param scope defaults to the mode currently on screen. */
export function getListFilterState(
  lang: string, scope: FilterScope = currentScope(),
): ListFilterState {
  migrateListFilter(lang);
  return readBucket(lang, bucketForRead('list',
    b => readString(filterKey(lang, b)) !== null, scope));
}

export function saveListFilterState(
  lang: string, state: ListFilterState, scope: FilterScope = currentScope(),
): void {
  writeJson(filterKey(lang, bucketFor('list', scope)), state);
}

/** Move the list filter between buckets — the chain button. See filter-state. */
export function copyListFilterState(lang: string, from: Bucket, to: Bucket): void {
  const state = readBucket(lang, from);
  writeJson(filterKey(lang, to), { ...state, selected: [...state.selected] });
}

function storageKey(lang: string): string {
  return LISTS_PREFIX + lang.toLowerCase();
}

function loadStore(lang: string): ListStore {
  maybeRunMigration(lang);
  return readJson<ListStore>(storageKey(lang), {}, isRecord);
}

function saveStore(lang: string, store: ListStore): void {
  writeJson(storageKey(lang), store);
}

function maybeRunMigration(lang: string): void {
  const newKey = storageKey(lang);
  if (readString(newKey) !== null) return;

  const oldKey   = OLD_PREFIX + lang.toLowerCase();
  const oldWords = readJson<string[]>(oldKey, [], isStringArray);
  if (readString(oldKey) === null) return;

  if (oldWords.length > 0) {
    writeJson(newKey, { [DEFAULT_LIST]: oldWords } satisfies ListStore);
  }
  removeKey(oldKey);
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

      // Every list here is single-language by construction (this store is
      // keyed per language) — the badge is still worth showing for the same
      // reason table mode shows one on every cell: consistent visual
      // language identity everywhere a list/word appears in the app.
      label.appendChild(cb);
      label.appendChild(nameSpan);
      label.appendChild(buildLangBadge([lang]));
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

// The old "known words" concept was a shim over a default list and had no
// remaining callers; mastery in my-lists-mode.ts is the single progress model
// now. Removed rather than left to rot as a second, disagreeing source.
