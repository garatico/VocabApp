/**
 * my-lists-mode.ts — My Lists tab panel.
 *
 * Features:
 *  - Add words via accent-insensitive search (word + translation)
 *  - Keyboard nav in search (↑↓ navigate, Enter add, Escape close)
 *  - Add-all button on search results
 *  - Sort (A-Z, Z-A, easiest, hardest) and POS chip filter
 *  - POS badge + translation on every word row
 *  - Word preview on click (glosses, example, IPA)
 *  - POS/difficulty stats line in header
 *  - Export list as .txt
 *  - Move word to another list
 *  - Copy word to another list
 *  - Duplicate list
 */

import type { Word as ApiWord } from '../types.ts';
import { loadVocab } from '../data/vocab-source.ts';
import {
  getListNames, getList, addToList, createList,
  deleteList, renameList, removeFromList, getAllListedWords,
  refreshFilterSelect, getTotalListedCount, saveListFilterState,
} from '../utils/word-lists.ts';
import { foldKey as norm } from '../utils/match.ts';
import { logger } from '../utils/logger.ts';

// ── Types ─────────────────────────────────────────────────────────────────────

interface VocabEntry {
  word:        string;
  translation: string;
  pos:         string | null;
  rank:        number | null;
  /** CEFR level, derived from rank server-side. */
  band:        string | null;
  glosses:     string[];
  examples:    string[];
  ipa:         string | null;
}

type SortMode =
  | 'alpha-asc' | 'alpha-desc'
  | 'rank-asc'  | 'rank-desc'
  | 'added-desc' | 'added-asc';

/** CEFR levels, easiest first. Order matters for the chip row. */
const BANDS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;

/** How many word rows to append per chunk while scrolling. */
const WORD_CHUNK = 120;

// ── POS helpers ───────────────────────────────────────────────────────────────

// Short labels for word-row badges
const POS_ABBREV: Record<string, string> = {
  verb: 'verb', noun: 'noun', adjective: 'adj',
  adverb: 'adv', pronoun: 'pron', preposition: 'prep',
  conjunction: 'conj', article: 'art',
};

// Full pluralized labels for the stats row
const POS_LABEL: Record<string, string> = {
  verb: 'Verbs', noun: 'Nouns', adjective: 'Adjectives',
  adverb: 'Adverbs', pronoun: 'Pronouns', preposition: 'Prepositions',
  conjunction: 'Conjunctions', article: 'Articles',
};

type ExportFormat = 'with-translation' | 'words-only';

// ── Vocabulary cache ──────────────────────────────────────────────────────────

const vocabCache    = new Map<string, VocabEntry[]>();
const vocabMapCache = new Map<string, Map<string, VocabEntry>>();

async function fetchVocab(lang: string): Promise<VocabEntry[]> {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  if (vocabCache.has(lang)) return vocabCache.get(lang)!; // safe: has() checked immediately above
  try {
    // Same source resolution as the main loader, so lists work offline too.
    const data = (await loadVocab(lang)).data as ApiWord[];
    const entries: VocabEntry[] = data
      .filter(w => w.word)
      .map(w => ({
        word:        w.word,
        translation: w.translation || '',
        pos:         w.pos         || null,
        rank:        w.frequency?.rank ?? w.rank ?? null,
        band:        w.frequency?.band ?? null,
        glosses:     Array.isArray(w.glosses)  ? w.glosses.filter(Boolean)  : [],
        examples:    Array.isArray(w.examples) ? w.examples.filter(Boolean) : [],
        ipa:         w.linguistic?.ipa || null,
      }));
    vocabCache.set(lang, entries);
    vocabMapCache.set(lang, new Map(entries.map(e => [e.word, e])));
    return entries;
  } catch {
    return [];
  }
}

// ── Move popover (module-level so it survives re-renders) ─────────────────────

let activePopover: HTMLElement | null = null;
function closePopover(): void { activePopover?.remove(); activePopover = null; }

// ── Duplicate list helper ─────────────────────────────────────────────────────

function duplicateList(lang: string, sourceName: string): string {
  const names = getListNames(lang);
  let newName = sourceName + ' (copy)';
  let n = 2;
  while (names.includes(newName)) newName = `${sourceName} (${n++})`;
  createList(lang, newName);
  for (const w of getList(lang, sourceName)) addToList(lang, newName, w);
  return newName;
}

// ── Export helper ─────────────────────────────────────────────────────────────

function exportList(
  words: string[], vocabMap: Map<string, VocabEntry> | undefined,
  listName: string, lang: string,
  format: ExportFormat = 'with-translation',
): void {
  let content: string;
  let filename: string;
  if (format === 'words-only') {
    content  = words.join('\n');
    filename = `${listName}-${lang}-words.txt`;
  } else {
    const lines = words.map(w => {
      const e = vocabMap?.get(w);
      return e?.translation ? `${w}\t${e.translation}` : w;
    });
    content  = lines.join('\n');
    filename = `${listName}-${lang}.txt`;
  }
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

// ── Undo toast ────────────────────────────────────────────────────────────────

let undoTimer: number | null = null;

/**
 * Show a transient toast with an Undo button.
 *
 * Lists live only in localStorage, so a mis-click used to be unrecoverable.
 * The caller supplies a closure that puts things back; we just handle the
 * timing and teardown.
 */
function showUndo(message: string, onUndo: (() => void) | null, ms = 9000): void {
  dismissUndo();

  const toast = document.createElement('div');
  toast.className = 'ml-undo-toast';
  toast.setAttribute('role', 'status');

  const msg = document.createElement('span');
  msg.className = 'ml-undo-msg'; msg.textContent = message;

  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'ml-undo-btn'; btn.textContent = 'Undo';
  btn.hidden = onUndo === null;
  btn.addEventListener('click', () => { dismissUndo(); onUndo?.(); });

  const close = document.createElement('button');
  close.type = 'button'; close.className = 'ml-undo-close';
  close.title = 'Dismiss'; close.textContent = '×';
  close.addEventListener('click', dismissUndo);

  toast.append(msg, btn, close);
  document.body.appendChild(toast);
  undoTimer = window.setTimeout(dismissUndo, ms);
}

function dismissUndo(): void {
  if (undoTimer !== null) { clearTimeout(undoTimer); undoTimer = null; }
  document.querySelectorAll('.ml-undo-toast').forEach(el => el.remove());
}

// ── Smart lists ───────────────────────────────────────────────────────────────

/**
 * A smart list is a saved query, not a stored set of words.
 *
 * Ordinary lists are a snapshot: mine 500 new words and an old "B1 verbs" list
 * still holds whatever it held last year. A smart list re-evaluates against the
 * current vocabulary every time you open it, so it stays honest as the corpus
 * grows. It is read-only by construction — you change what is in it by changing
 * the rule, or you materialise it into a normal list and edit that.
 */
export interface SmartRule {
  bands:    string[];               // empty = any level
  pos:      string[];               // empty = any part of speech
  mastered: 'any' | 'yes' | 'no';
  listed:   'any' | 'no';           // 'no' = not in any of your lists yet
  limit:    number;                 // 0 = no cap
  sort:     'rank' | 'alpha';
}

const SMART_PREFIX = 'vq_smart_';

function smartKey(lang: string): string { return SMART_PREFIX + lang.toLowerCase(); }

function getSmartLists(lang: string): Record<string, SmartRule> {
  try {
    const raw = localStorage.getItem(smartKey(lang));
    return raw ? JSON.parse(raw) as Record<string, SmartRule> : {};
  } catch { return {}; }
}

function saveSmartLists(lang: string, all: Record<string, SmartRule>): void {
  localStorage.setItem(smartKey(lang), JSON.stringify(all));
}

function getSmartNames(lang: string): string[] {
  return Object.keys(getSmartLists(lang)).sort((a, b) => a.localeCompare(b));
}

function saveSmartRule(lang: string, name: string, rule: SmartRule): void {
  const all = getSmartLists(lang); all[name] = rule; saveSmartLists(lang, all);
}

function deleteSmartList(lang: string, name: string): void {
  const all = getSmartLists(lang); delete all[name]; saveSmartLists(lang, all);
}

const DEFAULT_SMART_RULE: SmartRule = {
  bands: [], pos: [], mastered: 'no', listed: 'no', limit: 100, sort: 'rank',
};

/** Evaluate a rule against the loaded vocabulary for a language. */
function evaluateSmart(lang: string, rule: SmartRule, vocab: VocabEntry[]): string[] {
  const mastered = getMastered(lang);
  const listed   = getAllListedWords(lang);

  let out = vocab.filter(e => {
    if (rule.bands.length && !rule.bands.includes(e.band ?? '')) return false;
    if (rule.pos.length   && !rule.pos.includes(e.pos ?? ''))    return false;
    if (rule.mastered === 'yes' && !mastered.has(e.word)) return false;
    if (rule.mastered === 'no'  &&  mastered.has(e.word)) return false;
    if (rule.listed   === 'no'  &&  listed.has(e.word))   return false;
    return true;
  });

  out = rule.sort === 'alpha'
    ? out.sort((a, b) => norm(a.word).localeCompare(norm(b.word)))
    : out.sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999));

  const words = out.map(e => e.word);
  return rule.limit > 0 ? words.slice(0, rule.limit) : words;
}

