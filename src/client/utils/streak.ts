/**
 * streak.ts — daily activity streak and a daily word-count goal.
 *
 * Global, not per-language — a day studying French keeps the streak alive
 * exactly as well as a day studying Spanish. That's why this uses bare,
 * un-prefixed keys (the `vq_mode` / `s_onboarding_seen` precedent) rather
 * than session-history.ts's `vq_history_<lang>` shape: this is app-wide
 * state, not per-language state that happens to share a key scheme.
 *
 * "Today" is the browser's local calendar date (`toDateString()`), not a
 * rolling 24h window — a streak is about days, and a learner who studies at
 * 11pm and again at 7am the same morning should not lose it.
 */

import { readString, writeString, readJson, writeJson } from './storage.ts';

const COUNT_KEY = 'vq_streak_count';
const BEST_KEY  = 'vq_streak_best';
const LAST_KEY  = 'vq_streak_last_date';
const GOAL_KEY  = 'vq_daily_goal';       // 0 = no goal set
const PROGRESS_KEY = 'vq_daily_progress';

interface DailyProgress { date: string; wordsDone: number }

function today(): string {
  return new Date().toDateString();
}

function isDailyProgress(v: unknown): v is DailyProgress {
  return typeof v === 'object' && v !== null
    && typeof (v as DailyProgress).date === 'string'
    && typeof (v as DailyProgress).wordsDone === 'number';
}

export function getStreak(): number {
  return Number(readString(COUNT_KEY, '0'));
}

export function getBestStreak(): number {
  return Number(readString(BEST_KEY, '0'));
}

export function getDailyGoal(): number {
  return Number(readString(GOAL_KEY, '0'));
}

export function setDailyGoal(n: number): void {
  writeString(GOAL_KEY, String(Math.max(0, Math.round(n))));
}

/** Words answered so far today (resets automatically once the date rolls over). */
export function getTodayProgress(): number {
  const p = readJson<DailyProgress>(PROGRESS_KEY, { date: today(), wordsDone: 0 }, isDailyProgress);
  return p.date === today() ? p.wordsDone : 0;
}

export interface ActivityResult {
  streak:                   number;
  streakIncrementedJustNow: boolean;
  goalHitJustNow:           boolean;
}

// ── Subscribers ───────────────────────────────────────────────────────────
//
// recordActivity() is called from inside session-history.ts's saveSession(),
// which every quiz mode already shares — but showing a celebration toast is
// a UI concern that file has no business knowing about. app.ts subscribes
// once at startup instead, so the mode that happened to end a session never
// needs its own toast-firing logic.

type ActivityListener = (r: ActivityResult) => void;
const listeners: ActivityListener[] = [];

export function onActivity(cb: ActivityListener): void {
  listeners.push(cb);
}

/**
 * Fold a finished session into the streak and daily goal.
 *
 * Called once per saved session (see session-history.ts's saveSession),
 * regardless of language or mode — any quiz activity counts toward the
 * streak. `wordsCorrect` should be the session's *correct* count, not its
 * size — a quiz started and abandoned early (Give Up) still reports a
 * `total` equal to the whole batch requested, which would otherwise credit
 * the goal with words never actually answered.
 */
export function recordActivity(wordsCorrect: number): ActivityResult {
  const now = today();

  // ── Streak ──────────────────────────────────────────────────────────────
  const lastDate = readString(LAST_KEY);
  let streak = getStreak();
  let streakIncrementedJustNow = false;

  if (lastDate !== now) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    streak = lastDate === yesterday.toDateString() ? streak + 1 : 1;
    streakIncrementedJustNow = true;
    writeString(LAST_KEY, now);
    writeString(COUNT_KEY, String(streak));
    if (streak > getBestStreak()) writeString(BEST_KEY, String(streak));
  }

  // ── Daily goal progress ─────────────────────────────────────────────────
  const prevProgress = getTodayProgress();
  const nextProgress = prevProgress + Math.max(0, wordsCorrect);
  writeJson(PROGRESS_KEY, { date: now, wordsDone: nextProgress });

  const goal = getDailyGoal();
  const goalHitJustNow = goal > 0 && prevProgress < goal && nextProgress >= goal;

  const result: ActivityResult = { streak, streakIncrementedJustNow, goalHitJustNow };
  listeners.forEach(cb => cb(result));
  return result;
}
