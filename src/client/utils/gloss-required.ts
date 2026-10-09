/**
 * gloss-required.ts — words that must be answered with several meanings.
 *
 * Table mode normally accepts any one gloss, so *dejar* is solved by "let". A
 * word can instead be flagged as needing 2 or 3 different meanings ("let,
 * leave"). The flag is the learner's own — a per-language map word → count,
 * kept beside their lists — and it wins over Settings → Table Quiz → "Meanings
 * to type", which is the same demand applied to every word that has that many.
 */

import { readJson, writeJson, isRecord } from './storage.ts';
import { Settings } from '../settings.ts';

const PREFIX = 'vq_glossreq_';
export const MAX_REQUIRED_MEANINGS = 4;

/** Bumped on every write so a table holding a cached read knows to take a fresh one. */
let version = 0;
export const meaningFlagsVersion = (): number => version;

const keyFor = (lang: string): string => PREFIX + lang.toLowerCase();

function readAll(lang: string): Record<string, number> {
  const raw = readJson<Record<string, unknown>>(keyFor(lang), {}, isRecord);
  const out: Record<string, number> = {};
  for (const [word, n] of Object.entries(raw)) {
    if (typeof n === 'number' && n >= 1 && n <= MAX_REQUIRED_MEANINGS) out[word] = Math.floor(n);
  }
  return out;
}

/** This word's own flag: a count, or null when it follows the Settings default. */
export function getWordMeaningFlag(lang: string, word: string): number | null {
  return readAll(lang)[word] ?? null;
}

/** Flag a word (1 = "any one meaning" even when the setting asks for more), or clear it with null. */
export function setWordMeaningFlag(lang: string, word: string, count: number | null): void {
  const all = readAll(lang);
  if (count === null) delete all[word]; else all[word] = Math.max(1, Math.min(MAX_REQUIRED_MEANINGS, Math.floor(count)));
  writeJson(keyFor(lang), all);
  version++;
}

/** Every flag in `lang`, read once — for a table that asks about every row. */
export function getMeaningFlags(lang: string): Record<string, number> {
  return readAll(lang);
}

/** How many meanings this word's answer should name, before it is capped by how many the word has. */
export function requiredMeaningsFor(flags: Record<string, number>, word: string): number {
  return flags[word] ?? Settings.getRequiredMeanings();
}
