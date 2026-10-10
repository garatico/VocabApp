/**
 * haptics.ts — a short buzz when an answer is marked right or wrong.
 *
 * Every quiz mode marks an answer by adding a class to its own element (`correct`, `incorrect`,
 * `pm-wrong`, a `…--correct`, …), so rather than touching each mode this watches the page for
 * those classes appearing, which is also why a new mode needs nothing here as long as it reuses them.
 *
 * Two guards keep it honest: a buzz only follows something the learner just did (so restoring a
 * half-finished quiz, which marks many rows at once, stays silent), and one burst of changes is one
 * buzz, with "wrong" winning over "right".
 *
 * `navigator.vibrate` is Android (Chrome and the Capacitor WebView); iOS Safari has none, so there it
 * is a quiet no-op and Settings hides the switch.
 */
import { Settings } from '../settings.ts';

export const hapticsSupported = (): boolean => typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

// Matched by shape, not by a list of each mode's class (`correct`, `pm-correct`, a quiz-option `…--correct`, …).
// A list would also name classes that belong to lazily-loaded modes, which is exactly what keeps
// their stylesheets lazy (tests/client/lazy-css.test.ts), and would need a new entry per mode.
const RIGHT_RE = /(^|-)correct$/;
const WRONG_RE = /(^|-)(incorrect|wrong)$/;
const isRight = (c: string): boolean => RIGHT_RE.test(c) && !WRONG_RE.test(c);
const isWrong = (c: string): boolean => WRONG_RE.test(c);

/** How soon after a tap, key press or typing a result still counts as "the learner did that". */
const INTERACTION_WINDOW_MS = 700;
/** More marks than this in one burst is a restore or a reveal-all, not an answer. */
const BURST_LIMIT = 3;

export type HapticKind = 'right' | 'wrong';

const PATTERN: Record<HapticKind, number | number[]> = { right: 12, wrong: [28, 40, 28] };

export function buzz(kind: HapticKind): void {
  if (!hapticsSupported() || !Settings.getHaptics()) return;
  try { navigator.vibrate(PATTERN[kind]); } catch { /* blocked by the browser: not worth a message */ }
}

/** What a burst of class changes amounts to: 'wrong', 'right' or nothing. Pure, so it can be tested. */
export function classifyBurst(added: string[][]): HapticKind | null {
  if (added.length === 0 || added.length > BURST_LIMIT) return null;
  const all = added.flat();
  if (all.some(isWrong)) return 'wrong';
  if (all.some(isRight)) return 'right';
  return null;
}

export function initHaptics(): void {
  if (!hapticsSupported() || typeof MutationObserver === 'undefined') return;

  let lastInteraction = -Infinity;
  const touch = (): void => { lastInteraction = performance.now(); };
  for (const type of ['pointerdown', 'keydown', 'input', 'change']) {
    document.addEventListener(type, touch, { capture: true, passive: true });
  }

  const observer = new MutationObserver(records => {
    if (performance.now() - lastInteraction > INTERACTION_WINDOW_MS) return;
    const added: string[][] = [];
    for (const r of records) {
      if (r.type !== 'attributes' || r.attributeName !== 'class') continue;
      const el = r.target as Element;
      const before = new Set((r.oldValue ?? '').split(/\s+/).filter(Boolean));
      const fresh = [...el.classList].filter(c => !before.has(c) && (isRight(c) || isWrong(c)));
      if (fresh.length) added.push(fresh);
    }
    const kind = classifyBurst(added);
    if (kind) buzz(kind);
  });
  observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true });
}
