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
  /**
   * Empty = any domain. Matches like the Table/Picture Domains filter — a
   * word needs only one of these in common (OR, not AND), and a word with no
   * domain data at all does not get a free pass.
   */
  domains:  string[];
  mastered: 'any' | 'yes' | 'no';
  listed:   'any' | 'no';           // 'no' = not in any of your lists yet
  /**
   * 'yes' = due on the spaced-repetition schedule right now — a different
   * question from `mastered`: a word can be unmastered but not due yet
   * (just seen), or mastered long ago and now overdue for a refresher.
   */
  due:      'any' | 'yes';
  /** Case/accent-insensitive prefix match on the word itself. '' = any. */
  wordStartsWith:  string;
  /** Case/accent-insensitive substring match on the translation. '' = any. */
  meaningContains: string;
  limit:    number;                 // 0 = no cap
  sort:     'rank' | 'alpha';
  /**
   * Words pinned into the result regardless of whether the rule above would
   * otherwise select them — the escape hatch for "this one specific word
   * too", without loosening the filter for everything else. Added after the
   * limit/sort so they can never be pushed out by `limit`.
   */
  manualWords: string[];
}

export const DEFAULT_SMART_RULE: SmartRule = {
  bands: [], pos: [], domains: [], mastered: 'no', listed: 'no', due: 'any',
  wordStartsWith: '', meaningContains: '', limit: 100, sort: 'rank',
  manualWords: [],
};

import { readJson, writeJson, isRecord } from '../../utils/storage.ts';
const SMART_PREFIX = 'vq_smart_';

function smartKey(lang: string): string { return SMART_PREFIX + lang.toLowerCase(); }

/**
 * Read every saved rule for a language, filling in defaults for any field
 * that did not exist yet when the rule was saved.
 *
 * A rule on disk is whatever shape SmartRule had the day it was written —
 * `domains`, `wordStartsWith` and `meaningContains` were all added after this
 * feature shipped, so a rule saved before any one of them is missing it.
 * Every reader downstream (evaluateSmart, the sidebar's per-rule word counts,
 * the editor's chip groups) assumes a complete SmartRule and indexes straight
 * into these fields — `rule.domains.length`, `selected.includes(v)` — with no
 * guard, so an old rule read raw crashed mid-render the moment `domains`
 * shipped, taking every sidebar section rendered after Smart Lists down with
 * it. Filling defaults once, here, at the only place a rule enters the app,
 * means a future field can be added the same way without auditing every call
 * site for one more optional-chain.
 */
export function getSmartLists(lang: string): Record<string, SmartRule> {
  const raw = readJson<Record<string, Partial<SmartRule>>>(smartKey(lang), {}, isRecord);
  const out: Record<string, SmartRule> = {};
  for (const [name, rule] of Object.entries(raw)) out[name] = { ...DEFAULT_SMART_RULE, ...rule };
  return out;
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
    if (rule.domains.length && !e.domains.some(d => rule.domains.includes(d))) return false;
    if (rule.mastered === 'yes' && !mastered.has(e.word)) return false;
    if (rule.mastered === 'no'  &&  mastered.has(e.word)) return false;
    if (rule.listed   === 'no'  &&  listed.has(e.word))   return false;
    if (due && !due.has(e.word)) return false;
    if (rule.wordStartsWith && !norm(e.word).startsWith(norm(rule.wordStartsWith))) return false;
    if (rule.meaningContains && !norm(e.translation).includes(norm(rule.meaningContains))) return false;
    return true;
  });

  out = rule.sort === 'alpha'
    ? out.sort((a, b) => norm(a.word).localeCompare(norm(b.word)))
    : out.sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999));

  const words = out.map(e => e.word);
  const limited = rule.limit > 0 ? words.slice(0, rule.limit) : words;

  // Manually pinned words join the result after the limit is applied, so a
  // narrow "Top 25" rule can't silently drop one the user explicitly added.
  const already = new Set(limited);
  const validWords = new Set(vocab.map(e => e.word));
  const manual = rule.manualWords.filter(w => validWords.has(w) && !already.has(w));
  return manual.length ? [...limited, ...manual] : limited;
}
