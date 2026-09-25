/**
 * global-shortcuts.ts — keyboard navigation for the app as a whole.
 *
 *   g then t/p/v/b/s/c/l/m/h/,   go to a tab   (Table, Picture, Trivia, Blank,
 *                                              Scramble, Conjugation, Lists,
 *                                              Content, History, Settings)
 *   r                            start a review of what's due
 *   ← → Home End on the tab bar  move between tabs (the ARIA tablist pattern)
 *
 * "g then …" is the chord Gmail and GitHub taught people, and unlike a bare
 * letter or digit it can't collide with quizzes that answer with number keys
 * (see choice-keys.ts). Nothing here fires while typing in a field, with a
 * modifier held, or while the shortcuts dialog is open.
 *
 * The pure parts (`resolveChord`, `nextTabIndex`) are exported for tests; the
 * DOM wiring is thin.
 */

/** Second key of a "g …" chord -> the tab's data-mode. */
export const GO_CHORDS: Readonly<Record<string, string>> = {
  t: 'table',
  p: 'picture',
  v: 'trivia',
  b: 'guessBlank',
  s: 'sentenceScramble',
  c: 'conjugation',
  l: 'mylists',
  m: 'myContent',
  h: 'history',
  ',': 'settings',
};

/** How long after `g` the second key still counts. */
export const CHORD_WINDOW_MS = 1200;

export function resolveChord(second: string): string | null {
  return Object.prototype.hasOwnProperty.call(GO_CHORDS, second) ? GO_CHORDS[second] : null;
}

/**
 * Which tab arrow-key navigation lands on. `current` indexes `count` visible
 * tabs; wraps at both ends. Unknown keys return null (leave the event alone).
 */
export function nextTabIndex(key: string, current: number, count: number): number | null {
  if (count === 0) return null;
  switch (key) {
    case 'ArrowRight': return (current + 1) % count;
    case 'ArrowLeft':  return (current - 1 + count) % count;
    case 'Home':       return 0;
    case 'End':        return count - 1;
    default:           return null;
  }
}

function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable;
}

function dialogOpen(): boolean {
  return document.querySelector('#shortcutsOverlay.open') !== null;
}

function visibleTabs(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('.mode-tablist [role="tab"]')]
    .filter(t => !t.hidden && getComputedStyle(t).display !== 'none');
}

export function initGlobalShortcuts(): void {
  let awaitingSecond = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function cancelChord(): void {
    awaitingSecond = false;
    if (timer) { clearTimeout(timer); timer = null; }
  }

  document.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) { cancelChord(); return; }
    if (isTypingTarget(e.target) || dialogOpen()) { cancelChord(); return; }

    if (awaitingSecond) {
      const mode = resolveChord(e.key);
      cancelChord();
      if (mode) {
        const tab = document.querySelector<HTMLElement>(`.mode-tab[data-mode="${mode}"]`);
        if (tab && !tab.hidden) { e.preventDefault(); tab.click(); tab.focus(); }
      }
      return;
    }

    if (e.key === 'g') {
      awaitingSecond = true;
      timer = setTimeout(cancelChord, CHORD_WINDOW_MS);
      return;
    }

    if (e.key === 'r') {
      const due = document.getElementById('dueBadge');
      if (due && !due.hidden) { e.preventDefault(); due.click(); }
    }
  });

  // Arrow keys move between tabs. Focus only — Enter/Space (a button's own
  // behaviour) activates, so moving along the bar never starts loading modes.
  document.querySelector('.mode-tablist')?.addEventListener('keydown', ev => {
    const e = ev as KeyboardEvent;
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    const tabs = visibleTabs();
    const current = tabs.indexOf(e.target as HTMLElement);
    if (current < 0) return;
    const next = nextTabIndex(e.key, current, tabs.length);
    if (next === null) return;
    e.preventDefault();
    tabs[next].focus();
  });
}
