/**
 * history-progress.ts — the Progress panel at the top of the History tab.
 *
 * Four small views of data the app already keeps: CEFR coverage, the coming
 * week's review load, per-mode accuracy, and a calendar of active days. All
 * numbers come from progress-stats.ts; this file only fetches and draws.
 */

import { srsAllEntries } from '../utils/srs.ts';
import { getMasteryLevels, MAX_MASTERY_LEVEL } from './my-lists/mastery.ts';
import { cachedVocab, fetchVocab } from './my-lists/vocab-cache.ts';
import { getSessions } from '../utils/session-history.ts';
import { getStreakHistory, today } from '../utils/streak.ts';
import {
  reviewForecast, bandCoverage, modeAccuracy, activityGrid, LEARNED_BOX,
} from '../utils/progress-stats.ts';

const DAY_MS = 24 * 60 * 60 * 1000;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, className: string, text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

function bar(pct: number, label: string, title: string): HTMLElement {
  const row = el('div', 'prog-row');
  row.title = title;
  const track = el('div', 'prog-track');
  track.setAttribute('role', 'progressbar');
  track.setAttribute('aria-label', label);
  track.setAttribute('aria-valuemin', '0');
  track.setAttribute('aria-valuemax', '100');
  track.setAttribute('aria-valuenow', String(pct));
  track.setAttribute('aria-valuetext', title);
  const fill = el('div', 'prog-fill');
  fill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  track.appendChild(fill);
  row.append(el('span', 'prog-row-label', label), track, el('span', 'prog-row-value', `${pct}%`));
  return row;
}

function section(title: string): { root: HTMLElement; body: HTMLElement } {
  const root = el('div', 'prog-section');
  root.appendChild(el('h3', 'prog-section-title', title));
  const body = el('div', 'prog-section-body');
  root.appendChild(body);
  return { root, body };
}

/** Fill `body` with the progress views for `lang`. Safe to call repeatedly. */
export function renderProgress(body: HTMLElement, lang: string): void {
  body.innerHTML = '';
  const now = Date.now();
  const srs = srsAllEntries(lang);
  const grid = el('div', 'prog-grid');
  body.appendChild(grid);

  // ── CEFR coverage ───────────────────────────────────────────────────────
  const cov = section('Words learned by level');
  const vocab = cachedVocab(lang);
  if (vocab.length === 0) {
    cov.body.appendChild(el('p', 'history-empty', 'Loading vocabulary…'));
    fetchVocab(lang).then(() => {
      if (body.isConnected) renderProgress(body, lang);
    }).catch(() => {});
  } else {
    const learned = new Set<string>();
    for (const [w, e] of Object.entries(srs)) if (e.box >= LEARNED_BOX) learned.add(w);
    for (const [w, lv] of Object.entries(getMasteryLevels(lang))) if (lv >= MAX_MASTERY_LEVEL) learned.add(w);
    for (const c of bandCoverage(vocab, learned)) {
      if (c.total === 0) continue;
      cov.body.appendChild(bar(
        Math.round((c.learned / c.total) * 100), c.band,
        `${c.learned} of ${c.total} ${c.band} words learned`,
      ));
    }
    cov.body.appendChild(el('p', 'prog-note',
      'Learned = a few successful reviews in a row, or marked Mastered.'));
  }
  grid.appendChild(cov.root);

  // ── Review forecast ─────────────────────────────────────────────────────
  const fc = section('Reviews coming up');
  const counts = reviewForecast(Object.values(srs).map(e => e.dueAt), now, 7);
  const max = Math.max(1, ...counts);
  const chart = el('div', 'prog-forecast');
  counts.forEach((n, i) => {
    const col = el('div', 'prog-forecast-col');
    col.title = `${n} review${n === 1 ? '' : 's'}`;
    col.setAttribute('role', 'img');
    col.setAttribute('aria-label', `${i === 0 ? 'Now and overdue' : `In ${i} day${i === 1 ? '' : 's'}`}: ${n} review${n === 1 ? '' : 's'}`);
    col.appendChild(el('span', 'prog-forecast-n', String(n)));
    const b = el('div', 'prog-forecast-bar');
    b.style.height = `${Math.round((n / max) * 4.5 * 100) / 100}rem`;
    col.appendChild(b);
    const day = i === 0 ? 'Now' : new Date(now + i * DAY_MS).toLocaleDateString(undefined, { weekday: 'short' });
    col.appendChild(el('span', 'prog-forecast-day', day));
    chart.appendChild(col);
  });
  fc.body.appendChild(chart);
  grid.appendChild(fc.root);

  // ── Accuracy by mode ────────────────────────────────────────────────────
  const acc = section('Accuracy, last 30 days');
  const rows = modeAccuracy(getSessions(lang), now - 30 * DAY_MS);
  if (rows.length === 0) {
    acc.body.appendChild(el('p', 'history-empty', 'No sessions in the last 30 days.'));
  } else {
    rows.forEach(r => acc.body.appendChild(bar(
      r.pct, r.mode, `${r.correct} of ${r.total} correct over ${r.sessions} session${r.sessions === 1 ? '' : 's'}`,
    )));
  }
  grid.appendChild(acc.root);

  // ── Activity calendar ───────────────────────────────────────────────────
  const cal = section('Active days');
  const calEl = el('div', 'prog-cal');
  calEl.setAttribute('role', 'img');
  calEl.setAttribute('aria-label', 'Calendar of the last 12 weeks; filled squares are days you studied');
  activityGrid(getStreakHistory(), today(), 12).forEach(col => {
    const c = el('div', 'prog-cal-col');
    col.forEach(v => c.appendChild(
      el('span', 'prog-cal-cell' + (v === true ? ' is-active' : v === null ? ' is-future' : '')),
    ));
    calEl.appendChild(c);
  });
  cal.body.appendChild(calEl);
  grid.appendChild(cal.root);
}
