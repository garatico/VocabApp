/**
 * known-words.ts
 *
 * Persists the user's "known" word set in localStorage, keyed per language.
 * A "known" word is one the user has explicitly marked as mastered so it can
 * be hidden from future quizzes.
 *
 * Storage key: `vq_known_<lang>`  (e.g. vq_known_spanish)
 * Storage value: JSON array of word strings.
 */

const PREFIX = 'vq_known_';

function storageKey(lang: string): string {
  return PREFIX + lang.toLowerCase();
}

function loadSet(lang: string): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey(lang));
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function saveSet(lang: string, set: Set<string>): void {
  try {
    localStorage.setItem(storageKey(lang), JSON.stringify([...set]));
  } catch {
    // storage full or unavailable — silently ignore
  }
}

export function markKnown(lang: string, word: string): void {
  const set = loadSet(lang);
  set.add(word);
  saveSet(lang, set);
}

export function unmarkKnown(lang: string, word: string): void {
  const set = loadSet(lang);
  set.delete(word);
  saveSet(lang, set);
}

export function isKnown(lang: string, word: string): boolean {
  return loadSet(lang).has(word);
}

export function getKnownCount(lang: string): number {
  return loadSet(lang).size;
}

export function getKnownWords(lang: string): Set<string> {
  return loadSet(lang);
}
