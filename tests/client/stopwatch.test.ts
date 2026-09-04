// @vitest-environment jsdom
/**
 * stopwatch.test.ts — createStopwatch()/formatClock() (src/client/ui/
 * stopwatch.ts), the shared quiz timer that replaced each mode's own
 * Date.now()-diff pattern. Fake timers throughout — vi.useFakeTimers() also
 * fakes Date, so Date.now() advances in lockstep with the timer clock.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createStopwatch, formatClock } from '../../src/client/ui/stopwatch.js';

describe('formatClock', () => {
  it.each([
    [0, '0:00'],
    [5, '0:05'],
    [59, '0:59'],
    [60, '1:00'],
    [65, '1:05'],
    [600, '10:00'],
  ])('%i seconds -> %s', (secs, expected) => {
    expect(formatClock(secs)).toBe(expected);
  });
});

describe('createStopwatch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });
  afterEach(() => vi.useRealTimers());

  it('reports at least 1 elapsed second even before start() is ever called', () => {
    const sw = createStopwatch(null);
    expect(sw.isRunning()).toBe(false);
    expect(sw.elapsedSeconds()).toBe(1);
  });

  it('start() zeroes the clock, begins running, and renders immediately', () => {
    const mount = document.createElement('span');
    const sw = createStopwatch(mount);
    sw.start();
    expect(sw.isRunning()).toBe(true);
    expect(mount.textContent).toBe('0:00');
  });

  it('the mounted readout ticks upward once per second while running', () => {
    const mount = document.createElement('span');
    const sw = createStopwatch(mount);
    sw.start();
    vi.advanceTimersByTime(3000);
    expect(mount.textContent).toBe('0:03');
    expect(sw.elapsedSeconds()).toBe(3);
  });

  it('stop() freezes the elapsed time and stops the tick', () => {
    const mount = document.createElement('span');
    const sw = createStopwatch(mount);
    sw.start();
    vi.advanceTimersByTime(3000);
    sw.stop();
    expect(sw.isRunning()).toBe(false);
    vi.advanceTimersByTime(5000);
    expect(sw.elapsedSeconds()).toBe(3);
    expect(mount.textContent).toBe('0:03');
  });

  it('stop() is a no-op when already paused', () => {
    const sw = createStopwatch(null);
    sw.start();
    vi.advanceTimersByTime(2000);
    sw.stop();
    sw.stop();
    expect(sw.elapsedSeconds()).toBe(2);
  });

  it('resume() continues accumulating rather than restarting from 0', () => {
    const sw = createStopwatch(null);
    sw.start();
    vi.advanceTimersByTime(3000);
    sw.stop();
    vi.advanceTimersByTime(10000); // time passing while paused must not count
    sw.resume();
    vi.advanceTimersByTime(2000);
    expect(sw.elapsedSeconds()).toBe(5);
  });

  it('resume() is a no-op while already running', () => {
    const sw = createStopwatch(null);
    sw.start();
    vi.advanceTimersByTime(2000);
    sw.resume(); // already running — must not reset the run segment
    vi.advanceTimersByTime(1000);
    expect(sw.elapsedSeconds()).toBe(3);
  });

  it('reset() while running zeroes elapsed time but keeps ticking', () => {
    const mount = document.createElement('span');
    const sw = createStopwatch(mount);
    sw.start();
    vi.advanceTimersByTime(5000);
    sw.reset();
    expect(mount.textContent).toBe('0:00');
    expect(sw.isRunning()).toBe(true);
    vi.advanceTimersByTime(2000);
    expect(sw.elapsedSeconds()).toBe(2);
  });

  it('reset() while paused zeroes elapsed time and stays paused', () => {
    const sw = createStopwatch(null);
    sw.start();
    vi.advanceTimersByTime(5000);
    sw.stop();
    sw.reset();
    expect(sw.isRunning()).toBe(false);
    expect(sw.elapsedSeconds()).toBe(1); // the same "at least 1" floor as the never-started case
  });

  it('a headless stopwatch (mountEl: null) never touches the DOM and still tracks time', () => {
    const sw = createStopwatch(null);
    expect(() => sw.start()).not.toThrow();
    vi.advanceTimersByTime(4000);
    expect(sw.elapsedSeconds()).toBe(4);
  });

  it('calling start() again hard-resets, discarding whatever was accumulated', () => {
    const sw = createStopwatch(null);
    sw.start();
    vi.advanceTimersByTime(10000);
    sw.start();
    expect(sw.elapsedSeconds()).toBe(1); // fresh run, ~0s elapsed -> floored to 1
  });
});
