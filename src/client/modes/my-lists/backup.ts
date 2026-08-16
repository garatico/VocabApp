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
} from '../../utils/word-lists.ts';
import { getMastered, saveMastered } from './mastery.ts';

const LANGS_FOR_BACKUP = ['spanish', 'portuguese', 'italian', 'french'] as const;
const BACKUP_VERSION = 2;

export interface ListsBackup {
  version:    number;
  exportedAt: string;
  lists:      Record<string, Record<string, string[]>>;
  /** v2: one set per language. v1 files nest it per list — see applyBackup. */
  mastery:    Record<string, string[] | Record<string, string[]>>;
}

/** Serialise every list, in every language, plus mastery. */
export function buildBackup(): ListsBackup {
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

  return `Restored ${restored} list${restored === 1 ? '' : 's'} (${words} words)`
       + (renamed ? `, ${renamed} renamed to avoid overwriting` : '');
}