function describeSmart(rule: SmartRule): string {
  const parts: string[] = [];
  if (rule.bands.length) parts.push(rule.bands.join('/'));
  if (rule.pos.length)   parts.push(rule.pos.join('/'));
  if (rule.mastered === 'no')  parts.push('not mastered');
  if (rule.mastered === 'yes') parts.push('mastered');
  if (rule.listed === 'no')    parts.push('not in a list');
  if (rule.limit > 0)          parts.push(`top ${rule.limit}`);
  return parts.length ? parts.join(' · ') : 'everything';
}

// ── Backup / restore ──────────────────────────────────────────────────────────

const LANGS_FOR_BACKUP = ['spanish', 'portuguese', 'italian', 'french'] as const;
const BACKUP_VERSION = 2;

interface ListsBackup {
  version:    number;
  exportedAt: string;
  lists:      Record<string, Record<string, string[]>>;
  /** v2: one set per language. v1 files nest it per list — see applyBackup. */
  mastery:    Record<string, string[] | Record<string, string[]>>;
}

/**
 * Serialise every list, in every language, plus mastery.
 *
 * Lists exist only in localStorage — clearing site data destroys them with no
 * server-side copy to fall back on. This is the only backup that exists.
 */
function buildBackup(): ListsBackup {
  const backup: ListsBackup = {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    lists: {}, mastery: {},
  };
  for (const l of LANGS_FOR_BACKUP) {
    const names = getListNames(l);
    const mastered = [...getMastered(l)];
    if (names.length === 0 && mastered.length === 0) continue;

    if (names.length) {
      backup.lists[l] = {};
      for (const name of names) backup.lists[l][name] = [...getList(l, name)];
    }
    if (mastered.length) backup.mastery[l] = mastered;
  }
  return backup;
}

