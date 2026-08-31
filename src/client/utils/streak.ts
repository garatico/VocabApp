/**
 * streak.ts — daily activity streak, streak history, and daily goals.
 *
 * The streak itself is global, not per-language — a day studying French
 * keeps the streak alive exactly as well as a day studying Spanish. That's
 * why its keys are bare/un-prefixed (the `vq_mode` / `s_onboarding_seen`
 * precedent) rather than session-history.ts's `vq_history_<lang>` shape:
 * this is app-wide state, not per-language state that happens to share a
 * key scheme.
 *
 * Goals are different, and there can be more than one active at once: a
 * learner may want "50 words/day" overall *and* "10 minutes/day" in the
 * language they're weakest in — see getGoals()/setGoalTarget() below. Each
 * of the three types (words/minutes/streak) has its own target per scope,
 * 0 meaning off; a language with no overrides of its own falls back to the
 * global targets.
 *
 * "Today" is the browser's local calendar date (`toDateString()`), not a
 * rolling 24h window — a streak is about days, and a learner who studies at
 * 11pm and again at 7am the same morning should not lose it.
 */

import { readString, writeString, readJson, writeJson, remove, isStringArray, isRecord } from './storage.ts';

const COUNT_KEY        = 'vq_streak_count';
const BEST_KEY          = 'vq_streak_best';
const LAST_KEY          = 'vq_streak_last_date';
const GOAL_KEY          = 'vq_daily_goal';         // bare = global; `${GOAL_KEY}_<lang>` = per-language override
const PROGRESS_KEY      = 'vq_daily_progress';     // same global/per-language split as GOAL_KEY
const HISTORY_KEY       = 'vq_streak_history';
const GOAL_HISTORY_KEY  = 'vq_streak_goal_history'; // date -> which "scope␟type" goals were hit that day
// ~13 months of daily entries — comfortably covers a year-view calendar with
// headroom, and stays a trivial size (a few KB of JSON) even for a learner
// who's used the app every day for over a year.
const HISTORY_CAP = 400;

interface DailyProgress { date: string; wordsDone: number; secondsDone: number }

function today(): string {
  return new Date().toDateString();
}

function isDailyProgress(v: unknown): v is DailyProgress {
  return isRecord(v)
    && typeof v['date'] === 'string'
    && typeof v['wordsDone'] === 'number';
  // secondsDone is intentionally not required here — a progress record
  // written before it existed reads back with secondsDone defaulted below,
  // rather than being rejected as malformed.
}

export function getStreak(): number {
  return Number(readString(COUNT_KEY, '0'));
}

export function getBestStreak(): number {
  return Number(readString(BEST_KEY, '0'));
}

// ── Streak history ───────────────────────────────────────────────────────

/**
 * Every calendar date (in `today()`'s format) that had at least one recorded
 * session, oldest first — the data a streak calendar needs and the counters
 * above don't carry: `getStreak()` only knows the *current* run's length, not
 * which specific days it covers. Capped at HISTORY_CAP, oldest dropped first.
 */
export function getStreakHistory(): string[] {
  return readJson<string[]>(HISTORY_KEY, [], isStringArray);
}

function recordHistoryDate(dateStr: string): void {
  const hist = getStreakHistory();
  if (hist[hist.length - 1] === dateStr) return;   // already recorded today
  writeJson(HISTORY_KEY, [...hist, dateStr].slice(-HISTORY_CAP));
  // Keep the per-day goal-hit map in step with the same cap — a date that
  // fell off the activity history shouldn't linger on in this second store.
  if (hist.length >= HISTORY_CAP) {
    const evicted = hist[0];
    const map = readJson<Record<string, string[]>>(GOAL_HISTORY_KEY, {}, isRecord);
    if (evicted in map) {
      delete map[evicted];
      writeJson(GOAL_HISTORY_KEY, map);
    }
  }
}

// ── Goals ─────────────────────────────────────────────────────────────────

export type GoalType = 'words' | 'minutes' | 'streak';
const GOAL_TYPES: GoalType[] = ['words', 'minutes', 'streak'];

/** One target per type, 0 = off. All three can be active at once — a
 *  learner isn't limited to picking a single kind of goal. */
export type Goals = Record<GoalType, number>;

const NO_GOALS: Goals = { words: 0, minutes: 0, streak: 0 };

function isGoals(v: unknown): v is Goals {
  return isRecord(v) && GOAL_TYPES.every(t => typeof v[t] === 'number');
}

