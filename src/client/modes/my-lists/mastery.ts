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

import { readJson, writeJson, remove as removeKey, keys as storageKeys, isStringArray, isNumberRecord }
  from '../../utils/storage.ts';
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

  const legacyKeys = storageKeys().filter(k => {
    const m = LEGACY_MASTERY_RE.exec(k);
    return m !== null && m[1] === lang;
  });
  if (legacyKeys.length === 0) return;

  const merged = getMastered(lang);
  for (const k of legacyKeys) {
    // A corrupt legacy key reads as empty rather than failing the page.
    readJson<string[]>(k, [], isStringArray).forEach(w => merged.add(w));
    removeKey(k);
  }
  saveMastered(lang, merged);
  logger.info(`mastery: merged ${legacyKeys.length} per-list key(s) into ${masteryKey(lang)}`);
}

export function getMastered(lang: string): Set<string> {
  return new Set(readJson<string[]>(masteryKey(lang), [], isStringArray));
}

export function saveMastered(lang: string, mastered: Set<string>): void {
  writeJson(masteryKey(lang), [...mastered]);
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

// ── User mastery scale ───────────────────────────────────────────────────────
//
// A single Set (above) only ever answers "known or not". This is the same
// idea widened to a scale the learner sets themselves — how well *they*
// think they know a word, as opposed to quizStrength() in session-history.ts,
// which is what quizzes have actually shown.
//
// Kept as a second, additive key rather than replacing the Set: every
// existing reader of getMastered() (Hide Mastered, Smart Lists, backup/
// restore) only needs "is this word done", so setMasteryLevel() keeps that
// Set in sync rather than teaching all of them about a 0–4 scale too.

export const MASTERY_LEVELS = ['New', 'Learning', 'Familiar', 'Confident', 'Mastered'] as const;
export const MAX_MASTERY_LEVEL = MASTERY_LEVELS.length - 1;

function masteryLevelKey(lang: string): string {
  return `vq_mastery_scale_${lang}`;
}

export function getMasteryLevels(lang: string): Record<string, number> {
  return readJson<Record<string, number>>(masteryLevelKey(lang), {}, isNumberRecord);
}

function saveMasteryLevels(lang: string, levels: Record<string, number>): void {
  writeJson(masteryLevelKey(lang), levels);
}

/**
 * A word's level, 0–MAX_MASTERY_LEVEL. Falls back to the legacy boolean set
 * for a word that has never been given an explicit level, so turning this on
 * doesn't reset everyone's prior "mastered" marks back to New.
 */
export function getMasteryLevel(lang: string, word: string): number {
  const levels = getMasteryLevels(lang);
  if (word in levels) return levels[word];
  return getMastered(lang).has(word) ? MAX_MASTERY_LEVEL : 0;
}

export function setMasteryLevel(lang: string, word: string, level: number): void {
  const clamped = Math.max(0, Math.min(MAX_MASTERY_LEVEL, level));
  const levels = getMasteryLevels(lang);
  levels[word] = clamped;
  saveMasteryLevels(lang, levels);

  const m = getMastered(lang);
  if (clamped >= MAX_MASTERY_LEVEL) m.add(word); else m.delete(word);
  saveMastered(lang, m);
}