function downloadBackup(): void {
  const blob = new Blob([JSON.stringify(buildBackup(), null, 2)],
                        { type: 'application/json;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `vocabapp-lists-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

/**
 * Merge a backup back in. Returns a short human summary.
 *
 * Merges rather than replaces: a name collision gets suffixed instead of
 * overwriting whatever is already there, so restoring can't destroy work.
 */
function applyBackup(raw: string): string {
  const data = JSON.parse(raw) as ListsBackup;
  if (!data || typeof data !== 'object' || !data.lists) {
    throw new Error('That file does not look like a VocabApp list backup.');
  }
  let restored = 0; let renamed = 0; let words = 0;

  for (const [l, lists] of Object.entries(data.lists)) {
    for (const [name, wordArr] of Object.entries(lists)) {
      if (!Array.isArray(wordArr)) continue;
      let target = name;
      if (getListNames(l).includes(target)) {
        let n = 2;
        while (getListNames(l).includes(`${name} (restored ${n})`)) n++;
        target = `${name} (restored ${n})`;
        renamed++;
      }
      createList(l, target);
      wordArr.forEach(w => { addToList(l, target, w); words++; });
      restored++;
    }
  }
  // Mastery. v2 stores one array per language; v1 nested it per list, so flatten.
  for (const [l, blob] of Object.entries(data.mastery ?? {})) {
    const merged = getMastered(l);
    if (Array.isArray(blob)) {
      blob.forEach(w => merged.add(w));
    } else if (blob && typeof blob === 'object') {
      Object.values(blob).forEach(arr => {
        if (Array.isArray(arr)) arr.forEach(w => merged.add(w));
      });
    }
    saveMastered(l, merged);
  }

  return `Restored ${restored} list${restored === 1 ? '' : 's'} (${words} words)`
       + (renamed ? `, ${renamed} renamed to avoid overwriting` : '');
}

// ── Mastery helpers ─────────────────────────────────────────────────────────

/**
 * Mastery is per *word*, per language — not per list.
 *
 * It used to be keyed by list name (`vq_mastery_<lang>_<list>`), which meant
 * the same word could be mastered in one list and not in another, renaming a
 * list silently wiped its progress, and deleting one leaked the key. Knowing a
 * word is a fact about the word, so it is now a single set per language and
 * those problems stop existing rather than needing to be handled.
 */
function masteryKey(lang: string): string {
  return `vq_mastery_${lang}`;
}

/** Old per-list key, still read once by migrateMastery(). */
const LEGACY_MASTERY_RE = /^vq_mastery_([a-z]+)_(.+)$/;

const migratedLangs = new Set<string>();

/**
 * Fold any legacy per-list mastery into the per-language set.
 *
 * Runs once per language per page load. The legacy keys are removed as they
 * are merged, so this is a one-way upgrade that cannot double-count.
 */
function migrateMastery(lang: string): void {
  if (migratedLangs.has(lang)) return;
  migratedLangs.add(lang);

  const legacyKeys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k) continue;
    const m = LEGACY_MASTERY_RE.exec(k);
    if (m && m[1] === lang) legacyKeys.push(k);
  }
  if (legacyKeys.length === 0) return;

  const merged = getMastered(lang);
  for (const k of legacyKeys) {
    try {
      const arr = JSON.parse(localStorage.getItem(k) ?? '[]');
      if (Array.isArray(arr)) arr.forEach((w: string) => merged.add(w));
    } catch { /* a corrupt legacy key is not worth failing the page over */ }
    localStorage.removeItem(k);
  }
  saveMastered(lang, merged);
  logger.info(`mastery: merged ${legacyKeys.length} per-list key(s) into ${masteryKey(lang)}`);
}

function getMastered(lang: string): Set<string> {
  try {
    const raw = localStorage.getItem(masteryKey(lang));
    return new Set(raw ? JSON.parse(raw) : []);
  } catch { return new Set(); }
}

function saveMastered(lang: string, mastered: Set<string>): void {
  localStorage.setItem(masteryKey(lang), JSON.stringify([...mastered]));
}

/** Mark words mastered from anywhere (used by the quiz-completion hook). */
export function markMastered(lang: string, words: Iterable<string>): number {
  migrateMastery(lang);
  const m = getMastered(lang);
  const before = m.size;
  for (const w of words) m.add(w);
  saveMastered(lang, m);
  return m.size - before;
}

export function isMastered(lang: string, word: string): boolean {
  migrateMastery(lang);
  return getMastered(lang).has(word);
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function renderMyLists(container: HTMLElement): void {
  container.innerHTML = '';

  let lang: string =
    (document.getElementById('langSelect') as HTMLSelectElement | null)?.value ?? 'spanish';
  migrateMastery(lang);
  let selectedList  = getListNames(lang)[0] ?? '';
  let sortMode: SortMode = 'alpha-asc';
  let expandedWord: string | null = null;
  let selectedSmart: string | null = null;
  const selectedPos   = new Set<string>();
  const selectedBands = new Set<string>();
  let hideMastered = false;

  // ── Left pane ──────────────────────────────────────────────────────────────

  const leftPane     = document.createElement('div');
  leftPane.className = 'ml-left-pane';

  const langRow     = document.createElement('div');
  langRow.className = 'ml-lang-row';
  const langLabel       = document.createElement('span');
  langLabel.className   = 'ml-lang-label';
  langLabel.textContent = 'Language';
  const langSel     = document.createElement('select');
  langSel.className = 'ml-lang-select';
  (['spanish', 'portuguese', 'italian', 'french'] as const).forEach(l => {
    const opt = document.createElement('option');
    opt.value = l; opt.textContent = l.charAt(0).toUpperCase() + l.slice(1);
    opt.selected = l === lang; langSel.appendChild(opt);
  });
  langSel.addEventListener('change', () => {
    lang = langSel.value; migrateMastery(lang);
    selectedList = getListNames(lang)[0] ?? '';
    closePopover(); renderSidebar();
  });
  langRow.appendChild(langLabel); langRow.appendChild(langSel);
  leftPane.appendChild(langRow);

  const header = document.createElement('div');
  header.className = 'ml-header';
  const titleSpan = document.createElement('span');
  titleSpan.className = 'ml-sidebar-title'; titleSpan.textContent = 'Lists';
  const newListBtn = document.createElement('button');
  newListBtn.type = 'button'; newListBtn.className = 'ml-new-list-btn';
  newListBtn.title = 'Create new list'; newListBtn.textContent = '+ New';
  newListBtn.addEventListener('click', () => startCreateList());
  // Backup / restore — the only safety net lists have, since they live in
  // localStorage and nothing on the server knows about them.
  const backupBtn = document.createElement('button');
  backupBtn.type = 'button'; backupBtn.className = 'ml-icon-btn ml-backup-btn';
  backupBtn.title = 'Download a backup of every list, in every language';
  backupBtn.textContent = '⭳';
  backupBtn.addEventListener('click', () => downloadBackup());

  const restoreBtn = document.createElement('button');
  restoreBtn.type = 'button'; restoreBtn.className = 'ml-icon-btn ml-restore-btn';
  restoreBtn.title = 'Restore lists from a backup file (merges, never overwrites)';
  restoreBtn.textContent = '⭱';

  const restoreInput = document.createElement('input');
  restoreInput.type = 'file'; restoreInput.accept = 'application/json,.json';
  restoreInput.hidden = true;
  restoreBtn.addEventListener('click', () => restoreInput.click());
  restoreInput.addEventListener('change', () => {
    const file = restoreInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const summary = applyBackup(String(reader.result));
        updateBadge(); renderSidebar();
        // Restore is additive, so there is nothing meaningful to undo.
        showUndo(summary, null, 6000);
      } catch (err) {
        logger.warn('list restore failed', err);
        alert((err as Error).message || 'Could not read that backup file.');
      }
      restoreInput.value = '';
    };
    reader.readAsText(file);
  });

  header.appendChild(titleSpan);
  header.appendChild(backupBtn); header.appendChild(restoreBtn);
  header.appendChild(newListBtn);
  leftPane.appendChild(header);
  leftPane.appendChild(restoreInput);

  const listNav = document.createElement('ul');
  listNav.className = 'ml-list-nav';
  leftPane.appendChild(listNav);
  container.appendChild(leftPane);

  // ── Right pane ─────────────────────────────────────────────────────────────

  const panel = document.createElement('div');
  panel.className = 'ml-panel';
  container.appendChild(panel);

  // ── Sidebar ────────────────────────────────────────────────────────────────

  /**
   * Redraw the sidebar.
   *
   * `rerenderPanel` defaults to true, but callers that only changed the
   * *contents* of the current list — adding, removing, moving a word — must
   * pass false. renderPanel() clears panel.innerHTML and rebuilds every
   * control from scratch, which wiped the add-search box (and its results,
   * and the filter text) out from under the user mid-interaction.
   */
  function renderSidebar(rerenderPanel = true): void {
    listNav.innerHTML = '';
    const names = getListNames(lang);

    if (names.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'ml-list-empty'; empty.textContent = 'No lists yet.';
      listNav.appendChild(empty); selectedList = '';
      renderPanel();
      return;
    }

    if (!names.includes(selectedList)) selectedList = names[0];

    names.forEach(name => {
      const li = document.createElement('li');
      li.className = 'ml-list-item' + (name === selectedList ? ' active' : '');

      const nameSpan = document.createElement('span');
      nameSpan.className = 'ml-list-name'; nameSpan.textContent = name; nameSpan.title = name;

      const countSpan = document.createElement('span');
      countSpan.className = 'ml-list-count';
      countSpan.textContent = String(getList(lang, name).length);

      const actions = document.createElement('span');
      actions.className = 'ml-list-actions';

      // Duplicate
      const dupBtn = document.createElement('button');
      dupBtn.type = 'button'; dupBtn.className = 'ml-icon-btn';
      dupBtn.title = 'Duplicate list'; dupBtn.textContent = '⧉';
      dupBtn.addEventListener('click', e => {
        e.stopPropagation();
        const newName = duplicateList(lang, name);
        selectedList = newName; updateBadge(); renderSidebar();
      });

      // Rename
      const renameBtn = document.createElement('button');
      renameBtn.type = 'button'; renameBtn.className = 'ml-icon-btn';
      renameBtn.title = 'Rename'; renameBtn.textContent = '✏';
      renameBtn.addEventListener('click', e => {
        e.stopPropagation(); startRenameList(name, li, nameSpan);
      });

      // Delete
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button'; deleteBtn.className = 'ml-icon-btn ml-icon-btn--danger';
      deleteBtn.title = 'Delete list'; deleteBtn.textContent = '🗑';
      deleteBtn.addEventListener('click', e => {
        e.stopPropagation();
        if (window.confirm(`Delete list "${name}" and all its words?`)) {
          // Snapshot before deleting so the whole list can come back intact.
          const words       = [...getList(lang, name)];
          const wasSelected = selectedList === name;

          deleteList(lang, name);
          if (wasSelected) selectedList = '';
          updateBadge(); renderSidebar();

          showUndo(`Deleted "${name}" (${words.length} words)`, () => {
            createList(lang, name);
            words.forEach(w => addToList(lang, name, w));
            if (wasSelected) selectedList = name;
            updateBadge(); renderSidebar();
          });
        }
      });

      actions.appendChild(dupBtn); actions.appendChild(renameBtn); actions.appendChild(deleteBtn);
      li.appendChild(nameSpan); li.appendChild(countSpan); li.appendChild(actions);
      li.addEventListener('click', () => {
        selectedList = name; selectedSmart = null;
        closePopover(); renderSidebar(); renderPanel();
      });
      listNav.appendChild(li);
    });

    renderSmartNav();
    if (rerenderPanel) renderPanel();
  }

  /** Smart lists get their own section — they behave differently enough. */
  function renderSmartNav(): void {
    const smartNames = getSmartNames(lang);

    const head = document.createElement('li');
    head.className = 'ml-smart-head';
    const headLabel = document.createElement('span');
    headLabel.textContent = 'Smart lists';
    const addSmart = document.createElement('button');
    addSmart.type = 'button'; addSmart.className = 'ml-new-list-btn';
    addSmart.title = 'Create a smart list — a saved query that stays current';
    addSmart.textContent = '+ New';
    addSmart.addEventListener('click', () => {
      const name = window.prompt('Name this smart list:', 'New words to learn');
      if (!name?.trim()) return;
      saveSmartRule(lang, name.trim(), { ...DEFAULT_SMART_RULE });
      selectedList = ''; selectedSmart = name.trim();
      renderSidebar();
    });
    head.append(headLabel, addSmart);
    listNav.appendChild(head);

    if (smartNames.length === 0) {
      const hint = document.createElement('li');
      hint.className = 'ml-list-empty ml-smart-hint';
      hint.textContent = 'e.g. "B1 verbs I haven\u2019t learned"';
      listNav.appendChild(hint);
      return;
    }

    smartNames.forEach(name => {
      const rule = getSmartLists(lang)[name];
      const li = document.createElement('li');
      li.className = 'ml-list-item ml-smart-item'
        + (name === selectedSmart ? ' active' : '');

      const nameSpan = document.createElement('span');
      nameSpan.className = 'ml-list-name';
      nameSpan.textContent = '\u26a1 ' + name;
      nameSpan.title = describeSmart(rule);

      const del = document.createElement('button');
      del.type = 'button'; del.className = 'ml-icon-btn ml-icon-btn--danger';
      del.title = 'Delete this smart list'; del.textContent = '\ud83d\uddd1';
      del.addEventListener('click', e => {
        e.stopPropagation();
        if (!window.confirm(`Delete smart list "${name}"? The words themselves are untouched.`)) return;
        deleteSmartList(lang, name);
        if (selectedSmart === name) selectedSmart = null;
        renderSidebar();
      });

      const actions = document.createElement('span');
      actions.className = 'ml-list-actions';
      actions.appendChild(del);

      li.append(nameSpan, actions);
      li.addEventListener('click', () => {
        selectedSmart = name; closePopover(); renderSidebar();
      });
      listNav.appendChild(li);
    });
  }

  // ── Smart list panel ───────────────────────────────────────────────────────

  function renderSmartPanel(name: string): void {
    const rule = getSmartLists(lang)[name];
    if (!rule) { selectedSmart = null; renderPanel(); return; }

    const header = document.createElement('div');
    header.className = 'ml-panel-header';

    const titleGroup = document.createElement('div');
    titleGroup.className = 'ml-panel-title-group';
    const title = document.createElement('h2');
    title.className = 'ml-panel-title';
    title.textContent = '\u26a1 ' + name;
    const count = document.createElement('span');
    count.className = 'ml-panel-count';
    titleGroup.append(title, count);

    // Materialise — the escape hatch from a query into an editable list.
    const freezeBtn = document.createElement('button');
    freezeBtn.type = 'button'; freezeBtn.className = 'ml-export-btn';
    freezeBtn.textContent = '\u2913 Save as list';
    freezeBtn.title = 'Copy these words into a normal, editable list';
    titleGroup.appendChild(freezeBtn);

    header.appendChild(titleGroup);

    const desc = document.createElement('p');
    desc.className = 'ml-smart-desc';
    header.appendChild(desc);

    // ── Rule editor ──────────────────────────────────────────────────────────
    const editor = document.createElement('div');
    editor.className = 'ml-smart-editor';

    function chipGroup(
      label: string, values: readonly string[], selected: string[],
      onToggle: (v: string) => void,
    ): HTMLElement {
      const row = document.createElement('div');
      row.className = 'ml-smart-row';
      const lab = document.createElement('span');
      lab.className = 'ml-band-label'; lab.textContent = label;
      row.appendChild(lab);
      values.forEach(v => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'pos-chip' + (selected.includes(v) ? ' active' : '');
        chip.textContent = v;
        chip.addEventListener('click', () => { onToggle(v); persist(); });
        row.appendChild(chip);
      });
      return row;
    }

    function selectRow(
      label: string, opts: readonly [string, string][],
      current: string, onPick: (v: string) => void,
    ): HTMLElement {
      const row = document.createElement('div');
      row.className = 'ml-smart-row';
      const lab = document.createElement('span');
      lab.className = 'ml-band-label'; lab.textContent = label;
      const sel = document.createElement('select');
      sel.className = 'ml-sort-select';
      opts.forEach(([v, l]) => {
        const o = document.createElement('option');
        o.value = v; o.textContent = l; o.selected = v === current;
        sel.appendChild(o);
      });
      sel.addEventListener('change', () => { onPick(sel.value); persist(); });
      row.append(lab, sel);
      return row;
    }

    function persist(): void {
      saveSmartRule(lang, name, rule);
      renderSmartPanel(name);
    }

    editor.appendChild(chipGroup('Level', BANDS, rule.bands, v => {
      const i = rule.bands.indexOf(v);
      if (i >= 0) rule.bands.splice(i, 1); else rule.bands.push(v);
    }));
    editor.appendChild(chipGroup(
      'Type', ['noun', 'verb', 'adjective', 'adverb'], rule.pos, v => {
        const i = rule.pos.indexOf(v);
        if (i >= 0) rule.pos.splice(i, 1); else rule.pos.push(v);
      }));
    editor.appendChild(selectRow('Mastered', [
      ['no', 'Not yet mastered'], ['yes', 'Mastered'], ['any', 'Either'],
    ], rule.mastered, v => { rule.mastered = v as SmartRule['mastered']; }));
    editor.appendChild(selectRow('In a list', [
      ['no', 'Not in any list'], ['any', 'Either'],
    ], rule.listed, v => { rule.listed = v as SmartRule['listed']; }));
    editor.appendChild(selectRow('Limit', [
      ['25', 'Top 25'], ['50', 'Top 50'], ['100', 'Top 100'],
      ['250', 'Top 250'], ['0', 'No limit'],
    ], String(rule.limit), v => { rule.limit = Number(v); }));
    editor.appendChild(selectRow('Order', [
      ['rank', 'Most frequent first'], ['alpha', 'A \u2192 Z'],
    ], rule.sort, v => { rule.sort = v as SmartRule['sort']; }));

    header.appendChild(editor);
    panel.appendChild(header);

    const listEl = document.createElement('ul');
    listEl.className = 'ml-word-list';
    panel.appendChild(listEl);

    // ── Evaluate ─────────────────────────────────────────────────────────────
    const vocab = vocabCache.get(lang) ?? [];
    const words = evaluateSmart(lang, rule, vocab);
    const vm    = vocabMapCache.get(lang);

    count.textContent = `${words.length} words`;
    desc.textContent  = describeSmart(rule)
      + (vocab.length ? ` — matched against ${vocab.length.toLocaleString()} words` : '');

    freezeBtn.addEventListener('click', () => {
      if (words.length === 0) return;
      let target = name;
      let n = 2;
      while (getListNames(lang).includes(target)) target = `${name} (${n++})`;
      createList(lang, target);
      words.forEach(w => addToList(lang, target, w));
      selectedSmart = null; selectedList = target;
      updateBadge(); renderSidebar();
      showUndo(`Saved ${words.length} words as "${target}"`, () => {
        deleteList(lang, target);
        selectedList = ''; selectedSmart = name;
        updateBadge(); renderSidebar();
      });
    });

    if (vocab.length === 0) {
      const loading = document.createElement('li');
      loading.className = 'ml-word-empty';
      loading.textContent = 'Loading vocabulary…';
      listEl.appendChild(loading);
      return;
    }
    if (words.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'ml-word-empty';
      empty.textContent = 'Nothing matches this rule. Try loosening it above.';
      listEl.appendChild(empty);
      return;
    }

    const mastered = getMastered(lang);
    words.slice(0, 400).forEach(word => {
      const entry = vm?.get(word);
      const li = document.createElement('li');
      li.className = 'ml-word-item'
        + (mastered.has(word) ? ' ml-word-item--mastered' : '');

      const wordSpan = document.createElement('span');
      wordSpan.className = 'ml-word-text'; wordSpan.textContent = word;
      const posSpan = document.createElement('span');
      posSpan.className = 'ml-word-pos';
      posSpan.textContent = POS_ABBREV[entry?.pos ?? ''] ?? '';
      if (entry?.pos) posSpan.dataset.pos = entry.pos; else posSpan.hidden = true;
      const bandSpan = document.createElement('span');
      bandSpan.className = 'ml-word-rank';
      bandSpan.textContent = entry?.band ?? '';
      if (!bandSpan.textContent) bandSpan.hidden = true;
      const transSpan = document.createElement('span');
      transSpan.className = 'ml-word-trans';
      transSpan.textContent = entry?.translation ?? '';

      li.append(wordSpan, posSpan, bandSpan, transSpan);
      listEl.appendChild(li);
    });

    if (words.length > 400) {
      const more = document.createElement('li');
      more.className = 'ml-chunk-sentinel';
      more.textContent = `…and ${words.length - 400} more. Save as a list to work through them.`;
      listEl.appendChild(more);
    }
  }

  // ── Panel ──────────────────────────────────────────────────────────────────

  function renderPanel(): void {
    closePopover(); expandedWord = null; panel.innerHTML = '';

    if (selectedSmart) { renderSmartPanel(selectedSmart); return; }

    if (!selectedList) {
      const empty = document.createElement('p');
      empty.className = 'ml-panel-empty'; empty.textContent = 'Create a list to get started.';
      panel.appendChild(empty); return;
    }

    // Header — title + count + export
    const panelHeader = document.createElement('div');
    panelHeader.className = 'ml-panel-header';

    const titleGroup = document.createElement('div');
    titleGroup.className = 'ml-panel-title-group';
    const title = document.createElement('h2');
    title.className = 'ml-panel-title'; title.textContent = selectedList;
    const countBadge = document.createElement('span');
    countBadge.className = 'ml-panel-count';
    countBadge.textContent = String(getList(lang, selectedList).length) + ' words';
    const exportBtn = document.createElement('button');
    exportBtn.type = 'button'; exportBtn.className = 'ml-export-btn';
    exportBtn.textContent = '↓ Export';

    const exportFmtSel = document.createElement('select');
    exportFmtSel.className = 'ml-export-format-sel';
    exportFmtSel.title = 'Export format';
    ([
      ['with-translation', 'Word + translation'],
      ['words-only',       'Words only'],
    ] as const).forEach(([value, label]) => {
      const opt = document.createElement('option');
      opt.value = value; opt.textContent = label;
      exportFmtSel.appendChild(opt);
    });

    exportBtn.addEventListener('click', () => {
      const fmt = exportFmtSel.value as ExportFormat;
      exportList(sortWords(getList(lang, selectedList)), vocabMapCache.get(lang), selectedList, lang, fmt);
    });
    const quizBtn       = document.createElement('button');
    quizBtn.type        = 'button';
    quizBtn.className   = 'ml-quiz-btn';
    quizBtn.title       = 'Focus this list and start a quiz';
    quizBtn.textContent = '▶ Quiz';
    quizBtn.addEventListener('click', () => {
      if (!selectedList) return;
      saveListFilterState(lang, { mode: 'focus', selected: [selectedList] });
      refreshFilterSelect(lang);
      const savedMode = localStorage.getItem('vq_mode');
      const targetMode = (!savedMode || savedMode === 'mylists') ? 'table' : savedMode;
      document.querySelector<HTMLElement>(`.mode-tab[data-mode="${targetMode}"]`)?.click();
      (document.getElementById('startBtn') as HTMLButtonElement | null)?.click();
    });

    titleGroup.appendChild(title); titleGroup.appendChild(countBadge);
    titleGroup.appendChild(exportBtn); titleGroup.appendChild(exportFmtSel);
    titleGroup.appendChild(quizBtn);

    // Stats row — updates after renderWords()
    const statsRow = document.createElement('div');
    statsRow.className = 'ml-stats-row';

    // Controls — filter + sort
    const controlsGroup = document.createElement('div');
    controlsGroup.className = 'ml-panel-controls';
    const filterInp = document.createElement('input');
    filterInp.type = 'text'; filterInp.placeholder = 'Filter by word, translation or gloss…';
    filterInp.className = 'ml-search';
    filterInp.title = 'Accent-insensitive — searches word, translation and glosses';
    const sortSel = document.createElement('select');
    sortSel.className = 'ml-sort-select'; sortSel.title = 'Sort order';
    ([
      ['alpha-asc',   'A → Z'],
      ['alpha-desc',  'Z → A'],
      ['rank-asc',    'Easiest first'],
      ['rank-desc',   'Hardest first'],
      ['added-desc',  'Recently added'],
      ['added-asc',   'Oldest first'],
    ] as const).forEach(([value, label]) => {
      const opt = document.createElement('option');
      opt.value = value; opt.textContent = label; opt.selected = value === sortMode;
      sortSel.appendChild(opt);
    });
    sortSel.addEventListener('change', () => { sortMode = sortSel.value as SortMode; renderWords(filterInp.value); });
    const hideMasteredBtn = document.createElement('button');
    hideMasteredBtn.type = 'button';
    hideMasteredBtn.className = 'ml-hide-mastered-btn';
    hideMasteredBtn.textContent = 'Hide mastered';
    hideMasteredBtn.title = 'Hide words you have marked as mastered';
    hideMasteredBtn.addEventListener('click', () => {
      hideMastered = !hideMastered;
      hideMasteredBtn.classList.toggle('ml-hide-mastered-btn--active', hideMastered);
      renderWords(filterInp.value);
    });
    controlsGroup.appendChild(filterInp); controlsGroup.appendChild(sortSel);
    controlsGroup.appendChild(hideMasteredBtn);

    // POS chips
    const posRow = document.createElement('div');
    posRow.className = 'ml-pos-row';
    const posChipBtns = new Map<string, HTMLButtonElement>();
    const POS_CHIPS = [
      { value: '',            label: 'All'          },
      { value: 'verb',        label: 'Verbs'        },
      { value: 'noun',        label: 'Nouns'        },
      { value: 'adjective',   label: 'Adjectives'   },
      { value: 'adverb',      label: 'Adverbs'      },
      { value: 'pronoun',     label: 'Pronouns'     },
      { value: 'preposition', label: 'Prepositions' },
      { value: 'conjunction', label: 'Conjunctions' },
      { value: 'article',     label: 'Articles'     },
    ];
    POS_CHIPS.forEach(({ value, label }) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'pos-chip' + (value === '' ? ' pos-chip-all active' : '');
      chip.textContent = label; if (value) { chip.dataset.pos = value; posChipBtns.set(value, chip); }
      chip.addEventListener('click', () => {
        if (value === '') selectedPos.clear();
        else { if (selectedPos.has(value)) selectedPos.delete(value); else selectedPos.add(value); }
        posRow.querySelectorAll<HTMLButtonElement>('.pos-chip').forEach(c => {
          c.classList.toggle('active', c.dataset.pos ? selectedPos.has(c.dataset.pos) : selectedPos.size === 0);
        });
        renderAddResults(addInp.value.trim()); renderWords(filterInp.value);
      });
      posRow.appendChild(chip);
    });

    // ── CEFR level chips ──────────────────────────────────────────────────────
    // band is populated for every word server-side (derived from rank), so this
    // filter works across the whole vocabulary rather than a curated subset.
    const bandRow = document.createElement('div');
    bandRow.className = 'ml-band-row';
    const bandLabel = document.createElement('span');
    bandLabel.className = 'ml-band-label';
    bandLabel.textContent = 'Level';
    bandRow.appendChild(bandLabel);

    const bandChipBtns = new Map<string, HTMLButtonElement>();
    const bandAllChip = document.createElement('button');
    bandAllChip.type = 'button';
    bandAllChip.className = 'pos-chip pos-chip-all active';
    bandAllChip.textContent = 'All';
    bandAllChip.addEventListener('click', () => {
      selectedBands.clear(); syncBandChips();
      renderAddResults(addInp.value.trim()); renderWords(filterInp.value);
    });
    bandRow.appendChild(bandAllChip);

    BANDS.forEach(band => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'pos-chip ml-band-chip';
      chip.dataset.band = band;
      chip.textContent = band;
      bandChipBtns.set(band, chip);
      chip.addEventListener('click', () => {
        if (selectedBands.has(band)) selectedBands.delete(band);
        else selectedBands.add(band);
        syncBandChips();
        renderAddResults(addInp.value.trim()); renderWords(filterInp.value);
      });
      bandRow.appendChild(chip);
    });

    function syncBandChips(): void {
      bandAllChip.classList.toggle('active', selectedBands.size === 0);
      bandChipBtns.forEach((btn, band) =>
        btn.classList.toggle('active', selectedBands.has(band)));
    }

    panelHeader.appendChild(titleGroup);
    panelHeader.appendChild(statsRow);
    panelHeader.appendChild(posRow);
    panelHeader.appendChild(bandRow);
    panel.appendChild(panelHeader);
    // controlsGroup is deliberately NOT added here — it is appended just above
    // the word list further down, so the filter sits next to what it filters.

    // Add-words search
    const addSection = document.createElement('div');
    addSection.className = 'ml-add-section';
    const addRow = document.createElement('div');
    addRow.className = 'ml-add-row';
    const addIcon = document.createElement('span');
    addIcon.className = 'ml-add-icon'; addIcon.textContent = '+';
    const addInp = document.createElement('input');
    addInp.type = 'text'; addInp.placeholder = 'Search vocabulary to add…';
    addInp.className = 'ml-add-input';
    addRow.appendChild(addIcon); addRow.appendChild(addInp);
    addSection.appendChild(addRow);
    const addResults = document.createElement('ul');
    addResults.className = 'ml-add-results'; addResults.hidden = true;
    addSection.appendChild(addResults);

    // ── Bulk import ───────────────────────────────────────────────────────────
    // Paste or drop a CSV / comma- or newline-separated list. Words are matched
    // against the vocabulary for this language; anything unmatched is reported
    // back rather than silently dropped.
    const bulkToggle = document.createElement('button');
    bulkToggle.type = 'button';
    bulkToggle.className = 'ml-bulk-toggle';
    bulkToggle.textContent = '⇪ Bulk import';
    bulkToggle.title = 'Add many words at once from a pasted list or CSV file';

    const bulkPanel = document.createElement('div');
    bulkPanel.className = 'ml-bulk-panel';
    bulkPanel.hidden = true;

    const bulkArea = document.createElement('textarea');
    bulkArea.className = 'ml-bulk-input';
    bulkArea.rows = 4;
    bulkArea.placeholder = 'hablar, comer, casa\nperro\nlibro…';

    const bulkRow = document.createElement('div');
    bulkRow.className = 'ml-bulk-row';

    const bulkFile = document.createElement('input');
    bulkFile.type = 'file';
    bulkFile.accept = '.csv,.txt,text/csv,text/plain';
    bulkFile.className = 'ml-bulk-file';

    const bulkAdd = document.createElement('button');
    bulkAdd.type = 'button';
    bulkAdd.className = 'ml-bulk-add';
    bulkAdd.textContent = 'Add to list';

    const bulkReport = document.createElement('div');
    bulkReport.className = 'ml-bulk-report';

    bulkRow.append(bulkFile, bulkAdd);
    bulkPanel.append(bulkArea, bulkRow, bulkReport);

    bulkToggle.addEventListener('click', () => {
      bulkPanel.hidden = !bulkPanel.hidden;
      if (!bulkPanel.hidden) bulkArea.focus();
    });

    bulkFile.addEventListener('change', () => {
      const file = bulkFile.files?.[0];
      if (!file) return;
      file.text().then(text => {
        bulkArea.value = bulkArea.value ? `${bulkArea.value}\n${text}` : text;
      }).catch(() => {
        bulkReport.textContent = 'Could not read that file.';
      });
    });

    /** Split on commas, newlines, tabs and semicolons; trim quotes and blanks. */
    function parseBulk(text: string): string[] {
      return text
        .split(/[,\n\r\t;]+/)
        .map(s => s.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
    }

    /**
     * Candidate matches for a token that didn't match exactly — inflections and
     * near-spellings, e.g. "hablo"/"hablamos" → hablar, "gato" → gata.
     */
    function findVariations(token: string): VocabEntry[] {
      const t = norm(token);
      if (t.length < 3) return [];
      const stem = t.slice(0, Math.max(3, t.length - 3));
      return allVocab
        .filter(e => {
          const w = norm(e.word);
          return w !== t && (w.startsWith(stem) || t.startsWith(norm(e.word).slice(0, Math.max(3, w.length - 2))));
        })
        .slice(0, 6);
    }

    /** Ask which of several candidates the user meant; resolves to picks. */
    function askVariations(
      pending: { token: string; options: VocabEntry[]; preferred?: string }[],
    ): Promise<string[]> {
      return new Promise(resolve => {
        const chosen: string[] = [];

        const backdrop = document.createElement('div');
        backdrop.className = 'ml-variation-backdrop';

        const dialog = document.createElement('div');
        dialog.className = 'ml-variation-dialog';
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');

        const title = document.createElement('div');
        title.className = 'ml-variation-title';
        title.textContent = pending.length === 1
          ? '1 word needs a choice'
          : `${pending.length} words need a choice`;

        const sub = document.createElement('div');
        sub.className = 'ml-variation-sub';
        sub.textContent = 'These weren’t exact matches. Pick the entry you meant, or skip.';

        const body = document.createElement('div');
        body.className = 'ml-variation-body';

        pending.forEach(({ token, options, preferred }) => {
          const row = document.createElement('div');
          row.className = 'ml-variation-row';

          const label = document.createElement('div');
          label.className = 'ml-variation-token';
          label.textContent = token;

          const opts = document.createElement('div');
          opts.className = 'ml-variation-options';

          options.forEach(opt => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'ml-variation-option';
            btn.textContent = opt.word + (opt.translation ? ` — ${opt.translation}` : '');
            btn.addEventListener('click', () => {
              const active = opts.querySelector('.ml-variation-option--picked');
              if (active === btn) {
                btn.classList.remove('ml-variation-option--picked');
                row.dataset.picked = '';
              } else {
                active?.classList.remove('ml-variation-option--picked');
                btn.classList.add('ml-variation-option--picked');
                row.dataset.picked = opt.word;
              }
            });
            if (preferred && opt.word === preferred) {
              btn.classList.add('ml-variation-option--picked');
              row.dataset.picked = opt.word;
            }
            opts.appendChild(btn);
          });

          row.append(label, opts);
          body.appendChild(row);
        });

        const actions = document.createElement('div');
        actions.className = 'ml-variation-actions';
        const skipBtn = document.createElement('button');
        skipBtn.type = 'button'; skipBtn.className = 'ml-variation-skip';
        skipBtn.textContent = 'Skip all';
        const addBtn = document.createElement('button');
        addBtn.type = 'button'; addBtn.className = 'ml-variation-add';
        addBtn.textContent = 'Add selected';
        actions.append(skipBtn, addBtn);

        function close(result: string[]): void {
          backdrop.remove();
          resolve(result);
        }

        skipBtn.addEventListener('click', () => close([]));
        addBtn.addEventListener('click', () => {
          body.querySelectorAll<HTMLElement>('.ml-variation-row').forEach(r => {
            if (r.dataset.picked) chosen.push(r.dataset.picked);
          });
          close(chosen);
        });
        backdrop.addEventListener('click', e => { if (e.target === backdrop) close([]); });

        dialog.append(title, sub, body, actions);
        backdrop.appendChild(dialog);
        document.body.appendChild(backdrop);
      });
    }

    bulkAdd.addEventListener('click', () => {
      const tokens = parseBulk(bulkArea.value);
      if (tokens.length === 0) {
        bulkReport.textContent = 'Nothing to import — paste some words first.';
        return;
      }

      // Keyed on the accent-stripped form, so "como" finds both *como* and
      // *cómo*. Several entries can share a key — that's the ambiguity we ask
      // about rather than silently picking one.
      const byWord = new Map<string, VocabEntry[]>();
      for (const entry of allVocab) {
        const key = norm(entry.word);
        const bucket = byWord.get(key);
        if (bucket) bucket.push(entry);
        else byWord.set(key, [entry]);
      }

      const existing = new Set(getList(lang, selectedList).map(w => w.toLowerCase()));
      const added: string[] = [];
      const already: string[] = [];
      const unmatched: string[] = [];
      const ambiguous: { token: string; options: VocabEntry[]; preferred?: string }[] = [];

      function take(word: string): void {
        if (existing.has(word.toLowerCase())) return;
        addToList(lang, selectedList, word);
        existing.add(word.toLowerCase());
        added.push(word);
      }

      for (const token of tokens) {
        const matches = byWord.get(norm(token)) ?? [];

        // Several spellings differing only by accent (como / cómo) — always ask,
        // even when one of them is typed exactly, since the accent carries the
        // meaning. An exact hit is pre-selected so confirming is one click.
        if (matches.length > 1) {
          const exact = matches.find(m => m.word.toLowerCase() === token.toLowerCase());
          ambiguous.push({ token, options: matches, preferred: exact?.word });
          continue;
        }

        if (matches.length === 1) {
          const only = matches[0].word;
          if (existing.has(only.toLowerCase())) already.push(token);
          else take(only);
          continue;
        }

        const options = findVariations(token);
        if (options.length > 0) ambiguous.push({ token, options });
        else                    unmatched.push(token);
      }

      function finish(): void {
        const parts = [`Added ${added.length}`];
        if (already.length)   parts.push(`${already.length} already listed`);
        if (unmatched.length) {
          const preview = unmatched.slice(0, 8).join(', ');
          parts.push(`${unmatched.length} not found (${preview}${unmatched.length > 8 ? '…' : ''})`);
        }
        bulkReport.textContent = parts.join(' · ');

        if (added.length > 0) {
          bulkArea.value = '';
          countBadge.textContent = String(getList(lang, selectedList).length) + ' words';
          updateBadge(); renderWords(filterInp.value.trim()); renderSidebar(false);
        }
      }

      if (ambiguous.length > 0) {
        void askVariations(ambiguous).then(picks => {
          picks.forEach(take);
          // Anything left unpicked is reported as not found
          const picked = new Set(picks.map(p => norm(p)));
          ambiguous.forEach(({ token, options }) => {
            if (!options.some(o => picked.has(norm(o.word)))) unmatched.push(token);
          });
          finish();
        });
        return;
      }

      finish();
    });

    addSection.append(bulkToggle, bulkPanel);
    panel.appendChild(addSection);

    // Word list
    // Filter / sort / hide-mastered, directly above the list they act on.
    const listToolbar = document.createElement('div');
    listToolbar.className = 'ml-list-toolbar';
    listToolbar.appendChild(controlsGroup);
    panel.appendChild(listToolbar);

    const listEl = document.createElement('ul');
    listEl.className = 'ml-word-list';
    panel.appendChild(listEl);

    // Chunked-render state (see appendChunk)
    let visibleWords: string[] = [];
    let renderedCount = 0;
    let chunkObserver: IntersectionObserver | null = null;

    // Multi-select state. Cleared whenever the visible set changes, so you can
    // never act on a word you can no longer see.
    const selectedWords = new Set<string>();

    // ── Bulk action bar ───────────────────────────────────────────────────────
    // Hidden until something is selected, so it costs nothing at rest.
    const bulkBar = document.createElement('div');
    bulkBar.className = 'ml-bulk-bar';
    bulkBar.hidden = true;

    const bulkCount = document.createElement('span');
    bulkCount.className = 'ml-bulk-count';

    function makeBulkBtn(label: string, title: string, cls = ''): HTMLButtonElement {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ml-bulk-btn' + (cls ? ' ' + cls : '');
      b.textContent = label; b.title = title;
      return b;
    }

    const bulkSelectAll = makeBulkBtn('Select all', 'Select every word currently shown');
    const bulkMaster    = makeBulkBtn('✓ Mastered', 'Mark the selected words as mastered');
    const bulkUnmaster  = makeBulkBtn('Unmark', 'Clear mastered on the selected words');
    const bulkMove      = makeBulkBtn('⇥ Move to…', 'Move the selected words to another list');
    const bulkRemove    = makeBulkBtn('× Remove', 'Remove the selected words from this list',
                                      'ml-bulk-btn--danger');
    const bulkClear     = makeBulkBtn('Clear', 'Deselect everything');

    bulkBar.append(bulkCount, bulkSelectAll, bulkMaster, bulkUnmaster,
                   bulkMove, bulkRemove, bulkClear);

    /** Show/hide the bar and keep its count and checkboxes honest. */
    function syncBulkBar(): void {
      // Drop anything no longer visible so a hidden word can't be acted on.
      const visible = new Set(visibleWords);
      [...selectedWords].forEach(w => { if (!visible.has(w)) selectedWords.delete(w); });

      const n = selectedWords.size;
      bulkBar.hidden = n === 0;
      bulkCount.textContent = n === 1 ? '1 selected' : `${n} selected`;
      bulkSelectAll.textContent =
        n > 0 && n === visibleWords.length ? 'Select none' : 'Select all';
      listEl.querySelectorAll<HTMLInputElement>('.ml-word-check').forEach(cb => {
        cb.checked = selectedWords.has(cb.dataset.word ?? '');
      });
    }

    function afterBulkChange(): void {
      countBadge.textContent = String(getList(lang, selectedList).length) + ' words';
      updateBadge();
      renderWords(filterInp.value);
      renderSidebar(false);
    }

    bulkSelectAll.addEventListener('click', () => {
      if (selectedWords.size === visibleWords.length) selectedWords.clear();
      else visibleWords.forEach(w => selectedWords.add(w));
      syncBulkBar();
    });
    bulkClear.addEventListener('click', () => { selectedWords.clear(); syncBulkBar(); });

    bulkMaster.addEventListener('click', () => {
      const m = getMastered(lang);
      selectedWords.forEach(w => m.add(w));
      saveMastered(lang, m);
      selectedWords.clear(); renderWords(filterInp.value);
    });
    bulkUnmaster.addEventListener('click', () => {
      const m = getMastered(lang);
      selectedWords.forEach(w => m.delete(w));
      saveMastered(lang, m);
      selectedWords.clear(); renderWords(filterInp.value);
    });

    bulkRemove.addEventListener('click', () => {
      const words = [...selectedWords];
      if (words.length === 0) return;
      words.forEach(w => removeFromList(lang, selectedList, w));
      selectedWords.clear();
      afterBulkChange();
      showUndo(`Removed ${words.length} word${words.length === 1 ? '' : 's'}`, () => {
        words.forEach(w => addToList(lang, selectedList, w));
        afterBulkChange();
      });
    });

    bulkMove.addEventListener('click', () => {
      const others = getListNames(lang).filter(n => n !== selectedList);
      if (others.length === 0) { alert('No other list to move to. Create one first.'); return; }
      const target = window.prompt(
        `Move ${selectedWords.size} word(s) to which list?\n\n${others.join('\n')}`,
        others[0],
      );
      if (!target || !others.includes(target)) return;
      const words = [...selectedWords];
      words.forEach(w => { removeFromList(lang, selectedList, w); addToList(lang, target, w); });
      selectedWords.clear();
      afterBulkChange();
      showUndo(`Moved ${words.length} to "${target}"`, () => {
        words.forEach(w => { removeFromList(lang, target, w); addToList(lang, selectedList, w); });
        afterBulkChange();
      });
    });

    listToolbar.appendChild(bulkBar);

    // Vocab
    let allVocab: VocabEntry[] = vocabCache.get(lang) ?? [];
    fetchVocab(lang).then(entries => {
      allVocab = entries;
      if (document.activeElement === addInp && addInp.value.trim()) renderAddResults(addInp.value.trim());
      renderWords(filterInp.value);
    }).catch(logger.error);

    // ── Sort ─────────────────────────────────────────────────────────────────

    function sortWords(words: string[]): string[] {
      const vm = vocabMapCache.get(lang); const F = 9999;
      switch (sortMode) {
        case 'alpha-asc':  return [...words].sort((a, b) => norm(a).localeCompare(norm(b)));
        case 'alpha-desc': return [...words].sort((a, b) => norm(b).localeCompare(norm(a)));
        case 'rank-asc':   return [...words].sort((a, b) => (vm?.get(a)?.rank ?? F) - (vm?.get(b)?.rank ?? F));
        case 'rank-desc':  return [...words].sort((a, b) => (vm?.get(b)?.rank ?? F) - (vm?.get(a)?.rank ?? F));
        // The stored list is a plain array appended to in insertion order, so
        // "recently added" is just that order — no timestamps needed.
        case 'added-asc':  return [...words];
        case 'added-desc': return [...words].reverse();
      }
    }

    // ── Stats ─────────────────────────────────────────────────────────────────

    function renderStats(words: string[]): void {
      const vm = vocabMapCache.get(lang);
      if (!vm || words.length === 0) { statsRow.innerHTML = ''; return; }
      const counts: Record<string, number> = {};
      let minRank = Infinity; let maxRank = -Infinity; let rankedCount = 0; let unlabeled = 0;
      for (const w of words) {
        const e = vm.get(w);
        if (e?.pos) counts[e.pos] = (counts[e.pos] ?? 0) + 1;
        else unlabeled++;
        if (e?.rank != null) {
          if (e.rank < minRank) minRank = e.rank;
          if (e.rank > maxRank) maxRank = e.rank;
          rankedCount++;
        }
      }
      const parts: string[] = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .map(([pos, n]) => `${n} ${POS_LABEL[pos] ?? pos}`);
      if (unlabeled > 0) parts.push(`${unlabeled} other`);
      if (rankedCount > 1)        parts.push(`ranks #${minRank}–#${maxRank}`);
      else if (rankedCount === 1) parts.push(`rank #${minRank}`);
      const masteredCount = words.filter(w => getMastered(lang).has(w)).length;
      if (masteredCount > 0) parts.push(`${masteredCount} mastered`);
      statsRow.innerHTML = parts
        .map(p => `<span class="ml-stat-chip">${p}</span>`)
        .join('');
    }

    // ── Add-search ────────────────────────────────────────────────────────────

    let currentMatches: VocabEntry[] = [];
    let focusedIdx = -1;

    function doAdd(entry: VocabEntry): void {
      addToList(lang, selectedList, entry.word);
      countBadge.textContent = String(getList(lang, selectedList).length) + ' words';
      updateBadge(); renderAddResults(addInp.value.trim());
      renderWords(filterInp.value.trim()); renderSidebar(false);
      // Keep the cursor where it was so several words can be added in a row.
      addInp.focus();
    }

    function setFocus(idx: number): void {
      const items = addResults.querySelectorAll<HTMLElement>('.ml-add-result-item');
      items.forEach((el, i) => el.classList.toggle('focused', i === idx));
      if (idx >= 0) items[idx]?.scrollIntoView({ block: 'nearest' });
      focusedIdx = idx;
    }

    function renderAddResults(query: string): void {
      addResults.innerHTML = ''; currentMatches = []; focusedIdx = -1;
      if (!query) { addResults.hidden = true; return; }
      const currentWords = new Set(getList(lang, selectedList).map(w => w.toLowerCase()));
      const q = norm(query);
      currentMatches = allVocab
        .filter(e => !currentWords.has(e.word.toLowerCase()))
        .filter(e => selectedPos.size   === 0 || selectedPos.has(e.pos ?? ''))
        .filter(e => selectedBands.size === 0 || selectedBands.has(e.band ?? ''))
        .filter(e => norm(e.word).includes(q)
                  || norm(e.translation).includes(q)
                  || e.glosses.some(g => norm(g).includes(q)))
        .slice(0, 12);
      if (currentMatches.length === 0) { addResults.hidden = true; return; }

      // Add-all bar
      const bar = document.createElement('li');
      bar.className = 'ml-add-all-bar';
      const allBtn = document.createElement('button');
      allBtn.type = 'button'; allBtn.className = 'ml-add-all-btn';
      allBtn.textContent = `Add all ${currentMatches.length}`;
      allBtn.addEventListener('click', e => {
        e.stopPropagation();
        currentMatches.forEach(en => addToList(lang, selectedList, en.word));
        countBadge.textContent = String(getList(lang, selectedList).length) + ' words';
        updateBadge(); renderAddResults(addInp.value.trim());
        renderWords(filterInp.value.trim()); renderSidebar(false);
        addInp.focus();
      });
      bar.appendChild(allBtn); addResults.appendChild(bar);

      currentMatches.forEach(entry => {
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
        li.appendChild(wordSpan); li.appendChild(posSpan);
        li.appendChild(transSpan); li.appendChild(addBtn);
        addResults.appendChild(li);
      });
      addResults.hidden = false;
    }

    addInp.addEventListener('input', () => renderAddResults(addInp.value.trim()));

    // ── Bulk paste ────────────────────────────────────────────────────────────
    addInp.addEventListener('paste', (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData('text') ?? '';
      const lines = text.split(/[\r\n]+/).map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) return; // single line: normal paste behavior
      e.preventDefault();
      const currentWords = new Set(getList(lang, selectedList).map(w => w.toLowerCase()));
      let added = 0;
      for (const line of lines) {
        const q = norm(line);
        const match = allVocab.find(v => norm(v.word) === q || norm(v.translation) === q);
        if (match && !currentWords.has(match.word.toLowerCase())) {
          addToList(lang, selectedList, match.word);
          currentWords.add(match.word.toLowerCase());
          added++;
        }
      }
      addInp.value = '';
      addResults.hidden = true;
      countBadge.textContent = String(getList(lang, selectedList).length) + ' words';
      updateBadge();
      renderWords(filterInp.value.trim());
      renderSidebar();
      const feedback = document.createElement('div');
      feedback.className = 'ml-bulk-feedback';
      feedback.textContent = added > 0
        ? `Added ${added} of ${lines.length} words`
        : 'No matching words found';
      addRow.appendChild(feedback);
      setTimeout(() => feedback.remove(), 2500);
    });

    addInp.addEventListener('keydown', (e: KeyboardEvent) => {
      const count = currentMatches.length;
      if (!count || addResults.hidden) return;
      switch (e.key) {
        case 'ArrowDown': e.preventDefault(); setFocus(Math.min(focusedIdx + 1, count - 1)); break;
        case 'ArrowUp':   e.preventDefault(); setFocus(Math.max(focusedIdx - 1, 0));         break;
        case 'Enter':
          e.preventDefault();
          if (focusedIdx >= 0) doAdd(currentMatches[focusedIdx]);
          else if (count > 0)  doAdd(currentMatches[0]);
          break;
        case 'Escape':
          addResults.hidden = true; focusedIdx = -1; break;
      }
    });

    const onClickOutside = (e: MouseEvent) => {
      if (!addSection.contains(e.target as Node)) addResults.hidden = true;
      if (activePopover && !activePopover.contains(e.target as Node)) closePopover();
    };
    document.addEventListener('click', onClickOutside, true);

    // ── Move/Copy popover ─────────────────────────────────────────────────────

    function openMovePopover(anchorBtn: HTMLElement, word: string): void {
      closePopover();
      let mode: 'move' | 'copy' = 'move';
      const otherLists = getListNames(lang).filter(n => n !== selectedList);

      const popover = document.createElement('div');
      popover.className = 'ml-move-popover';
      const rect = anchorBtn.getBoundingClientRect();
      popover.style.top  = (rect.bottom + 4) + 'px';
      popover.style.left = Math.max(4, rect.right - 160) + 'px';

      // Mode tabs
      const tabs = document.createElement('div');
      tabs.className = 'ml-move-popover-tabs';
      (['move', 'copy'] as const).forEach(m => {
        const tab = document.createElement('button');
        tab.type = 'button'; tab.className = 'ml-move-tab' + (m === mode ? ' active' : '');
        tab.textContent = m === 'move' ? '⇥ Move' : '+ Copy';
        tab.addEventListener('click', () => {
          mode = m;
          tabs.querySelectorAll('.ml-move-tab').forEach((t, i) =>
            t.classList.toggle('active', i === (m === 'move' ? 0 : 1)));
        });
        tabs.appendChild(tab);
      });
      popover.appendChild(tabs);

      if (otherLists.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'ml-move-popover-empty'; empty.textContent = 'No other lists';
        popover.appendChild(empty);
      } else {
        otherLists.forEach(listName => {
          const item = document.createElement('button');
          item.type = 'button'; item.className = 'ml-move-popover-item';
          item.textContent = listName;
          item.addEventListener('click', e => {
            e.stopPropagation();
            if (mode === 'move') removeFromList(lang, selectedList, word);
            addToList(lang, listName, word);
            countBadge.textContent = String(getList(lang, selectedList).length) + ' words';
            updateBadge(); renderWords(filterInp.value); renderSidebar(false); closePopover();
          });
          popover.appendChild(item);
        });
      }

      document.body.appendChild(popover);
      activePopover = popover;
    }

    // ── Chip counts ──────────────────────────────────────────────────────────────

    function updateChipCounts(): void {
      const vm = vocabMapCache.get(lang);
      if (!vm) return;
      const allWords = getList(lang, selectedList);
      const counts: Record<string, number> = {};
      for (const w of allWords) {
        const pos = vm.get(w)?.pos;
        if (pos) counts[pos] = (counts[pos] ?? 0) + 1;
      }
      for (const [pos, btn] of posChipBtns) {
        const n = counts[pos] ?? 0;
        const chipDef = POS_CHIPS.find(c => c.value === pos);
        btn.textContent = n > 0 ? `${chipDef?.label ?? pos} (${n})` : (chipDef?.label ?? pos);
      }
    }

    // ── Word list render ───────────────────────────────────────────────────────

    function renderWords(filter = ''): void {
      closePopover(); listEl.innerHTML = '';
      const vm = vocabMapCache.get(lang);
      const q  = norm(filter);
      const mastered = getMastered(lang);

      const filtered = getList(lang, selectedList).filter(w => {
        if (hideMastered && mastered.has(w)) return false;
        const e = vm?.get(w);
        if (selectedPos.size > 0 && !selectedPos.has(e?.pos ?? '')) return false;
        if (selectedBands.size > 0 && !selectedBands.has(e?.band ?? '')) return false;
        if (!q) return true;
        if (norm(w).includes(q)) return true;
        if (!e) return false;
        // Glosses are searched too — a word's translation is only one of
        // several English senses, and the rest were previously unreachable.
        return norm(e.translation).includes(q)
            || e.glosses.some(g => norm(g).includes(q));
      });

      renderStats(filtered);
      updateChipCounts();
      visibleWords  = sortWords(filtered);
      renderedCount = 0;
      chunkObserver?.disconnect();
      chunkObserver = null;
      syncBulkBar();

      if (visibleWords.length === 0) {
        const empty = document.createElement('li');
        empty.className = 'ml-word-empty';
        empty.textContent = filter ? 'No matches.' : 'No words in this list yet.';
        listEl.appendChild(empty); return;
      }

      appendChunk();
    }

    /**
     * Render the next slice of visibleWords.
     *
     * Lists can run to thousands of words and every row carries four buttons
     * and a checkbox, so building them all up front is what makes the panel
     * feel slow. Rows are appended a chunk at a time as a sentinel scrolls
     * into view instead. Chunking rather than fixed-height windowing because
     * rows change height when expanded, which windowing would have to model.
     */
    function appendChunk(): void {
      const vm       = vocabMapCache.get(lang);
      const mastered = getMastered(lang);
      listEl.querySelector('.ml-chunk-sentinel')?.remove();

      const slice = visibleWords.slice(renderedCount, renderedCount + WORD_CHUNK);
      slice.forEach(word => listEl.appendChild(buildRow(word, vm, mastered)));
      renderedCount += slice.length;

      if (renderedCount >= visibleWords.length) return;

      const sentinel = document.createElement('li');
      sentinel.className = 'ml-chunk-sentinel';
      sentinel.textContent =
        `Loading ${Math.min(WORD_CHUNK, visibleWords.length - renderedCount)} more…`;
      listEl.appendChild(sentinel);

      chunkObserver?.disconnect();
      chunkObserver = new IntersectionObserver(entries => {
        if (entries.some(en => en.isIntersecting)) appendChunk();
      }, { root: listEl, rootMargin: '400px' });
      chunkObserver.observe(sentinel);
    }

    function buildRow(
      word: string,
      vm: Map<string, VocabEntry> | undefined,
      mastered: Set<string>,
    ): HTMLLIElement {
      {
        const entry = vm?.get(word);
        const posLabel = POS_ABBREV[entry?.pos ?? ''] ?? '';
        const isMastered = mastered.has(word);

        // ── Main row ────────────────────────────────────────────────
        const li = document.createElement('li');
        li.className = 'ml-word-item'
          + (word === expandedWord ? ' ml-word-item--expanded' : '')
          + (isMastered ? ' ml-word-item--mastered' : '');

        const check = document.createElement('input');
        check.type = 'checkbox';
        check.className = 'ml-word-check';
        check.dataset.word = word;
        check.checked = selectedWords.has(word);
        check.title = 'Select for bulk actions';
        check.addEventListener('click', e => e.stopPropagation());
        check.addEventListener('change', () => {
          if (check.checked) selectedWords.add(word); else selectedWords.delete(word);
          syncBulkBar();
        });

        const wordSpan = document.createElement('span');
        wordSpan.className = 'ml-word-text'; wordSpan.textContent = word;

        const posSpan = document.createElement('span');
        posSpan.className = 'ml-word-pos'; posSpan.textContent = posLabel;
        if (posLabel && entry?.pos) posSpan.dataset.pos = entry.pos;
        else posSpan.hidden = true;

        const transSpan = document.createElement('span');
        transSpan.className = 'ml-word-trans'; transSpan.textContent = entry?.translation ?? '';

        const rankBadge = document.createElement('span');
        rankBadge.className = 'ml-word-rank';
        if (entry?.rank != null) rankBadge.textContent = '#' + entry.rank;
        else rankBadge.hidden = true;

        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'ml-word-actions';

        const masteryBtn = document.createElement('button');
        masteryBtn.type = 'button';
        masteryBtn.className = 'ml-mastery-btn' + (isMastered ? ' ml-mastery-btn--active' : '');
        masteryBtn.title = isMastered ? 'Unmark as mastered' : 'Mark as mastered';
        masteryBtn.textContent = '✓';
        masteryBtn.addEventListener('click', e => {
          e.stopPropagation();
          const m = getMastered(lang);
          if (m.has(word)) m.delete(word); else m.add(word);
          saveMastered(lang, m);
          renderWords(filterInp.value);
        });

        const moveBtn = document.createElement('button');
        moveBtn.type = 'button'; moveBtn.className = 'ml-move-btn';
        moveBtn.title = 'Move or copy to another list'; moveBtn.textContent = '⇥';
        moveBtn.addEventListener('click', e => { e.stopPropagation(); openMovePopover(moveBtn, word); });

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button'; removeBtn.className = 'ml-remove-btn';
        removeBtn.title = 'Remove from list'; removeBtn.textContent = '×';
        removeBtn.addEventListener('click', e => {
          e.stopPropagation();
          removeFromList(lang, selectedList, word);
          countBadge.textContent = String(getList(lang, selectedList).length) + ' words';
          updateBadge();
          if (addInp.value.trim()) renderAddResults(addInp.value.trim());
          // Re-render the word list too, or the removed row stays on screen
          // until some other action happens to redraw it.
          renderWords(filterInp.value.trim());
          renderSidebar(false);
          const listAtRemoval = selectedList;
          showUndo(`Removed "${word}"`, () => {
            addToList(lang, listAtRemoval, word);
            countBadge.textContent = String(getList(lang, selectedList).length) + ' words';
            updateBadge(); renderWords(filterInp.value); renderSidebar(false);
          });
        });

        actionsDiv.appendChild(masteryBtn); actionsDiv.appendChild(moveBtn); actionsDiv.appendChild(removeBtn);
        li.appendChild(check); li.appendChild(wordSpan); li.appendChild(posSpan);
        li.appendChild(rankBadge); li.appendChild(transSpan); li.appendChild(actionsDiv);

        // ── Preview row (collapsed unless expanded) ───────────────────
        const detail = document.createElement('div');
        detail.className = 'ml-word-detail';

        if (word === expandedWord && entry) {
          if (entry.glosses.length > 1) {
            const gl = document.createElement('span');
            gl.className = 'ml-detail-glosses';
            gl.textContent = entry.glosses.join(', ');
            detail.appendChild(gl);
          }
          if (entry.ipa) {
            const ipa = document.createElement('span');
            ipa.className = 'ml-detail-ipa'; ipa.textContent = '/' + entry.ipa + '/';
            detail.appendChild(ipa);
          }
          if (entry.examples.length > 0) {
            const ex = document.createElement('span');
            ex.className = 'ml-detail-example'; ex.textContent = entry.examples[0];
            detail.appendChild(ex);
          }
          if (detail.children.length === 0) {
            const none = document.createElement('span');
            none.className = 'ml-detail-none'; none.textContent = 'No additional details.';
            detail.appendChild(none);
          }
        }

        li.appendChild(detail);

        // Toggle preview on row click (but not on action buttons)
        li.addEventListener('click', e => {
          if ((e.target as HTMLElement).closest('button')) return;
          expandedWord = (expandedWord === word) ? null : word;
          renderWords(filterInp.value);
        });

        return li;
      }
    }
    renderWords();
    filterInp.addEventListener('input', () => renderWords(filterInp.value));
  }

  // ── Create / rename ────────────────────────────────────────────────────────

  function startCreateList(): void {
    const li = document.createElement('li');
    li.className = 'ml-list-item ml-list-item--editing';
    const inp = document.createElement('input');
    inp.type = 'text'; inp.placeholder = 'List name...'; inp.className = 'ml-list-name-input';
    const okBtn = document.createElement('button');
    okBtn.type = 'button'; okBtn.className = 'ml-icon-btn'; okBtn.textContent = '✓';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button'; cancelBtn.className = 'ml-icon-btn'; cancelBtn.textContent = '✕';
    function confirmCreate(): void {
      const name = inp.value.trim(); if (!name) { li.remove(); return; }
      createList(lang, name); selectedList = name; updateBadge(); renderSidebar();
    }
    okBtn.addEventListener('click', confirmCreate);
    cancelBtn.addEventListener('click', () => li.remove());
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') confirmCreate(); if (e.key === 'Escape') li.remove();
    });
    li.appendChild(inp); li.appendChild(okBtn); li.appendChild(cancelBtn);
    listNav.prepend(li); inp.focus();
  }

  function startRenameList(oldName: string, li: HTMLElement, nameSpan: HTMLElement): void {
    const inp = document.createElement('input');
    inp.type = 'text'; inp.value = oldName; inp.className = 'ml-list-name-input';
    const okBtn = document.createElement('button');
    okBtn.type = 'button'; okBtn.className = 'ml-icon-btn'; okBtn.textContent = '✓';
    function confirmRename(): void {
      const newName = inp.value.trim();
      if (!newName || newName === oldName) { done(); return; }
      if (renameList(lang, oldName, newName)) {
        if (selectedList === oldName) selectedList = newName;
        updateBadge(); renderSidebar();
      } else { alert(`A list named "${newName}" already exists.`); inp.focus(); }
    }
    function done(): void { inp.replaceWith(nameSpan); okBtn.remove(); }
    okBtn.addEventListener('click', confirmRename);
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') confirmRename(); if (e.key === 'Escape') done();
    });
    nameSpan.replaceWith(inp);
    const actionsEl = li.querySelector('.ml-list-actions');
    if (actionsEl) li.insertBefore(okBtn, actionsEl);
    inp.focus(); inp.select();
  }

  function updateBadge(): void {
    const gl = (document.getElementById('langSelect') as HTMLSelectElement | null)?.value ?? 'spanish';
    const el = document.getElementById('knownWordCount');
    if (el) el.textContent = String(getTotalListedCount(gl));
    refreshFilterSelect(gl);
  }

  renderSidebar();
}
