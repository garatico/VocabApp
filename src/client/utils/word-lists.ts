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

import { readString, readJson, writeJson, remove as removeKey, isRecord, isStringArray, isNumberRecord }
  from './storage.ts';
import { currentScope, type FilterScope } from '../filters/filter-scope.ts';
import { bucketFor, bucketForRead, SHARED_BUCKET, type Bucket } from '../filters/filter-state.ts';
import { currentExtraLanguages } from '../filters/filter-lang.ts';
import { buildLangBadge } from '../ui/lang-badge.ts';
// smart-lists.ts imports getAllListedWords from this module — both directions
// only reach across the cycle from inside function bodies (never at module
// top-level), which ES modules resolve fine; nothing here runs at import time.
import { getSmartNames } from '../modes/my-lists/smart-lists.ts';

const LISTS_PREFIX         = 'vq_lists_';
const OLD_PREFIX           = 'vq_known_';
const DEFAULT_LIST         = 'Known';
const FILTER_STATE_PREFIX  = 'vq_listfilter_';
const MULTI_LISTS_KEY      = 'vq_lists_multi';
const ADDED_DATES_PREFIX   = 'vq_list_added_';

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

// Same added-date tracking as the per-language store below, one level
// deeper (listName -> language -> word) since a cross-language list's
// membership is a (word, language) pair, not a bare word.
type MultiAddedDates = Record<string, Record<string, Record<string, number>>>;
const MULTI_ADDED_DATES_KEY = 'vq_lists_multi_added';

function isMultiAddedDates(v: unknown): v is MultiAddedDates {
  return isRecord(v) && Object.values(v).every(
    byLang => isRecord(byLang) && Object.values(byLang).every(isNumberRecord),
  );
}

function loadMultiAddedDates(): MultiAddedDates {
  return readJson<MultiAddedDates>(MULTI_ADDED_DATES_KEY, {}, isMultiAddedDates);
}

function saveMultiAddedDates(dates: MultiAddedDates): void {
  writeJson(MULTI_ADDED_DATES_KEY, dates);
}

/** When (`word`, `language`) was added to `listName`, as epoch ms — null if never recorded. */
export function getMultiAddedDate(listName: string, language: string, word: string): number | null {
  return loadMultiAddedDates()[listName]?.[language]?.[word] ?? null;
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

    const dates = loadMultiAddedDates();
    if (!dates[listName]) dates[listName] = {};
    if (!dates[listName][language]) dates[listName][language] = {};
    dates[listName][language][word] = Date.now();
    saveMultiAddedDates(dates);
  }
}

export function removeFromMultiList(listName: string, word: string, language: string): void {
  const store = loadMultiStore();
  if (!store[listName]) return;
  store[listName] = store[listName].filter(e => !(e.word === word && e.language === language));
  if (store[listName].length === 0) delete store[listName];
  saveMultiStore(store);

  const dates = loadMultiAddedDates();
  if (dates[listName]?.[language]) {
    delete dates[listName][language][word];
    if (Object.keys(dates[listName][language]).length === 0) delete dates[listName][language];
    if (Object.keys(dates[listName]).length === 0) delete dates[listName];
    saveMultiAddedDates(dates);
  }
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

  const dates = loadMultiAddedDates();
  if (dates[listName]) { delete dates[listName]; saveMultiAddedDates(dates); }
}

