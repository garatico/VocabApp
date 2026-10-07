import { describe, it, expect } from 'vitest';
import { reviewForecast, bandCoverage, modeAccuracy, activityGrid } from '../../src/client/utils/progress-stats.ts';

const DAY = 86_400_000;
const NOW = 1_700_000_000_000;

describe('reviewForecast', () => {
  it('lumps overdue into today and buckets the rest by day, dropping beyond the window', () => {
    const out = reviewForecast([NOW - 5 * DAY, NOW - 1, NOW + 0.5 * DAY, NOW + 1.5 * DAY, NOW + 6.5 * DAY, NOW + 30 * DAY], NOW, 7);
    expect(out).toEqual([3, 1, 0, 0, 0, 0, 1]);
  });
});

describe('bandCoverage', () => {
  it('counts learned per band and ignores words with no band', () => {
    const rows = bandCoverage(
      [{ word: 'a', band: 'A1' }, { word: 'b', band: 'A1' }, { word: 'c', band: 'B1' }, { word: 'x', band: null }],
      new Set(['a', 'c', 'x']),
    );
    expect(rows.find(r => r.band === 'A1')).toMatchObject({ learned: 1, total: 2 });
    expect(rows.find(r => r.band === 'B1')).toMatchObject({ learned: 1, total: 1 });
    expect(rows.reduce((n, r) => n + r.total, 0)).toBe(3);
  });
});

describe('modeAccuracy', () => {
  it('aggregates per mode inside the window, busiest first', () => {
    const rows = modeAccuracy([
      { at: '2026-01-10T00:00:00Z', mode: 'table',   correct: 8, total: 10 },
      { at: '2026-01-11T00:00:00Z', mode: 'table',   correct: 6, total: 10 },
      { at: '2026-01-11T00:00:00Z', mode: 'picture', correct: 1, total: 2 },
      { at: '2025-01-01T00:00:00Z', mode: 'picture', correct: 0, total: 50 },
    ], Date.parse('2026-01-01T00:00:00Z'));
    expect(rows.map(r => r.mode)).toEqual(['table', 'picture']);
    expect(rows[0]).toMatchObject({ sessions: 2, pct: 70 });
    expect(rows[1].pct).toBe(50);
  });
});

describe('activityGrid', () => {
  // Dates in the format streak.ts actually records (today() is toDateString()).
  const day = (y: number, m: number, d: number): string => new Date(y, m - 1, d).toDateString();

  it('is weeks x 7, marks active dates, and blanks days after today', () => {
    // 2026-03-04 is a Wednesday.
    const grid = activityGrid([day(2026, 3, 4), day(2026, 3, 1)], new Date(2026, 2, 4, 15, 30), 3);
    expect(grid).toHaveLength(3);
    grid.forEach(col => expect(col).toHaveLength(7));
    const last = grid[2];
    expect(last[0]).toBe(true);    // Sunday Mar 1
    expect(last[3]).toBe(true);    // Wednesday Mar 4 (today)
    expect(last[1]).toBe(false);
    expect(last[4]).toBeNull();    // Thursday, still in the future
  });

  it('reads the dates streak.ts really records', async () => {
    const { today } = await import('../../src/client/utils/streak.ts');
    const grid = activityGrid([today()], new Date(), 1);
    expect(grid[0][new Date().getDay()]).toBe(true);
  });

  it('crosses month and year boundaries', () => {
    // Fri 2027-01-01; the first column starts Sun 2026-12-20.
    const grid = activityGrid([day(2026, 12, 31), day(2026, 12, 20)], new Date(2027, 0, 1), 2);
    expect(grid[0][0]).toBe(true);   // Sun Dec 20
    expect(grid[1][4]).toBe(true);   // Thu Dec 31
    expect(grid[1][5]).toBe(false);  // Fri Jan 1, today, no activity
    expect(grid[1][6]).toBeNull();
  });
});
