/**
 * streak.test.ts — daily streak and goal tracking (src/client/utils/streak.ts).
 *
 * Node environment with an in-memory localStorage stub, same pattern as
 * session-history.test.ts. Date.now()/`new Date()` are mocked per-test via
 * vi.setSystemTime so "today"/"yesterday" are under test control.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const store = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem:    (k: string) => store.get(k) ?? null,
  setItem:    (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  clear:      () => { store.clear(); },
  get length() { return store.size; },
  key: (i: number) => [...store.keys()][i] ?? null,
};

const {
  recordActivity, getStreak, getBestStreak, getDailyGoal, setDailyGoal,
  getTodayProgress, onActivity,
} = await import('../../src/client/utils/streak.js');

const DAY = 24 * 60 * 60 * 1000;
const DAY_ONE = new Date('2026-01-01T09:00:00').getTime();

beforeEach(() => {
  store.clear();
  vi.useFakeTimers();
  vi.setSystemTime(DAY_ONE);
});

afterEach(() => vi.useRealTimers());

describe('recordActivity — streak', () => {
  it('starts a streak at 1 on the first-ever session', () => {
    const r = recordActivity(10);
    expect(r.streak).toBe(1);
    expect(r.streakIncrementedJustNow).toBe(true);
    expect(getStreak()).toBe(1);
  });

  it('does not increment again for a second session the same day', () => {
    recordActivity(10);
    const r = recordActivity(5);
    expect(r.streak).toBe(1);
    expect(r.streakIncrementedJustNow).toBe(false);
  });

  it('increments on consecutive calendar days', () => {
    recordActivity(10);
    vi.setSystemTime(DAY_ONE + DAY);
    const r = recordActivity(10);
    expect(r.streak).toBe(2);
    expect(r.streakIncrementedJustNow).toBe(true);
  });

  it('resets to 1 after a missed day', () => {
    recordActivity(10);
    vi.setSystemTime(DAY_ONE + DAY);
    recordActivity(10);
    vi.setSystemTime(DAY_ONE + 3 * DAY); // skipped a day
    const r = recordActivity(10);
    expect(r.streak).toBe(1);
  });

  it('tracks the best streak independent of the current one resetting', () => {
    recordActivity(10);
    vi.setSystemTime(DAY_ONE + DAY);
    recordActivity(10);
    vi.setSystemTime(DAY_ONE + DAY * 2);
    recordActivity(10);
    expect(getBestStreak()).toBe(3);

    vi.setSystemTime(DAY_ONE + DAY * 10); // big gap, streak resets to 1
    recordActivity(10);
    expect(getStreak()).toBe(1);
    expect(getBestStreak()).toBe(3);
  });
});

describe('recordActivity — daily goal', () => {
  it('goalHitJustNow is false with no goal set', () => {
    expect(getDailyGoal()).toBe(0);
    const r = recordActivity(1000);
    expect(r.goalHitJustNow).toBe(false);
  });

  it('fires exactly once, the session that crosses the goal', () => {
    setDailyGoal(25);
    let r = recordActivity(20);
    expect(r.goalHitJustNow).toBe(false);
    expect(getTodayProgress()).toBe(20);

    r = recordActivity(10); // crosses 25
    expect(r.goalHitJustNow).toBe(true);
    expect(getTodayProgress()).toBe(30);

    r = recordActivity(10); // already past goal
    expect(r.goalHitJustNow).toBe(false);
  });

  it('resets progress on a new day', () => {
    setDailyGoal(25);
    recordActivity(30);
    expect(getTodayProgress()).toBe(30);

    vi.setSystemTime(DAY_ONE + DAY);
    expect(getTodayProgress()).toBe(0);
    const r = recordActivity(30);
    expect(r.goalHitJustNow).toBe(true); // crosses again, fresh day
  });
});

describe('onActivity', () => {
  it('notifies subscribers with the same result recordActivity returns', () => {
    const seen: unknown[] = [];
    onActivity(r => seen.push(r));
    const r = recordActivity(5);
    expect(seen).toEqual([r]);
  });
});
