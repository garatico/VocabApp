/**
 * streak.test.ts — daily streak, streak history, and goal tracking
 * (src/client/utils/streak.ts).
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
  recordActivity, getStreak, getBestStreak, getGoals, setGoalTarget,
  hasLanguageGoal, clearLanguageGoal,
  getTodayProgress, getTodayMinutes, getStreakHistory,
  getGoalHitsForDate, parseHitKey, onActivity,
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
    const r = recordActivity('spanish', 10, 60);
    expect(r.streak).toBe(1);
    expect(r.streakIncrementedJustNow).toBe(true);
    expect(getStreak()).toBe(1);
  });

  it('does not increment again for a second session the same day', () => {
    recordActivity('spanish', 10, 60);
    const r = recordActivity('spanish', 5, 60);
    expect(r.streak).toBe(1);
    expect(r.streakIncrementedJustNow).toBe(false);
  });

  it('increments on consecutive calendar days', () => {
    recordActivity('spanish', 10, 60);
    vi.setSystemTime(DAY_ONE + DAY);
    const r = recordActivity('spanish', 10, 60);
    expect(r.streak).toBe(2);
    expect(r.streakIncrementedJustNow).toBe(true);
  });

  it('resets to 1 after a missed day', () => {
    recordActivity('spanish', 10, 60);
    vi.setSystemTime(DAY_ONE + DAY);
    recordActivity('spanish', 10, 60);
    vi.setSystemTime(DAY_ONE + 3 * DAY); // skipped a day
    const r = recordActivity('spanish', 10, 60);
    expect(r.streak).toBe(1);
  });

  it('tracks the best streak independent of the current one resetting', () => {
    recordActivity('spanish', 10, 60);
    vi.setSystemTime(DAY_ONE + DAY);
    recordActivity('spanish', 10, 60);
    vi.setSystemTime(DAY_ONE + DAY * 2);
    recordActivity('spanish', 10, 60);
    expect(getBestStreak()).toBe(3);

    vi.setSystemTime(DAY_ONE + DAY * 10); // big gap, streak resets to 1
    recordActivity('spanish', 10, 60);
    expect(getStreak()).toBe(1);
    expect(getBestStreak()).toBe(3);
  });
});

describe('recordActivity — streak history', () => {
  it('records the first-ever session\'s date', () => {
    recordActivity('spanish', 10, 60);
    expect(getStreakHistory()).toEqual([new Date(DAY_ONE).toDateString()]);
  });

  it('does not duplicate an entry for a second session the same day', () => {
    recordActivity('spanish', 10, 60);
    recordActivity('french', 5, 30);
    expect(getStreakHistory()).toHaveLength(1);
  });

  it('adds one entry per distinct day, oldest first', () => {
    recordActivity('spanish', 10, 60);
    vi.setSystemTime(DAY_ONE + DAY);
    recordActivity('spanish', 10, 60);
    vi.setSystemTime(DAY_ONE + DAY * 5); // gap — history isn't the streak, every active day counts
    recordActivity('spanish', 10, 60);
    expect(getStreakHistory()).toEqual([
      new Date(DAY_ONE).toDateString(),
      new Date(DAY_ONE + DAY).toDateString(),
      new Date(DAY_ONE + DAY * 5).toDateString(),
    ]);
  });

  it('caps at 400 entries, dropping the oldest first', () => {
    for (let i = 0; i < 405; i++) {
      vi.setSystemTime(DAY_ONE + i * DAY);
      recordActivity('spanish', 1, 10);
    }
    const hist = getStreakHistory();
    expect(hist).toHaveLength(400);
    expect(hist[0]).toBe(new Date(DAY_ONE + 5 * DAY).toDateString());
    expect(hist[hist.length - 1]).toBe(new Date(DAY_ONE + 404 * DAY).toDateString());
  });
});

describe('recordActivity — daily goal (global, words)', () => {
  it('goalHitJustNow is false with no goal set', () => {
    expect(getGoals().words).toBe(0);
    const r = recordActivity('spanish', 1000, 60);
    expect(r.goalHitJustNow).toBe(false);
  });

  it('fires exactly once, the session that crosses the goal', () => {
    setGoalTarget('words', 25);
    let r = recordActivity('spanish', 20, 60);
    expect(r.goalHitJustNow).toBe(false);
    expect(getTodayProgress()).toBe(20);

    r = recordActivity('spanish', 10, 60); // crosses 25
    expect(r.goalHitJustNow).toBe(true);
    expect(getTodayProgress()).toBe(30);

    r = recordActivity('spanish', 10, 60); // already past goal
    expect(r.goalHitJustNow).toBe(false);
  });

  it('resets progress on a new day', () => {
    setGoalTarget('words', 25);
    recordActivity('spanish', 30, 60);
    expect(getTodayProgress()).toBe(30);

    vi.setSystemTime(DAY_ONE + DAY);
    expect(getTodayProgress()).toBe(0);
    const r = recordActivity('spanish', 30, 60);
    expect(r.goalHitJustNow).toBe(true); // crosses again, fresh day
  });
});

describe('recordActivity — daily goal (minutes)', () => {
  it('fires once minutes crosses the target, from accumulated seconds', () => {
    setGoalTarget('minutes', 10);
    let r = recordActivity('spanish', 5, 5 * 60); // 5 min
    expect(r.goalHitJustNow).toBe(false);
    expect(getTodayMinutes()).toBe(5);

    r = recordActivity('spanish', 5, 6 * 60); // 11 min total — crosses 10
    expect(r.goalHitJustNow).toBe(true);
    expect(getTodayMinutes()).toBe(11);
  });
});

describe('recordActivity — daily goal (streak days)', () => {
  it('fires on the day the streak count reaches the target, not before or after', () => {
    setGoalTarget('streak', 2);
    let r = recordActivity('spanish', 1, 10);
    expect(r.streak).toBe(1);
    expect(r.goalHitJustNow).toBe(false); // streak is 1, target is 2

    vi.setSystemTime(DAY_ONE + DAY);
    r = recordActivity('spanish', 1, 10);
    expect(r.streak).toBe(2);
    expect(r.goalHitJustNow).toBe(true); // crosses today

    r = recordActivity('spanish', 1, 10); // same day, already fired
    expect(r.goalHitJustNow).toBe(false);
  });
});

describe('multiple goal types active at once', () => {
  it('a words goal and a minutes goal can both be set, and both fire independently', () => {
    setGoalTarget('words', 5);
    setGoalTarget('minutes', 1);
    const r = recordActivity('spanish', 5, 90); // 5 words (hits words=5) and 1.5 min (hits minutes=1)
    expect(r.goalHitJustNow).toBe(true);
    // Spanish has no override, so it inherits the same global targets — its
    // own scope and the global scope both legitimately fire off this one
    // session, since spanish's activity is exactly what drove the global
    // total over the line too.
    expect(r.goalsHitJustNow.sort()).toEqual(
      ['␟minutes', '␟words', 'spanish␟minutes', 'spanish␟words'].sort(),
    );
  });

  it('setting one type does not disturb another already set', () => {
    setGoalTarget('words', 25);
    setGoalTarget('minutes', 10);
    expect(getGoals()).toEqual({ words: 25, minutes: 10, streak: 0 });
    setGoalTarget('streak', 3);
    expect(getGoals()).toEqual({ words: 25, minutes: 10, streak: 3 });
  });
});

describe('per-language goal overrides', () => {
  it('a language with no override follows the global goals', () => {
    setGoalTarget('words', 25);
    expect(hasLanguageGoal('spanish')).toBe(false);
    expect(getGoals('spanish')).toEqual({ words: 25, minutes: 0, streak: 0 });
  });

  it('a language\'s own goal takes precedence over the global one, per type', () => {
    setGoalTarget('words', 25);
    setGoalTarget('minutes', 5, 'spanish');
    expect(hasLanguageGoal('spanish')).toBe(true);
    // Spanish's own minutes target, but it inherited the global words target
    // as its starting point rather than zeroing it — see setGoalTarget's doc.
    expect(getGoals('spanish')).toEqual({ words: 25, minutes: 5, streak: 0 });
    expect(getGoals('french')).toEqual({ words: 25, minutes: 0, streak: 0 }); // untouched language still sees global
  });

  it('recordActivity checks a language\'s own goal against that language\'s own progress', () => {
    setGoalTarget('words', 100);            // global — deliberately out of reach
    setGoalTarget('words', 5, 'spanish');    // spanish's own, easily reached

    const r = recordActivity('spanish', 5, 10);
    expect(r.goalHitJustNow).toBe(true);
    expect(getTodayProgress('spanish')).toBe(5);
    expect(getTodayProgress()).toBe(5); // global total still accumulates too
  });

  it('clearLanguageGoal reverts a language back to following the global defaults', () => {
    setGoalTarget('words', 25);
    setGoalTarget('minutes', 5, 'spanish');
    clearLanguageGoal('spanish');
    expect(hasLanguageGoal('spanish')).toBe(false);
    expect(getGoals('spanish')).toEqual({ words: 25, minutes: 0, streak: 0 });
  });
});

describe('per-day goal-hit history (for the calendar)', () => {
  it('records which scope and type were hit, readable back by date', () => {
    setGoalTarget('words', 5);
    setGoalTarget('words', 3, 'spanish');
    recordActivity('spanish', 5, 10); // hits both spanish's own (3) and global (5)

    const dateStr = new Date(DAY_ONE).toDateString();
    const hits = getGoalHitsForDate(dateStr);
    expect(hits.map(parseHitKey)).toEqual(
      expect.arrayContaining([
        { scope: '', type: 'words' },
        { scope: 'spanish', type: 'words' },
      ]),
    );
  });

  it('is empty for a date with no recorded activity', () => {
    expect(getGoalHitsForDate(new Date(DAY_ONE).toDateString())).toEqual([]);
  });
});

describe('onActivity', () => {
  it('notifies subscribers with the same result recordActivity returns', () => {
    const seen: unknown[] = [];
    onActivity(r => seen.push(r));
    const r = recordActivity('spanish', 5, 30);
    expect(seen).toEqual([r]);
  });
});
