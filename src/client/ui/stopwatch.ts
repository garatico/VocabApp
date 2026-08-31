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
  /** Hard (re)start from 0:00 — discards whatever was previously
   *  accumulated. What every quiz mode calls once at quiz start. */
  start(): void;
  /** Pause. Unlike a hard stop this *preserves* accumulated time, so a
   *  later resume() continues rather than restarting — the pause half of
   *  a manual Start/Pause control (table-controls.ts's timer buttons).
   *  Every other caller only ever calls this once, at quiz completion, and
   *  never resumes — for them this behaves exactly as the old "stop and
   *  freeze" did. */
  stop(): void;
  /** Continue from wherever stop() left off. No-op if already running. */
  resume(): void;
  /** Zero the elapsed time. Keeps running if it was running, stays paused
   *  if it was paused — resetting mid-quiz isn't also a pause request. */
  reset(): void;
  /** Seconds elapsed, floored the way every mode already recorded it. */
  elapsedSeconds(): number;
  /** Whether the clock is currently ticking — for a UI that shows a
   *  Start/Pause toggle and needs to know which label/icon is current. */
  isRunning(): boolean;
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
  // Accumulated time from every completed run segment, plus whatever the
  // current segment (since runStartedAt) adds while ticking. Splitting it
  // this way — rather than one startedAt the old version rewound on every
  // start() — is what makes stop()/resume() a real pause instead of a reset.
  let accumulatedMs = 0;
  let runStartedAt: number | null = null;   // non-null exactly while running
  let tickTimer: ReturnType<typeof setInterval> | null = null;

  function render(): void {
    if (mountEl) mountEl.textContent = formatClock(rawElapsedSeconds());
  }

  function rawElapsedMs(): number {
    return accumulatedMs + (runStartedAt !== null ? Date.now() - runStartedAt : 0);
  }

  function rawElapsedSeconds(): number {
    return Math.max(0, Math.floor(rawElapsedMs() / 1000));
  }

  function beginTicking(): void {
    if (tickTimer) clearInterval(tickTimer);
    tickTimer = setInterval(render, 1000);
  }

  function stopTicking(): void {
    if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
  }

  function start(): void {
    accumulatedMs = 0;
    runStartedAt = Date.now();
    render();
    beginTicking();
  }

  function resume(): void {
    if (runStartedAt !== null) return;   // already running
    runStartedAt = Date.now();
    render();
    beginTicking();
  }

  function stop(): void {
    if (runStartedAt === null) return;   // already paused
    accumulatedMs += Date.now() - runStartedAt;
    runStartedAt = null;
    stopTicking();
    render();
  }

  function reset(): void {
    accumulatedMs = 0;
    if (runStartedAt !== null) runStartedAt = Date.now();   // stay running, from 0
    render();
  }

  return {
    start,
    resume,
    stop,
    reset,
    isRunning: () => runStartedAt !== null,
    elapsedSeconds: () => Math.max(1, Math.round(rawElapsedSeconds())),
  };
}
