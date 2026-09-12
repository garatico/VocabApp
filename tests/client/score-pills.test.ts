/**
 * score-pills.test.ts — the Correct/Revealed/Missed/Left pill row shared by
 * table and conjugation mode (src/client/ui/score-pills.ts). Pure string/
 * math, no DOM.
 */
import { describe, it, expect } from 'vitest';
import { buildScorePills, scorePct, buildProgressStatsHtml } from '../../src/client/ui/score-pills.js';

describe('buildScorePills', () => {
  it('returns nothing for a zero-word quiz', () => {
    expect(buildScorePills({ correct: 0, revealed: 0, missed: 0, left: 0, total: 0 })).toBe('');
  });

  it('includes each count and label', () => {
    const html = buildScorePills({ correct: 3, revealed: 1, missed: 2, left: 4, total: 10 });
    expect(html).toContain('3 Correct');
    expect(html).toContain('1 Revealed');
    expect(html).toContain('2 Missed');
    expect(html).toContain('4 Left');
  });

  it('renders even when total is inconsistent with the individual counts (never throws)', () => {
    expect(() => buildScorePills({ correct: 0, revealed: 0, missed: 0, left: 0, total: -1 })).not.toThrow();
    expect(buildScorePills({ correct: 0, revealed: 0, missed: 0, left: 0, total: -1 })).toBe('');
  });
});

describe('scorePct', () => {
  it('computes a percentage rounded to two decimals', () => {
    expect(scorePct(1, 3)).toBe(33.33);
  });

  it('is 0 when total is 0, rather than NaN or Infinity', () => {
    expect(scorePct(5, 0)).toBe(0);
  });

  it('is 100 when n equals total', () => {
    expect(scorePct(10, 10)).toBe(100);
  });

  it('is 0 when n is 0', () => {
    expect(scorePct(0, 10)).toBe(0);
  });
});

describe('buildProgressStatsHtml', () => {
  const base = { correct: 6, revealed: 2, missed: 2, answered: 10, total: 10 };

  it('returns nothing for a zero-word quiz', () => {
    expect(buildProgressStatsHtml({ ...base, total: 0 }, 'correct')).toBe('');
  });

  it('shows a plain completion percentage while still in progress', () => {
    expect(buildProgressStatsHtml({ ...base, answered: 5 }, 'correct')).toBe('5 / 10  ·  50%');
  });

  it('does not add hint chips when showHintBreakdown is omitted', () => {
    const html = buildProgressStatsHtml(
      { ...base, hintedCorrect: 3, hintedRevealed: 1, hintedMissed: 1 }, 'all',
    );
    expect(html).not.toContain('Hinted');
  });

  it('adds only the non-zero hint-outcome chips when showHintBreakdown is on', () => {
    const html = buildProgressStatsHtml(
      { ...base, hintedCorrect: 3, hintedRevealed: 0, hintedMissed: 1 }, 'correct', true,
    );
    expect(html).toContain('30% Hinted → Solved');
    expect(html).not.toContain('Hinted → Revealed');
    expect(html).toContain('10% Hinted → Missed');
  });

  it('appends hint chips after the mode-selected chips regardless of mode', () => {
    const html = buildProgressStatsHtml(
      { ...base, hintedCorrect: 1 }, 'missed', true,
    );
    const missedIdx = html.indexOf('Missed<');
    const hintIdx   = html.indexOf('Hinted → Solved');
    expect(missedIdx).toBeGreaterThan(-1);
    expect(hintIdx).toBeGreaterThan(missedIdx);
  });
});
