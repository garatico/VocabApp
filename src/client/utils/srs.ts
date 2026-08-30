/**
 * srs.ts — a Leitner-box schedule for "what's due today", per language.
 *
 * `session-history.ts`'s `missCount`/`quizStrength` already say how a word
 * has gone; this answers a different question — *when* to show it again.
 * Every correct answer moves a word up a box (further out); a miss drops it
 * straight back to box 0 (due again immediately). It is deliberately its own
 * module rather than a field bolted onto mastery.ts or the miss tally: mastery
 * is the learner's own yes/no belief, misses are a decaying struggle counter,
 * and this is neither — a word can be freshly learned (box 0, due today) or
 * long mastered (box 5, due in a month) independent of both.
 *
 * Fed from the same place recordOutcome() already is (session-history.ts),
 * not from each quiz mode individually — one call site, same reasoning as
 * that file's own header comment about two copies of a storage rule.
 */

import { readJson, writeJson, remove as removeKey, isRecord } from './storage.ts';

export interface SrsEntry {
  box:    number; // 0..MAX_BOX
  dueAt:  number; // epoch ms
}

type SrsState = Record<string, SrsEntry>;

const SRS_PREFIX = 'vq_srs_';

/** Days to wait at each box before showing the word again. Index = box. */
export const BOX_INTERVAL_DAYS = [0, 1, 3, 7, 14, 30] as const;
export const MAX_BOX = BOX_INTERVAL_DAYS.length - 1;

const DAY_MS = 24 * 60 * 60 * 1000;

function srsKey(lang: string): string {
  return SRS_PREFIX + lang.toLowerCase();
}

function isSrsState(v: unknown): v is SrsState {
  if (!isRecord(v)) return false;
  return Object.values(v).every(e =>
    isRecord(e) && typeof e.box === 'number' && typeof e.dueAt === 'number');
}

function getState(lang: string): SrsState {
  return readJson<SrsState>(srsKey(lang), {}, isSrsState);
}

function saveState(lang: string, state: SrsState): void {
  writeJson(srsKey(lang), state);
}

/**
 * Fold a finished session's outcomes into the schedule.
 *
 * Same shape as session-history.ts's recordOutcome() and called from inside
 * it, on the same missed/correct sets — a word that appears in both (missed
 * earlier in a session, gotten right later) is treated as correct: the more
 * recent outcome is the one worth scheduling from.
 */
export function bumpSrs(lang: string, missed: Iterable<string>, correct: Iterable<string> = []): void {
  const state = getState(lang);
  const now = Date.now();

  for (const w of missed) {
    state[w] = { box: 0, dueAt: now };
  }
  for (const w of correct) {
    const prev = state[w];
    // A word never quizzed before starts from the same baseline as one
    // already at box 0, so a first-ever correct answer promotes it exactly
    // like any other box-0-to-box-1 transition.
    const box = Math.min((prev?.box ?? 0) + 1, MAX_BOX);
    state[w] = { box, dueAt: now + BOX_INTERVAL_DAYS[box] * DAY_MS };
  }

  saveState(lang, state);
}

/** This word's box/dueAt, or null if it has never been quizzed. */
export function srsEntry(lang: string, word: string): SrsEntry | null {
  return getState(lang)[word] ?? null;
}

/** Words due now or overdue, most-overdue first. A word never quizzed is not due. */
export function srsDueWords(lang: string, now = Date.now()): string[] {
  return Object.entries(getState(lang))
    .filter(([, e]) => e.dueAt <= now)
    .sort((a, b) => a[1].dueAt - b[1].dueAt)
    .map(([w]) => w);
}

export function srsDueCount(lang: string, now = Date.now()): number {
  return srsDueWords(lang, now).length;
}

export function clearSrs(lang: string): void {
  removeKey(srsKey(lang));
}
