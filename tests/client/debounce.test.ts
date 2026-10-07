/**
 * debounce.test.ts — the shared debounce (src/client/utils/debounce.ts), which
 * replaced three identical local copies.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { debounce } from '../../src/client/utils/debounce.js';

describe('debounce', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('runs once, after the quiet period, with the last call\'s arguments', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d(1); d(2); d(3);
    vi.advanceTimersByTime(99);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(3);
  });

  it('restarts the wait on each call', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d('a');
    vi.advanceTimersByTime(80);
    d('b');
    vi.advanceTimersByTime(80);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(20);
    expect(fn).toHaveBeenCalledExactlyOnceWith('b');
  });

  it('fires again for a later burst', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const d = debounce(fn, 50);
    d(1); vi.advanceTimersByTime(50);
    d(2); vi.advanceTimersByTime(50);
    expect(fn.mock.calls).toEqual([[1], [2]]);
  });
});
