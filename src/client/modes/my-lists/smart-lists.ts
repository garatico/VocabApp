/**
 * smart-lists.ts — saved queries that stay current.
 *
 * An ordinary list is a snapshot: mine 500 new words and an old "B1 verbs" list
 * still holds whatever it held last year. A smart list is re-evaluated against
 * the current vocabulary every time it is opened, so it stays honest as the
 * corpus grows. It is read-only by construction — you change what is in it by
 * changing the rule, or you materialise it into a normal list and edit that.
 *
 * Storage is separate from ordinary lists (`vq_smart_<lang>` rather than the
 * word-lists key) precisely because the two are not interchangeable: a backup
 * or an import that treated a rule as a word array would produce nonsense.
 */

import { foldKey as norm } from '../../utils/match.ts';
import { getAllListedWords } from '../../utils/word-lists.ts';
import { getMastered } from './mastery.ts';
import { srsDueWords } from '../../utils/srs.ts';
import type { VocabEntry } from './types.ts';

export interface SmartRule {
  bands:    string[];               // empty = any level
  pos:      string[];               // empty = any part of speech
  mastered: 'any' | 'yes' | 'no';
  listed:   'any' | 'no';           // 'no' = not in any of your lists yet
  /**
   * 'yes' = due on the spaced-repetition schedule right now — a different
   * question from `mastered`: a word can be unmastered but not due yet
   * (just seen), or mastered long ago and now overdue for a refresher.
   */
  due:      'any' | 'yes';
  limit:    number;                 // 0 = no cap
  sort:     'rank' | 'alpha';
}

export const DEFAULT_SMART_RULE: SmartRule = {
  bands: [], pos: [], mastered: 'no', listed: 'no', due: 'any', limit: 100, sort: 'rank',
};

import { readJson, writeJson, isRecord } from '../../utils/storage.ts';
const SMART_PREFIX = 'vq_smart_';

function smartKey(lang: string): string { return SMART_PREFIX + lang.toLowerCase(); }

export function getSmartLists(lang: string): Record<string, SmartRule> {
  return readJson<Record<string, SmartRule>>(smartKey(lang), {}, isRecord);
}

function saveSmartLists(lang: string, all: Record<string, SmartRule>): void {
  writeJson(smartKey(lang), all);
}

export function getSmartNames(lang: string): string[] {
  return Object.keys(getSmartLists(lang)).sort((a, b) => a.localeCompare(b));
}

export function saveSmartRule(lang: string, name: string, rule: SmartRule): void {
  const all = getSmartLists(lang); all[name] = rule; saveSmartLists(lang, all);
}

export function deleteSmartList(lang: string, name: string): void {
  const all = getSmartLists(lang); delete all[name]; saveSmartLists(lang, all);
}

/** Rename in place, keeping the same rule. False if the new name collides. */
export function renameSmartList(lang: string, oldName: string, newName: string): boolean {
  const all = getSmartLists(lang);
  if (!(oldName in all) || newName in all) return false;
  all[newName] = all[oldName];
  delete all[oldName];
  saveSmartLists(lang, all);
  return true;
}

/** Evaluate a rule against the loaded vocabulary for a language. */
export function evaluateSmart(lang: string, rule: SmartRule, vocab: VocabEntry[]): string[] {
  const mastered = getMastered(lang);
  const listed   = getAllListedWords(lang);
  const due      = rule.due === 'yes' ? new Set(srsDueWords(lang)) : null;

  let out = vocab.filter(e => {
    if (rule.bands.length && !rule.bands.includes(e.band ?? '')) return false;
    if (rule.pos.length   && !rule.pos.includes(e.pos ?? ''))    return false;
    if (rule.mastered === 'yes' && !mastered.has(e.word)) return false;
    if (rule.mastered === 'no'  &&  mastered.has(e.word)) return false;
    if (rule.listed   === 'no'  &&  listed.has(e.word))   return false;
    if (due && !due.has(e.word)) return false;
    return true;
  });

  out = rule.sort === 'alpha'
    ? out.sort((a, b) => norm(a.word).localeCompare(norm(b.word)))
    : out.sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999));

  const words = out.map(e => e.word);
  return rule.limit > 0 ? words.slice(0, rule.limit) : words;
}
