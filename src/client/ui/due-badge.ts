/**
 * due-badge.ts — the header's "🔁 N due" button.
 *
 * One click starts a review of every word the spaced-repetition schedule says
 * is due in the current language. Hidden when nothing is due, so it only ever
 * shows up as an invitation, never as an empty badge.
 */

import { srsDueCount } from '../utils/srs.ts';
import { startDueReview } from '../utils/review-due.ts';
import { onActivity } from '../utils/streak.ts';
import { showToast } from './toast.ts';

function currentLang(): string {
  return (document.getElementById('langSelect') as HTMLSelectElement | null)?.value ?? 'spanish';
}

export function buildDueBadgeLabel(count: number): string {
  return `\u{1F501} ${count} due`;
}

function render(): void {
  const el = document.getElementById('dueBadge');
  if (!el) return;
  const count = srsDueCount(currentLang());
  el.hidden = count === 0;
  if (count === 0) return;
  el.textContent = buildDueBadgeLabel(count);
  el.title = `${count} word${count === 1 ? ' is' : 's are'} due for review — click to start`;
}

export function initDueBadge(): void {
  render();
  onActivity(render);
  document.getElementById('langSelect')?.addEventListener('change', render);
  // A tab left open overnight: words fall due with no activity to trigger a render.
  window.setInterval(render, 5 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });

  document.getElementById('dueBadge')?.addEventListener('click', () => {
    if (!startDueReview(currentLang())) showToast('Nothing due right now.', 'info', 2500);
  });
}
