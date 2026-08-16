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
import type { VocabEntry } from './types.ts';

export interface SmartRule {
  bands:    string[];               // empty = any level
  pos:      string[];               // empty = any part of speech
  mastered: 'any' | 'yes' | 'no';
  listed:   'any' | 'no';           // 'no' = not in any of your lists yet
  limit:    number;                 // 0 = no cap
  sort:     'rank' | 'alpha';
}

export const DEFAULT_SMART_RULE: SmartRule = {
  bands: [], pos: [], mastered: 'no', listed: 'no', limit: 100, sort: 'rank',
};

const SMART_PREFIX = 'vq_smart_';

function smartKey(lang: string): string { return SMART_PREFIX + lang.toLowerCase(); }

export function getSmartLists(lang: string): Record<string, SmartRule> {
  try {
    const raw = localStorage.getItem(smartKey(lang));
    return raw ? JSON.parse(raw) as Record<string, SmartRule> : {};
  } catch { return {}; }
}

function saveSmartLists(lang: string, all: Record<string, SmartRule>): void {
  localStorage.setItem(smartKey(lang), JSON.stringify(all));
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

/** Evaluate a rule against the loaded vocabulary for a language. */
export function evaluateSmart(lang: string, rule: SmartRule, vocab: VocabEntry[]): string[] {
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

/** One-line summary of a rule, for the sidebar tooltip and the panel header. */
export function describeSmart(rule: SmartRule): string {
  const parts: string[] = [];
  if (rule.bands.length) parts.push(rule.bands.join('/'));
  if (rule.pos.length)   parts.push(rule.pos.join('/'));
  if (rule.mastered === 'no')  parts.push('not mastered');
  if (rule.mastered === 'yes') parts.push('mastered');
  if (rule.listed === 'no')    parts.push('not in a list');
  if (rule.limit > 0)          parts.push(`top ${rule.limit}`);
  return parts.length ? parts.join(' · ') : 'everything';
}
