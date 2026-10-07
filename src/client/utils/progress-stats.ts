/**
 * progress-stats.ts — pure numbers behind the History tab's Progress panel.
 *
 * No DOM and no storage reads: every function takes the data it summarises, so
 * each is testable with a literal. The panel (modes/history-progress.ts) does
 * the fetching and drawing.
 */

import { BANDS, type Band } from '../data/bands.ts';

const DAY_MS = 24 * 60 * 60 * 1000;

// ── Review forecast ──────────────────────────────────────────────────────────

/**
 * How many reviews fall due on each of the next `days` days.
 *
 * Index 0 is "today and everything overdue" — that is the pile the learner
 * actually faces on opening the app, so overdue words are not a separate bar.
 * Day boundaries are `now`-relative 24h windows rather than calendar midnights,
 * which is what the schedule itself uses (dueAt = now + N days).
 */
export function reviewForecast(
  dueAts: readonly number[], now: number, days = 7,
): number[] {
  const out = new Array<number>(days).fill(0);
  for (const at of dueAts) {
    const day = Math.max(0, Math.floor((at - now) / DAY_MS));
    if (at <= now) out[0]++;
    else if (day < days) out[day]++;
  }
  return out;
}

// ── CEFR coverage ────────────────────────────────────────────────────────────

export interface BandCoverage { band: Band; learned: number; total: number }

/**
 * Per-band count of words the learner has actually learned, out of the words
 * that band holds. Words with no band (custom words with no rank) are left out
 * rather than invented into A1.
 */
export function bandCoverage(
  vocab: readonly { word: string; band: string | null }[],
  learned: ReadonlySet<string>,
): BandCoverage[] {
  const rows = new Map<Band, BandCoverage>(BANDS.map(b => [b, { band: b, learned: 0, total: 0 }]));
  for (const v of vocab) {
    const row = v.band ? rows.get(v.band as Band) : undefined;
    if (!row) continue;
    row.total++;
    if (learned.has(v.word)) row.learned++;
  }
  return [...rows.values()];
}

/** A word counts as learned once it has survived a few review steps or been marked mastered. */
export const LEARNED_BOX = 2;

// ── Accuracy per mode ────────────────────────────────────────────────────────

export interface ModeAccuracy { mode: string; sessions: number; correct: number; total: number; pct: number }

/** Accuracy per quiz mode over sessions at or after `sinceMs`; busiest mode first. */
export function modeAccuracy(
  sessions: readonly { at: string; mode: string; correct: number; total: number }[],
  sinceMs: number,
): ModeAccuracy[] {
  const by = new Map<string, ModeAccuracy>();
  for (const s of sessions) {
    if (Date.parse(s.at) < sinceMs) continue;
    const row = by.get(s.mode) ?? { mode: s.mode, sessions: 0, correct: 0, total: 0, pct: 0 };
    row.sessions++; row.correct += s.correct; row.total += s.total;
    by.set(s.mode, row);
  }
  const rows = [...by.values()].filter(r => r.total > 0);
  rows.forEach(r => { r.pct = Math.round((r.correct / r.total) * 100); });
  return rows.sort((a, b) => b.sessions - a.sessions);
}

// ── Activity calendar ────────────────────────────────────────────────────────

/**
 * The last `weeks` weeks as a column-per-week grid of booleans (Sunday-first
 * rows), marking which dates had activity. `activeDates` are local calendar
 * dates as streak.ts records them — `Date#toDateString()`, "Wed Oct 07 2026".
 * This used to expect YYYY-MM-DD and split `today` on "-", which that format
 * doesn't have: every date was invalid and the History calendar always empty.
 * Days after `today` in the final week are null so the grid stays rectangular.
 */
export function activityGrid(
  activeDates: readonly string[], today: Date, weeks = 12,
): (boolean | null)[][] {
  const active = new Set(activeDates);
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const start = new Date(end);
  start.setDate(end.getDate() - end.getDay() - (weeks - 1) * 7);

  const grid: (boolean | null)[][] = [];
  for (let w = 0; w < weeks; w++) {
    const col: (boolean | null)[] = [];
    for (let r = 0; r < 7; r++) {
      const day = new Date(start);
      day.setDate(start.getDate() + w * 7 + r);
      if (day > end) { col.push(null); continue; }
      col.push(active.has(day.toDateString()));
    }
    grid.push(col);
  }
  return grid;
}
