/**
 * swear-words.ts — a curated per-language blocklist for the "Filter swear
 * words" setting (settings.ts's getSwearFilterEnabled).
 *
 * The vocabulary database has no register value for this (see
 * `linguistic.register`: formal/informal/colloquial/literary/technical —
 * nothing marks a word vulgar) and this app doesn't build its own data — see
 * CLAUDE.md — so there's nothing upstream to read a flag from. This is a
 * plain client-side list instead: not exhaustive, just the common cases,
 * matched case/accent-insensitively (see `isSwearWord`).
 *
 * Only Spanish has a real list so far, matching how the rest of the app's
 * "basics" content (trivia-questions.ts) started with one language before
 * expanding. An empty array for any other language just means the filter is
 * a no-op there for now, not an error.
 */

import { stripDiacritics } from '../utils/match.ts';

const SPANISH_SWEAR_WORDS = [
  'mierda', 'joder', 'cabron', 'cabrón', 'coño', 'puta', 'puto',
  'pendejo', 'pendeja', 'gilipollas', 'hostia', 'carajo', 'chinga',
  'chingar', 'verga', 'culero', 'maricon', 'maricón', 'cagar',
];

const SWEAR_WORDS: Record<string, string[]> = {
  spanish:    SPANISH_SWEAR_WORDS,
  portuguese: [],
  italian:    [],
  french:     [],
  german:     [],
  dutch:      [],
};

function foldWord(s: string): string {
  return stripDiacritics(String(s || '').toLowerCase().trim());
}

/** Built lazily, once per language, from the arrays above. */
const foldedSets = new Map<string, Set<string>>();

function setFor(lang: string): Set<string> {
  let set = foldedSets.get(lang);
  if (!set) {
    set = new Set((SWEAR_WORDS[lang] ?? []).map(foldWord));
    foldedSets.set(lang, set);
  }
  return set;
}

/** Case/accent-insensitive check against the list for `lang`. */
export function isSwearWord(lang: string, word: string): boolean {
  return setFor(lang).has(foldWord(word));
}
