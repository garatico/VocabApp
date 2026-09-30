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

import { readJson, writeJson, remove as removeKey, isRecord, isStringArray } from './storage.ts';
import { Settings, DUE_HARD_CAP } from '../settings.ts';

export interface SrsEntry {
  box:    number; // 0..MAX_BOX
  dueAt:  number; // epoch ms
  /**
   * How easy this particular word has been for this learner, as a multiplier
   * on the box's interval (1 = the plain Leitner schedule). Absent on entries
   * written before this existed — read as 1, so old data schedules exactly as
   * it always did. See nextEase().
   */
  ease?:  number;
}

export const MIN_EASE = 0.7;
export const MAX_EASE = 2.0;

/**
 * Ease after an outcome. A miss costs more than a success earns (the usual
 * SM-2 asymmetry), so a word that keeps slipping is seen more often than the
 * bare box would say, and one that never slips drifts out further.
 */
export function nextEase(prev: number | undefined, correct: boolean): number {
  const e = (prev ?? 1) + (correct ? 0.05 : -0.15);
  return Math.min(MAX_EASE, Math.max(MIN_EASE, Math.round(e * 100) / 100));
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
    isRecord(e) && typeof e.box === 'number' && typeof e.dueAt === 'number'
    && (e.ease === undefined || typeof e.ease === 'number'));
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
    state[w] = { box: 0, dueAt: now, ease: nextEase(state[w]?.ease, false) };
  }
  for (const w of correct) {
    const prev = state[w];
    // A word never quizzed before starts from the same baseline as one
    // already at box 0, so a first-ever correct answer promotes it exactly
    // like any other box-0-to-box-1 transition.
    const box  = Math.min((prev?.box ?? 0) + 1, MAX_BOX);
    const ease = nextEase(prev?.ease, true);
    // Box 1 is the fixed first step; ease scales only the boxes after it, so a
    // single lucky answer on a new word can't push its first review around.
    const interval = BOX_INTERVAL_DAYS[box] * (box >= 2 ? ease : 1);
    state[w] = { box, dueAt: now + interval * DAY_MS, ease };
  }

  saveState(lang, state);
}

/** This word's box/dueAt, or null if it has never been quizzed. */
export function srsEntry(lang: string, word: string): SrsEntry | null {
  return getState(lang)[word] ?? null;
}

/** Every scheduled word for a language — for summaries that need the whole picture. */
export function srsAllEntries(lang: string): Readonly<Record<string, SrsEntry>> {
  return getState(lang);
}

/** Words due now or overdue, most-overdue first. A word never quizzed is not
 *  due, and neither is one marked exempt (see setDueExempt) — it still keeps
 *  its box/ease and can still be quizzed on demand, it just never surfaces as
 *  "due" (the header badge, History's Due for Review, a Smart List's `due:
 *  'yes'` rule). The exemption set itself is ignored entirely while
 *  Settings.getDueExemptEnabled() is off — the master switch, not a delete —
 *  so a word marked exempt earlier resumes being excluded the moment it's
 *  switched back on, rather than having to be re-marked one by one.
 *
 *  Nothing is due at all while Settings.getDueEnabled() is off, and the list
 *  is cut to the learner's soft cap (never past DUE_HARD_CAP) — the
 *  most-overdue words first, the rest simply wait their turn. */
export function srsDueWords(lang: string, now = Date.now()): string[] {
  if (!Settings.getDueEnabled()) return [];
  const exempt = Settings.getDueExemptEnabled() ? getDueExempt(lang) : null;
  const cap = Math.min(Settings.getDueSoftCap(), DUE_HARD_CAP);
  return Object.entries(getState(lang))
    .filter(([w, e]) => e.dueAt <= now && !exempt?.has(w))
    .sort((a, b) => a[1].dueAt - b[1].dueAt)
    .slice(0, cap)
    .map(([w]) => w);
}

/** Rescue for a runaway backlog: every word that is overdue keeps its box and
 *  ease but is rescheduled, the most overdue first, in batches of the soft cap
 *  — one batch tomorrow, the next the day after, and so on — so the backlog
 *  drips back at a pace that can be studied instead of coming back at once.
 *  Ignores the exemption set and the on/off switch: it works on the schedule
 *  itself. Returns how many words were moved. */
export function spreadOverdueSrs(lang: string, now = Date.now()): number {
  const state = getState(lang);
  const overdue = Object.entries(state)
    .filter(([, e]) => e.dueAt <= now)
    .sort((a, b) => a[1].dueAt - b[1].dueAt);
  if (overdue.length === 0) return 0;
  const batch = Math.min(Settings.getDueSoftCap(), DUE_HARD_CAP);
  overdue.forEach(([w, e], i) => {
    state[w] = { ...e, dueAt: now + (1 + Math.floor(i / batch)) * DAY_MS };
  });
  saveState(lang, state);
  return overdue.length;
}

export function srsDueCount(lang: string, now = Date.now()): number {
  return srsDueWords(lang, now).length;
}

export function clearSrs(lang: string): void {
  removeKey(srsKey(lang));
}

// ── "Is Due" exemption ───────────────────────────────────────────────────────
//
// A separate, additive key per language (same pattern as mastery.ts's own
// per-language Set) rather than a field on SrsEntry — a word can be exempted
// before it has ever been quizzed (no SrsEntry yet), and exemption has
// nothing to do with the schedule itself, only with whether it's *surfaced*.

const DUE_EXEMPT_PREFIX = 'vq_srs_exempt_';

function dueExemptKey(lang: string): string {
  return DUE_EXEMPT_PREFIX + lang.toLowerCase();
}

export function getDueExempt(lang: string): Set<string> {
  return new Set(readJson<string[]>(dueExemptKey(lang), [], isStringArray));
}

export function isDueExempt(lang: string, word: string): boolean {
  return getDueExempt(lang).has(word);
}

export function setDueExempt(lang: string, word: string, exempt: boolean): void {
  const words = getDueExempt(lang);
  if (exempt) words.add(word); else words.delete(word);
  writeJson(dueExemptKey(lang), [...words]);
}
