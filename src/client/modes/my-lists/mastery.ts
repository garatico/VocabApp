/**
 * mastery.ts — which words the learner already knows.
 *
 * Mastery is per *word*, per language — not per list.
 *
 * It used to be keyed by list name (`vq_mastery_<lang>_<list>`), which meant
 * the same word could be mastered in one list and not in another, renaming a
 * list silently wiped its progress, and deleting one leaked the key. Knowing a
 * word is a fact about the word, so it is now a single set per language and
 * those problems stop existing rather than needing to be handled.
 *
 * This module is imported by the quiz modes as well as by My Lists, so it holds
 * no DOM and no panel state.
 */

import { logger } from '../../utils/logger.ts';

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
export function migrateMastery(lang: string): void {
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

export function getMastered(lang: string): Set<string> {
  try {
    const raw = localStorage.getItem(masteryKey(lang));
    return new Set(raw ? JSON.parse(raw) : []);
  } catch { return new Set(); }
}

export function saveMastered(lang: string, mastered: Set<string>): void {
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
