/**
 * score-pills.test.ts — the Correct/Revealed/Missed/Left pill row shared by
 * table and conjugation mode (src/client/ui/score-pills.ts). Pure string/
 * math, no DOM.
 */
import { describe, it, expect } from 'vitest';
import { buildScorePills, scorePct } from '../../src/client/ui/score-pills.js';

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
