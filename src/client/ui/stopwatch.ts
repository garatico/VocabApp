/**
 * stopwatch.ts — a live count-up elapsed-time readout, shared by every quiz
 * mode.
 *
 * Replaces each mode's own silent `Date.now()`-diff-at-completion pattern
 * (table-controls.ts's quizStartedAt, quiz-controls.ts's sessionStart,
 * picture-mode.ts's pictureStartedAt, conjugation/index.ts's
 * conjSessionStart) with one implementation that also gives the learner a
 * visible ticking clock, not just a number recorded after the fact.
 *
 * `elapsedSeconds()` uses the same floor every mode already applied by hand
 * — `Math.max(1, Math.round(diff / 1000))` — so the value fed into
 * session-history.ts's `saveSession({ seconds })` is unchanged in shape,
 * just now sourced from one place.
 */

export interface Stopwatch {
  /** Start (or resume) ticking. Safe to call once at quiz start. */
  start(): void;
  /** Stop ticking. The display freezes at its last value. */
  stop(): void;
  /** Reset to 0:00 and stop. */
  reset(): void;
  /** Seconds elapsed, floored the way every mode already recorded it. */
  elapsedSeconds(): number;
}

/** `m:ss`, e.g. 65 -> "1:05". Exported for callers that build their own
 *  composite readout (recall-mode.ts's pace line) rather than mounting the
 *  stopwatch's own display. */
export function formatClock(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

/**
 * @param mountEl Where the live `m:ss` text is rendered, or `null` for a
 * headless instance (elapsed time tracked, nothing drawn — recall-mode.ts
 * uses this, since it already renders its own pace text incorporating the
 * clock rather than a bare readout).
 */
export function createStopwatch(mountEl: HTMLElement | null): Stopwatch {
  let startedAt = 0;
  let stoppedAt: number | null = null;
  let tickTimer: ReturnType<typeof setInterval> | null = null;

  function render(): void {
    if (mountEl) mountEl.textContent = formatClock(rawElapsedSeconds());
  }

  function rawElapsedSeconds(): number {
    const end = stoppedAt ?? Date.now();
    return Math.max(0, Math.floor((end - startedAt) / 1000));
  }

  function start(): void {
    startedAt = Date.now();
    stoppedAt = null;
    render();
    if (tickTimer) clearInterval(tickTimer);
    tickTimer = setInterval(render, 1000);
  }

  function stop(): void {
    if (stoppedAt !== null) return;
    stoppedAt = Date.now();
    if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
    render();
  }

  function reset(): void {
    if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
    startedAt = Date.now();
    stoppedAt = Date.now();
    render();
  }

  return {
    start,
    stop,
    reset,
    elapsedSeconds: () => Math.max(1, Math.round(rawElapsedSeconds())),
  };
}
