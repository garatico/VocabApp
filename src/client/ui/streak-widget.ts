/**
 * streak-widget.ts — the small 🔥 counter fixed in the top-right corner of
 * every tab (index.html's #streakWidget). Unlike #shortcutsBtn, which lives
 * inside #controls and disappears on My Lists/Settings/History/My Content/AI
 * Chat (see ui-state.ts's updateModeUI), this sits outside that card
 * specifically so it stays visible no matter which tab is active.
 *
 * Settings > Streak & Daily Goal controls whether it shows at all
 * (getShowStreakWidget) and how the emoji and count are arranged
 * (getStreakWidgetFormat) — see settings.ts.
 */

import { getStreak, onActivity } from '../utils/streak.ts';
import { Settings, setOnStreakWidgetChange } from '../settings.ts';

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
  el.title = `${streak} day${streak === 1 ? '' : 's'} — current streak`;
}

/** Called once at startup (see app.ts). Renders immediately, then keeps
 *  itself in sync with new activity (a session finishing elsewhere might
 *  bump the streak) and with the two Settings toggles above. */
export function initStreakWidget(): void {
  render();
  onActivity(render);
  setOnStreakWidgetChange(render);
}