/** The pre-multi-goal shape: one active type at a time. */
function isLegacySingleGoal(v: unknown): v is { type: GoalType; target: number } {
  return isRecord(v) && typeof v['target'] === 'number' && GOAL_TYPES.includes(v['type'] as GoalType);
}

function goalKey(lang?: string): string {
  return lang ? `${GOAL_KEY}_${lang.toLowerCase()}` : GOAL_KEY;
}

/**
 * A language's own goals if it has any overrides, otherwise the global
 * defaults. Storage has gone through two shapes before this one — a bare
 * numeric string (always a word-count goal), then `{type, target}` (one
 * active type at a time) — both read once and folded into the current
 * `Goals` shape here, the same "old shape read once, new shape written on
 * next save" migration word-lists.ts/presets.ts use elsewhere in this app.
 */
export function getGoals(lang?: string): Goals {
  const key = goalKey(lang);
  const raw = readString(key);
  if (raw === null) return lang ? getGoals() : { ...NO_GOALS };

  const asGoals = readJson<Goals | null>(key, null, isGoals);
  if (asGoals) return asGoals;

  const asLegacy = readJson<{ type: GoalType; target: number } | null>(key, null, isLegacySingleGoal);
  if (asLegacy) return { ...NO_GOALS, [asLegacy.type]: asLegacy.target };

  const legacyNumber = Number(raw);
  return { ...NO_GOALS, words: Number.isFinite(legacyNumber) ? Math.max(0, legacyNumber) : 0 };
}

/**
 * Set one goal type's target, leaving the other two as they are. Reads the
 * *effective* current goals first (own override, or inherited global) as
 * the base — so setting a language's first-ever override (say, minutes)
 * doesn't silently zero out whatever words/streak targets it was already
 * effectively following via the global default.
 */
export function setGoalTarget(type: GoalType, target: number, lang?: string): void {
  const goals = getGoals(lang);
  goals[type] = Math.max(0, Math.round(target));
  writeJson(goalKey(lang), goals);
}

/** True if `lang` has its own goals (as opposed to following global for everything). */
export function hasLanguageGoal(lang: string): boolean {
  return readString(goalKey(lang)) !== null;
}

/** Revert a language to following the global defaults for every goal type. */
export function clearLanguageGoal(lang: string): void {
  remove(goalKey(lang));
}

// ── Progress ──────────────────────────────────────────────────────────────

function progressKey(lang?: string): string {
  return lang ? `${PROGRESS_KEY}_${lang.toLowerCase()}` : PROGRESS_KEY;
}

function readProgress(lang?: string): DailyProgress {
  const p = readJson<DailyProgress>(
    progressKey(lang), { date: today(), wordsDone: 0, secondsDone: 0 }, isDailyProgress,
  );
  if (p.date !== today()) return { date: today(), wordsDone: 0, secondsDone: 0 };
  return { date: p.date, wordsDone: p.wordsDone, secondsDone: p.secondsDone ?? 0 };
}

/** Words answered so far today (resets automatically once the date rolls over).
 *  Global by default; pass a language to read that language's own progress. */
export function getTodayProgress(lang?: string): number {
  return readProgress(lang).wordsDone;
}

/** Minutes practiced so far today, rounded down — same date/lang scoping as getTodayProgress. */
export function getTodayMinutes(lang?: string): number {
  return Math.floor(readProgress(lang).secondsDone / 60);
}

function writeProgress(lang: string | undefined, wordsCorrect: number, seconds: number): DailyProgress {
  const prev = readProgress(lang);
  const next: DailyProgress = {
    date: today(),
    wordsDone:   prev.wordsDone + Math.max(0, wordsCorrect),
    secondsDone: prev.secondsDone + Math.max(0, seconds),
  };
  writeJson(progressKey(lang), next);
  return next;
}

/** True the moment `next` first reaches `target`, given `prev` hadn't yet. */
function typeJustHit(
  type: GoalType, target: number, prev: DailyProgress, next: DailyProgress,
  streak: number, streakIncrementedJustNow: boolean,
): boolean {
  if (target <= 0) return false;
  if (type === 'words')   return prev.wordsDone < target && next.wordsDone >= target;
  if (type === 'minutes') {
    const prevMin = Math.floor(prev.secondsDone / 60);
    const nextMin = Math.floor(next.secondsDone / 60);
    return prevMin < target && nextMin >= target;
  }
  // 'streak' — binary per day: hit exactly on the day the streak count
  // crosses the target, not "every session while it stays there".
  return streakIncrementedJustNow && streak >= target;
}