export function renameMultiList(oldName: string, newName: string): boolean {
  const store = loadMultiStore();
  if (!store[oldName] || store[newName]) return false;
  store[newName] = store[oldName];

  const dates = loadMultiAddedDates();
  if (dates[oldName]) {
    dates[newName] = dates[oldName];
    delete dates[oldName];
    saveMultiAddedDates(dates);
  }
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

// ── Qualified entries: a `selected` name may belong to a language other than
//    the state's own bucket, or to no language at all (a cross-language
//    list) — see the Lists filter picking up "+ Languages" extras and
//    Cross-Language Lists, below. A bare entry (no separator — every entry
//    written before this existed) still means "this bucket's own language's
//    list, by that plain name", so nothing already stored needs migrating. ──

/** Not a character anyone types into a list name through this app's UI. */
const QUAL_SEP = '␟';

export function qualifyListName(lang: string, name: string): string {
  return `${lang}${QUAL_SEP}${name}`;
}
export function qualifyMultiListName(name: string): string {
  return `multi${QUAL_SEP}${name}`;
}
/** Smart lists carry a language too (a rule is evaluated per language), so
 *  the qualifier has three parts — the 'smart' sentinel, then lang, then
 *  name — one more split than 'multi' needs. */
export function qualifySmartListName(lang: string, name: string): string {
  return `smart${QUAL_SEP}${lang}${QUAL_SEP}${name}`;
}

export type QualifiedSelection =
  | { kind: 'single'; lang: string; name: string }
  | { kind: 'multi'; name: string }
  | { kind: 'smart'; lang: string; name: string };

/** `defaultLang` is what a legacy, unqualified entry is assumed to mean. */
export function parseSelected(entry: string, defaultLang: string): QualifiedSelection {
  const i = entry.indexOf(QUAL_SEP);
  if (i === -1) return { kind: 'single', lang: defaultLang, name: entry };
  const first = entry.slice(0, i);
  const rest  = entry.slice(i + 1);
  if (first === 'multi') return { kind: 'multi', name: rest };
  if (first === 'smart') {
    const j = rest.indexOf(QUAL_SEP);
    // Malformed (no second separator) — treat as an ordinary single entry
    // rather than throwing, same "unrecognized shape falls back to a safe
    // default" spirit as the rest of this module's storage reads.
    if (j === -1) return { kind: 'single', lang: defaultLang, name: entry };
    return { kind: 'smart', lang: rest.slice(0, j), name: rest.slice(j + 1) };
  }
  return { kind: 'single', lang: first, name: rest };
}

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

/**
 * Every `selected` entry in its canonical qualified form.
 *
 * A bare, unqualified entry (predates qualifyListName existing, or written by
 * a bug that skipped it — see profile-panel.ts's history) is semantically
 * "this bucket's own language's list by that plain name", per parseSelected's
 * own fallback. But the checkbox UI (refreshFilterSelect) and its add/remove
 * handlers compare against the *qualified* string only, so an unqualified
 * entry that slips in can never render as checked and can never be
 * unchecked — it sits there permanently, invisibly still narrowing/hiding
 * words, while the box looks empty. Normalizing on every read means a
 * legacy entry becomes indistinguishable from one the checkbox UI wrote
 * itself, the moment it's next loaded — no separate migration needed.
 */
function normalizeSelected(selected: string[], lang: string): string[] {
  return selected.map(entry => {
    const parsed = parseSelected(entry, lang);
    if (parsed.kind === 'multi') return qualifyMultiListName(parsed.name);
    if (parsed.kind === 'smart') return qualifySmartListName(parsed.lang, parsed.name);
    return qualifyListName(parsed.lang, parsed.name);
  });
}

function readBucket(lang: string, bucket: Bucket): ListFilterState {
  const parsed = readJson<ListFilterState | null>(filterKey(lang, bucket), null, isRecord);
  if (parsed && LIST_FILTER_MODES.includes(parsed.mode) && Array.isArray(parsed.selected)) {
    // active was added after the key existed, so absent means the old
    // behaviour: a stored hide/focus was always doing something.
    return { ...parsed, active: parsed.active !== false, selected: normalizeSelected(parsed.selected, lang) };
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

// ── Added-date tracking ──────────────────────────────────────────────────────
//
// A separate, additive key per language — same reasoning as mastery.ts's own
// level-scale key: every existing reader of the list store above (getList,
// isInList, rename/copy/delete) keeps working on plain word arrays,
// untouched, while this tracks *when* each (list, word) pair was added, for
// My Lists' own word-detail panel to show. A word added before this shipped
// simply has no entry — getAddedDate returns null rather than a made-up date.

type AddedDates = Record<string, Record<string, number>>; // listName -> word -> epoch ms

function addedDatesKey(lang: string): string {
  return ADDED_DATES_PREFIX + lang.toLowerCase();
}

function isAddedDates(v: unknown): v is AddedDates {
  return isRecord(v) && Object.values(v).every(isNumberRecord);
}

function loadAddedDates(lang: string): AddedDates {
  return readJson<AddedDates>(addedDatesKey(lang), {}, isAddedDates);
}

function saveAddedDates(lang: string, dates: AddedDates): void {
  writeJson(addedDatesKey(lang), dates);
}

/** When `word` was added to `listName`, as epoch ms — null if never recorded. */
export function getAddedDate(lang: string, listName: string, word: string): number | null {
  return loadAddedDates(lang)[listName]?.[word] ?? null;
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

    const dates = loadAddedDates(lang);
    if (!dates[listName]) dates[listName] = {};
    dates[listName][word] = Date.now();
    saveAddedDates(lang, dates);
  }
}

export function removeFromList(lang: string, listName: string, word: string): void {
  const store = loadStore(lang);
  if (!store[listName]) return;
  store[listName] = store[listName].filter(w => w !== word);
  if (store[listName].length === 0) delete store[listName];
  saveStore(lang, store);
  refreshCountBadge(lang);

  const dates = loadAddedDates(lang);
  if (dates[listName]) {
    delete dates[listName][word];
    if (Object.keys(dates[listName]).length === 0) delete dates[listName];
    saveAddedDates(lang, dates);
  }
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

  const dates = loadAddedDates(lang);
  if (dates[listName]) { delete dates[listName]; saveAddedDates(lang, dates); }
}

export function renameList(lang: string, oldName: string, newName: string): boolean {
  const store = loadStore(lang);
  if (!store[oldName] || store[newName]) return false;
  store[newName] = store[oldName];
  delete store[oldName];
  saveStore(lang, store);

  const dates = loadAddedDates(lang);
  if (dates[oldName]) {
    dates[newName] = dates[oldName];
    delete dates[oldName];
    saveAddedDates(lang, dates);
  }
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

/** One row a Lists filter (the live filter box, or a Testing Profile's own
 *  editor) can offer to check. `count: null` means "dynamic" — a smart
 *  list's size depends on live vocab, so it isn't computed just to list the
 *  list; see smart-lists.ts's evaluateSmart(). */
export interface FilterableListRow {
  qualified:   string;
  displayName: string;
  badgeLangs:  string[];
  count:       number | null;
  group:       'single' | 'multi' | 'smart';
}

/**
 * Every list a Lists filter can offer for `lang` (plus any "+ Languages"
 * extras) to check: that language's own plain lists, every Cross-Language
 * list regardless of language, and that language's smart lists. One place
 * for this enumeration so the live filter box (refreshFilterSelect, below)
 * and a Testing Profile's own list section (profile-panel.ts) can't drift —
 * profile-panel.ts used to only call getListNames() directly and so never
 * offered Cross-Language or smart lists at all.
 */
export function enumerateFilterableLists(lang: string, extraLangs: string[] = []): FilterableListRow[] {
  const activeLangs = [lang, ...extraLangs.filter(l => l !== lang)];
  const rows: FilterableListRow[] = [];

  activeLangs.forEach(l => {
    for (const name of getListNames(l)) {
      rows.push({
        qualified: qualifyListName(l, name), displayName: name,
        badgeLangs: [l], count: getListCount(l, name), group: 'single',
      });
    }
  });

  for (const name of getMultiListNames()) {
    rows.push({
      qualified: qualifyMultiListName(name), displayName: name,
      badgeLangs: getMultiListLanguages(name), count: getMultiListCount(name), group: 'multi',
    });
  }

  activeLangs.forEach(l => {
    for (const name of getSmartNames(l)) {
      rows.push({
        qualified: qualifySmartListName(l, name), displayName: name,
        badgeLangs: [l], count: null, group: 'smart',
      });
    }
  });

  return rows;
}

/**
 * The Lists filter used to only ever show `lang`'s own lists — right for a
 * single-language session, wrong the moment "+ Languages" merges another
 * language's words in (Table/Conjugation's Compare mode): a Portuguese word
 * sitting right next to a Spanish one had no way to be hidden or focused by
 * its own lists, and a Cross-Language list couldn't be used as a filter at
 * all. `currentExtraLanguages()` (filter-lang.ts) is empty outside those two
 * modes, so a plain single-language session sees exactly what it always did.
 */
export function refreshFilterSelect(lang: string): void {
  const containerEl = document.getElementById('listFilterCheckboxes');
  if (!containerEl) return;
  const container = containerEl;   // narrowed, so addRow() below can close over it

  const extras = currentExtraLanguages().filter(l => l !== lang);
  const rows = enumerateFilterableLists(lang, extras);
  const multiNames = getMultiListNames();

  // Load persisted state and prune any selections for lists that no longer
  // exist — a single-language (or smart-list) entry whose language isn't
  // active right now (e.g. "+ Languages" was cleared) is checked against
  // that language's own storage directly, not against `rows` (which is
  // scoped to the currently-active languages), so it's left alone rather
  // than dropped — re-adding that language brings the selection straight
  // back rather than losing it.
  const state = getListFilterState(lang);
  const pruned = state.selected.filter(entry => {
    const parsed = parseSelected(entry, lang);
    if (parsed.kind === 'multi') return multiNames.includes(parsed.name);
    if (parsed.kind === 'smart') return getSmartNames(parsed.lang).includes(parsed.name);
    return getListNames(parsed.lang).includes(parsed.name);
  });
  if (pruned.length !== state.selected.length) {
    state.selected = pruned;
    saveListFilterState(lang, state);
  }

  // Rebuild checkbox list
  container.innerHTML = '';
  const selectedSet = new Set(state.selected);

  function addRow(row: FilterableListRow): void {
    const label = document.createElement('label');
    label.className = 'list-filter-item';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = row.qualified;
    cb.checked = selectedSet.has(row.qualified);
    cb.addEventListener('change', () => {
      const s = getListFilterState(lang);
      if (cb.checked) {
        if (!s.selected.includes(row.qualified)) s.selected.push(row.qualified);
      } else {
        s.selected = s.selected.filter(n => n !== row.qualified);
      }
      saveListFilterState(lang, s);
    });

    const nameSpan = document.createElement('span');
    nameSpan.className = 'list-filter-name';
    nameSpan.textContent = row.displayName;

    const countSpan = document.createElement('span');
    countSpan.className = 'list-filter-item-count';
    // A smart list's size depends on live vocab and isn't computed here —
    // see enumerateFilterableLists's doc comment.
    countSpan.textContent = row.count === null ? '≈' : String(row.count);
    if (row.count === null) countSpan.title = 'Dynamic — re-evaluated when the quiz runs';

    label.append(cb, nameSpan, buildLangBadge(row.badgeLangs), countSpan);
    container.appendChild(label);
  }

  if (rows.length === 0) {
    const empty       = document.createElement('span');
    empty.className   = 'list-filter-empty';
    empty.textContent = 'No lists yet — create one in My Lists';
    container.appendChild(empty);
  } else {
    // Single-language lists flow together as one group, whatever language
    // each belongs to — every pill already carries its own flag badge, so a
    // full-width header row repeating just that flag for each language (as
    // this used to do) said nothing the pill itself didn't, at the cost of a
    // blank-looking row per language. Cross-Language and Smart Lists each
    // get their own header since those behave differently from a plain list.
    rows.filter(r => r.group === 'single').forEach(addRow);

    const multiRows = rows.filter(r => r.group === 'multi');
    if (multiRows.length > 0) {
      const groupLabel = document.createElement('span');
      groupLabel.className = 'list-filter-group-label list-filter-group-label--multi';
      groupLabel.textContent = 'Cross-Language';
      container.appendChild(groupLabel);
      multiRows.forEach(addRow);
    }

    const smartRows = rows.filter(r => r.group === 'smart');
    if (smartRows.length > 0) {
      const groupLabel = document.createElement('span');
      groupLabel.className = 'list-filter-group-label list-filter-group-label--smart';
      groupLabel.textContent = 'Smart Lists';
      container.appendChild(groupLabel);
      smartRows.forEach(addRow);
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
