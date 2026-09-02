/**
 * backup.ts — the only safety net lists have.
 *
 * Lists and mastery exist only in localStorage. Clearing site data destroys
 * them and nothing on the server knows they existed, so this file is the whole
 * disaster-recovery story: one JSON blob covering every list in every language.
 *
 * Restore *merges*. A name collision is suffixed rather than overwritten, so
 * restoring an old backup onto a populated browser can never destroy work — the
 * worst case is a duplicate list the user deletes.
 */

import {
  getListNames, getList, createList, addToList,
  getMultiListNames, getMultiList, createMultiList, addToMultiList, type MultiListEntry,
} from '../../utils/word-lists.ts';
import { getMastered, saveMastered, getMasteryLevels, setMasteryLevel } from './mastery.ts';
import { LANGUAGE_NAMES } from '../../data/languages.ts';

const BACKUP_VERSION = 4;

export interface ListsBackup {
  version:    number;
  exportedAt: string;
  lists:      Record<string, Record<string, string[]>>;
  /** v2: one set per language. v1 files nest it per list — see applyBackup. */
  mastery:    Record<string, string[] | Record<string, string[]>>;
  /** v3+. Absent in older files — restores as "nothing to add". */
  multiLists?: Record<string, MultiListEntry[]>;
  /**
   * v4+. The finer 0–MAX_MASTERY_LEVEL scale (New/Learning/Familiar/
   * Confident/Mastered) — a genuinely separate storage key from `mastery`
   * above (that one only ever answers "at max level or not"). Absent from
   * every backup through v3, which meant restoring one recovered *whether*
   * a word was fully mastered but silently reset anything sitting at
   * Learning/Familiar/Confident back to New — a real gap in "the whole
   * disaster-recovery story" this file's own header claims to be.
   */
  masteryLevels?: Record<string, Record<string, number>>;
}

/** Serialise every list, in every language, plus mastery and cross-language lists. */
export function buildBackup(): ListsBackup {
  const backup: ListsBackup = {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    lists: {}, mastery: {},
  };
  for (const l of LANGUAGE_NAMES) {
    const names = getListNames(l);
    const mastered = [...getMastered(l)];
    const levels = getMasteryLevels(l);
    const hasLevels = Object.keys(levels).length > 0;
    if (names.length === 0 && mastered.length === 0 && !hasLevels) continue;

    if (names.length) {
      backup.lists[l] = {};
      for (const name of names) backup.lists[l][name] = [...getList(l, name)];
    }
    if (mastered.length) backup.mastery[l] = mastered;
    if (hasLevels) {
      backup.masteryLevels = backup.masteryLevels ?? {};
      backup.masteryLevels[l] = levels;
    }
  }

  const multiNames = getMultiListNames();
  if (multiNames.length > 0) {
    backup.multiLists = {};
    for (const name of multiNames) backup.multiLists[name] = getMultiList(name);
  }

  return backup;
}

export function downloadBackup(): void {
  const blob = new Blob([JSON.stringify(buildBackup(), null, 2)],
                        { type: 'application/json;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `vocabapp-lists-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

/** Merge a backup back in. Returns a short human summary. */
export function applyBackup(raw: string): string {
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

  // Mastery levels (the New/Learning/Familiar/Confident/Mastered scale) —
  // absent entirely before v4. Merged by taking the higher of the two levels
  // per word, never the backup's alone: restoring an old file should recover
  // progress that has since been lost, not roll back progress made since the
  // backup was taken. setMasteryLevel keeps the boolean Set above in sync
  // too, so a word restored to the max level here also ends up in `mastery`.
  for (const [l, levels] of Object.entries(data.masteryLevels ?? {})) {
    if (!levels || typeof levels !== 'object') continue;
    const current = getMasteryLevels(l);
    for (const [w, level] of Object.entries(levels)) {
      if (typeof level !== 'number') continue;
      const merged = Math.max(current[w] ?? 0, level);
      if (merged > 0) setMasteryLevel(l, w, merged);
    }
  }

  // Cross-language lists. Absent entirely in v1/v2 files — nothing to add.
  for (const [name, entries] of Object.entries(data.multiLists ?? {})) {
    if (!Array.isArray(entries)) continue;
    let target = name;
    if (getMultiListNames().includes(target)) {
      let n = 2;
      while (getMultiListNames().includes(`${name} (restored ${n})`)) n++;
      target = `${name} (restored ${n})`;
      renamed++;
    }
    createMultiList(target);
    entries.forEach(e => {
      if (e && typeof e.word === 'string' && typeof e.language === 'string') {
        addToMultiList(target, e.word, e.language); words++;
      }
    });
    restored++;
  }

  return `Restored ${restored} list${restored === 1 ? '' : 's'} (${words} words)`
       + (renamed ? `, ${renamed} renamed to avoid overwriting` : '');
}