// ── Per-day goal-hit history (for the calendar) ─────────────────────────────
//
// "scope␟type" strings, scope '' for global or a language name — mirrors
// word-lists.ts's qualified-name convention (reserved separator character
// nothing typed into this app would ever contain) rather than inventing a
// second one.

const SCOPE_SEP = '␟';

function hitKey(scope: string, type: GoalType): string {
  return `${scope}${SCOPE_SEP}${type}`;
}

/** Parse a hitKey() string back into its scope ('' = global) and type. */
export function parseHitKey(key: string): { scope: string; type: GoalType } {
  const i = key.indexOf(SCOPE_SEP);
  return { scope: key.slice(0, i), type: key.slice(i + 1) as GoalType };
}

/** Every "scope␟type" goal hit recorded for `dateStr` (today() format). */
export function getGoalHitsForDate(dateStr: string): string[] {
  const map = readJson<Record<string, string[]>>(GOAL_HISTORY_KEY, {}, isRecord);
  return map[dateStr] ?? [];
}

function recordGoalHit(scope: string, type: GoalType): void {
  const map = readJson<Record<string, string[]>>(GOAL_HISTORY_KEY, {}, isRecord);
  const day = today();
  const key = hitKey(scope, type);
  const existing = map[day] ?? [];
  if (existing.includes(key)) return;
  map[day] = [...existing, key];
  writeJson(GOAL_HISTORY_KEY, map);
}

/** Check every type for one scope's goals against its progress, recording
 *  (and collecting) whichever ones were just newly hit. */
function checkAndRecordHits(
  scope: string, goals: Goals, prev: DailyProgress, next: DailyProgress,
  streak: number, streakIncrementedJustNow: boolean,
): string[] {
  const hit: string[] = [];
  for (const type of GOAL_TYPES) {
    if (typeJustHit(type, goals[type], prev, next, streak, streakIncrementedJustNow)) {
      recordGoalHit(scope, type);
      hit.push(hitKey(scope, type));
    }
  }
  return hit;
}

export interface ActivityResult {
  streak:                   number;
  streakIncrementedJustNow: boolean;
  /** True if any goal (any type, global or the session's language) was
   *  newly hit this call — what the celebration toast fires on. */
  goalHitJustNow:           boolean;
  /** Which ones, as "scope␟type" strings (parseHitKey to read) — for a
   *  caller that wants to say which goal(s), not just that one fired. */
  goalsHitJustNow:          string[];
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
 * Fold a finished session into the streak, streak history and daily goals.
 *
 * Called once per saved session (see session-history.ts's saveSession) —
 * any quiz activity in any language counts toward the (global) streak.
 * `wordsCorrect` should be the session's *correct* count, not its size — a
 * quiz started and abandoned early (Give Up) still reports a `total` equal
 * to the whole batch requested, which would otherwise credit the goal with
 * words never actually answered. `seconds` is the session's elapsed time,
 * for a minutes-based goal.
 */
export function recordActivity(lang: string, wordsCorrect: number, seconds: number): ActivityResult {
  const now = today();

  // ── Streak (global) ─────────────────────────────────────────────────────
  recordHistoryDate(now);
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

  // ── Progress — always update both the global total and this language's
  //    own, so both scopes' goals are checked against current numbers. ────
  const prevGlobal = readProgress(undefined);
  const nextGlobal = writeProgress(undefined, wordsCorrect, seconds);
  const prevLang   = readProgress(lang);
  const nextLang   = writeProgress(lang, wordsCorrect, seconds);

  // ── Daily goals — global scope and this session's language, each checked
  //    against their own (own-or-inherited) targets and own progress. When
  //    the language has no override it inherits the same targets as global,
  //    so the two scopes can both record a hit off the same numbers — which
  //    is correct: that language's activity is what drove the global total
  //    over the line too. ───────────────────────────────────────────────────
  const globalHits = checkAndRecordHits('', getGoals(), prevGlobal, nextGlobal, streak, streakIncrementedJustNow);
  const langHits   = checkAndRecordHits(lang, getGoals(lang), prevLang, nextLang, streak, streakIncrementedJustNow);
  const goalsHitJustNow = [...globalHits, ...langHits];

  const result: ActivityResult = {
    streak, streakIncrementedJustNow,
    goalHitJustNow: goalsHitJustNow.length > 0,
    goalsHitJustNow,
  };
  listeners.forEach(cb => cb(result));
  return result;
}
