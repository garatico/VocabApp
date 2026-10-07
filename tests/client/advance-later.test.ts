/**
 * advance-later.test.ts — advanceLater (src/client/utils/advance-later.ts): after an answer, move on
 * only if the learner is still on that question when the delay is up.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { advanceLater } from '../../src/client/utils/advance-later.ts';

describe('advanceLater', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('moves on after the delay when the learner stayed put', () => {
    vi.useFakeTimers();
    let idx = 0;
    const advance = vi.fn(() => { idx++; });
    advanceLater(() => idx, advance, 650);
    vi.advanceTimersByTime(649);
    expect(advance).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(advance).toHaveBeenCalledOnce();
    expect(idx).toBe(1);
  });

  it('does nothing if the learner pressed Next themselves — no question is skipped', () => {
    vi.useFakeTimers();
    let idx = 0;
    const advance = vi.fn(() => { idx++; });
    advanceLater(() => idx, advance, 650);
    idx = 1;                         // Next, by hand
    vi.advanceTimersByTime(2000);
    expect(advance).not.toHaveBeenCalled();
    expect(idx).toBe(1);
  });

  it('does nothing if the learner went Back to review', () => {
    vi.useFakeTimers();
    let idx = 3;
    const advance = vi.fn();
    advanceLater(() => idx, advance, 1600);
    idx = 2;
    vi.advanceTimersByTime(1600);
    expect(advance).not.toHaveBeenCalled();
  });
});
