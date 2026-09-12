/**
 * streak-widget.ts — the small 🔥 counter fixed in the top-right corner of
 * every tab, beside #shortcutsBtn (index.html's #appCornerBar). Unlike
 * #controls (which the two used to live inside), this sits outside it
 * specifically so it stays visible on tabs where #controls is hidden
 * entirely — My Lists/Settings/History/My Content/AI Chat (ui-state.ts).
 *
 * Settings > Streak & Daily Goal controls whether it shows at all
 * (getShowStreakWidget) and how the emoji and count are arranged
 * (getStreakWidgetFormat) — see settings.ts. Clicking it opens a small
 * popover with the same numbers Settings' own Streak section shows, plus a
 * shortcut into that section rather than making a learner hunt for it.
 */

import { getStreak, getBestStreak, getTodayProgress, getTodayMinutes, onActivity } from '../utils/streak.ts';
import { Settings, setOnStreakWidgetChange } from '../settings.ts';
import { positionPopover } from '../utils/popover-position.ts';

export type StreakWidgetFormat = 'emoji-number' | 'number-emoji' | 'number-only';

/** Pure builder, kept separate from the DOM-touching render() below so it's
 *  unit-testable without a document — same split as score-pills.ts. */
export function buildStreakWidgetHtml(streak: number, format: StreakWidgetFormat): string {
  const emoji = '<span class="streak-widget-emoji">\u{1F525}</span>';
  const count = `<span class="streak-widget-count">${streak}</span>`;
  if (format === 'number-only')  return count;
  if (format === 'number-emoji') return `${count} ${emoji}`;
  return `${emoji} ${count}`;
}

function render(): void {
  const el = document.getElementById('streakWidget');
  if (!el) return;
  const show = Settings.getShowStreakWidget();
  el.hidden = !show;
  if (!show) return;
  const streak = getStreak();
  el.innerHTML = buildStreakWidgetHtml(streak, Settings.getStreakWidgetFormat());
  el.title = `${streak} day${streak === 1 ? '' : 's'} — click for details`;
}

// ── Details popover ─────────────────────────────────────────────────────────
//
// Same anchored-popover mechanics as word-info-popover.ts/move-popover.ts —
// positionPopover for placement, a self-contained outside-click/Escape
// dismissal pair registered on a deferred tick so the opening click itself
// doesn't immediately close it, and a `_close` stashed on the element so a
// second open() call can tear down a still-open one cleanly.

function closeExistingPopover(): void {
  const existing = document.getElementById('streakPopover') as (HTMLElement & { _close?: () => void }) | null;
  if (existing?._close) existing._close();
  else existing?.remove();
}

function popoverRow(label: string, value: string): HTMLElement {
  const row = document.createElement('div');
  row.className = 'streak-popover-row';
  row.innerHTML = `<span class="streak-popover-label">${label}</span><span class="streak-popover-value">${value}</span>`;
  return row;
}

function openStreakPopover(anchorEl: HTMLElement): void {
  closeExistingPopover();

  const streak  = getStreak();
  const best    = getBestStreak();
  const words   = getTodayProgress();
  const minutes = getTodayMinutes();

  const popover = document.createElement('div');
  popover.className = 'list-picker-popover streak-popover';
  popover.id        = 'streakPopover';

  popover.appendChild(popoverRow('Current streak', `${streak} day${streak === 1 ? '' : 's'}`));
  popover.appendChild(popoverRow('Best streak', `${best} day${best === 1 ? '' : 's'}`));
  popover.appendChild(popoverRow(
    'Today',
    minutes > 0 ? `${words} word${words === 1 ? '' : 's'} · ${minutes} min` : `${words} word${words === 1 ? '' : 's'}`,
  ));

  const settingsBtn = document.createElement('button');
  settingsBtn.type        = 'button';
  settingsBtn.className   = 'streak-popover-settings-btn';
  settingsBtn.textContent = '⚙ Manage streak & goals';
  settingsBtn.addEventListener('click', () => {
    close();
    document.querySelector<HTMLButtonElement>('.mode-tab[data-mode="settings"]')?.click();
    document.getElementById('settings-sec-streak')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  popover.appendChild(settingsBtn);

  document.body.appendChild(popover);
  positionPopover(popover, anchorEl, { alignRight: true });
  popover.style.zIndex = '9999';

  function onOutside(e: MouseEvent): void {
    if (!popover.contains(e.target as Node) && e.target !== anchorEl) close();
  }
  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') close();
  }
  function close(): void {
    popover.remove();
    document.removeEventListener('mousedown', onOutside, true);
    document.removeEventListener('keydown', onKey, true);
  }
  (popover as HTMLElement & { _close?: () => void })._close = close;

  setTimeout(() => {
    document.addEventListener('mousedown', onOutside, true);
    document.addEventListener('keydown', onKey, true);
  }, 0);
}

/** Called once at startup (see app.ts). Renders immediately, then keeps
 *  itself in sync with new activity (a session finishing elsewhere might
 *  bump the streak) and with the two Settings toggles above. */
export function initStreakWidget(): void {
  render();
  onActivity(render);
  setOnStreakWidgetChange(render);

  const btn = document.getElementById('streakWidget');
  btn?.addEventListener('click', () => openStreakPopover(btn));
}
