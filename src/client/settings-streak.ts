import { LANGUAGES } from './data/languages.ts';
import { getStreak, getBestStreak, getTodayProgress, getTodayMinutes, getStreakHistory, getGoalHitsForDate, parseHitKey, getDailyLangStats, type GoalType } from './utils/streak.ts';
import { positionPopover } from './utils/popover-position.ts';

/**
 * settings-streak.ts — the Settings screen's streak readouts and calendar.
 */

export function refreshStreakReadouts(): void {
  const streakEl  = document.getElementById('streakCurrentReadout');
  const bestEl    = document.getElementById('streakBestReadout');
  const todayEl   = document.getElementById('streakTodayReadout');
  const words     = getTodayProgress();
  const minutes   = getTodayMinutes();
  if (streakEl) streakEl.textContent = `${getStreak()} day${getStreak() === 1 ? '' : 's'}`;
  if (bestEl)   bestEl.textContent   = `${getBestStreak()} day${getBestStreak() === 1 ? '' : 's'}`;
  if (todayEl) {
    todayEl.textContent = minutes > 0
      ? `${words} word${words === 1 ? '' : 's'} · ${minutes} min`
      : `${words} word${words === 1 ? '' : 's'}`;
  }
  renderStreakCalendar();
}

// ── Streak calendar ─────────────────────────────────────────────────────────

/** Months back from the current one — 0 is this month. Resets to 0 whenever
 *  the Settings tab is (re)entered, rather than persisting a scroll position
 *  a returning visitor would find confusing. */
let calendarOffset = 0;

/** A dot's colour for one scope — a language's own appearance colour, or a
 *  neutral one for the global scope, which isn't a language at all. */
function scopeColorVar(scope: string): string {
  if (!scope) return 'var(--streak-flame, var(--warning))';
  const lang = LANGUAGES.find(l => l.name === scope);
  return lang ? `var(${lang.colorVar})` : 'var(--text-muted)';
}

function scopeLabel(scope: string): string {
  if (!scope) return 'Global';
  const lang = LANGUAGES.find(l => l.name === scope);
  return lang ? lang.label : scope;
}

const GOAL_TYPE_LABELS: Record<GoalType, string> = { words: 'words', minutes: 'minutes', streak: 'streak' };

/** "Spanish: words, minutes · Global: streak" — the exact breakdown for one
 *  day's cell, read from getGoalHitsForDate(). Grouped by scope so a day
 *  with several goals hit in the same language reads as one clause, not one
 *  per type. */
function describeDayHits(dateStr: string): string {
  const byScope = new Map<string, GoalType[]>();
  for (const key of getGoalHitsForDate(dateStr)) {
    const { scope, type } = parseHitKey(key);
    const list = byScope.get(scope) ?? [];
    list.push(type);
    byScope.set(scope, list);
  }
  return [...byScope.entries()]
    .map(([scope, types]) => `${scopeLabel(scope)}: ${types.map(t => GOAL_TYPE_LABELS[t]).join(', ')}`)
    .join(' · ');
}

// ── Day tooltip — styled hover breakdown, not the OS default ────────────────
//
// One shared element, built lazily and repositioned per cell rather than one
// per day — a month can have up to 31, and only one is ever shown at a time.

let dayTooltipEl: HTMLElement | null = null;

function ensureDayTooltip(): HTMLElement {
  if (!dayTooltipEl) {
    dayTooltipEl = document.createElement('div');
    dayTooltipEl.className = 'settings-calendar-tooltip';
    dayTooltipEl.hidden = true;
    document.body.appendChild(dayTooltipEl);
  }
  return dayTooltipEl;
}

function hideDayTooltip(): void {
  if (dayTooltipEl) dayTooltipEl.hidden = true;
}

/** Rebuilt fresh on every hover from the same two sources the calendar dots
 *  already draw on (getGoalHitsForDate, getDailyLangStats) — a goals clause
 *  when any were hit, then one row per language with recorded activity, in
 *  the same per-language colour the dots use. A day with neither (recorded
 *  active before per-language tracking existed, or with no goals set) says
 *  so plainly rather than showing an empty box. */
function showDayTooltip(anchor: HTMLElement, dateStr: string, dateLabel: string): void {
  const tip = ensureDayTooltip();
  tip.innerHTML = '';
  tip.hidden = false;

  const title = document.createElement('div');
  title.className = 'settings-calendar-tooltip-title';
  title.textContent = dateLabel;
  tip.appendChild(title);

  const hits = describeDayHits(dateStr);
  if (hits) {
    const goalsRow = document.createElement('div');
    goalsRow.className = 'settings-calendar-tooltip-goals';
    goalsRow.textContent = `🎯 ${hits}`;
    tip.appendChild(goalsRow);
  }

  const byLang = getDailyLangStats(dateStr);
  if (byLang.length > 0) {
    byLang
      .sort((a, b) => b.words - a.words)
      .forEach(({ lang, words, minutes }) => {
        const row = document.createElement('div');
        row.className = 'settings-calendar-tooltip-row';
        const dot = document.createElement('span');
        dot.className = 'settings-calendar-dot';
        dot.style.background = scopeColorVar(lang);
        row.appendChild(dot);
        const label = document.createElement('span');
        label.className = 'settings-calendar-tooltip-lang';
        label.textContent = scopeLabel(lang);
        row.appendChild(label);
        const stats = document.createElement('span');
        stats.className = 'settings-calendar-tooltip-stats';
        stats.textContent = minutes > 0
          ? `${words} word${words === 1 ? '' : 's'} · ${minutes} min`
          : `${words} word${words === 1 ? '' : 's'}`;
        row.appendChild(stats);
        tip.appendChild(row);
      });
  } else {
    // Shown even on a day that *did* hit a goal above — the per-language
    // breakdown (DAILY_LANG_KEY) only started recording once this feature
    // shipped, so a day from before then genuinely has none to show. Without
    // this, that day's tooltip was just the title (plus a goals row, if any)
    // and nothing else — reading as "the breakdown isn't working" rather
    // than "there's nothing from before this existed."
    const empty = document.createElement('div');
    empty.className = 'settings-calendar-tooltip-empty';
    empty.textContent = hits
      ? 'No per-language breakdown recorded for this day.'
      : 'No detailed stats recorded for this day.';
    tip.appendChild(empty);
  }

  positionPopover(tip, anchor);
}

function renderStreakCalendar(): void {
  const label = document.getElementById('streakCalLabel');
  const grid  = document.getElementById('streakCalGrid');
  const next  = document.getElementById('streakCalNext') as HTMLButtonElement | null;
  const legend = document.getElementById('streakCalLegend');
  if (!label || !grid) return;
  // Rebuilding the grid below removes every cell a tooltip might currently
  // be anchored to — removal doesn't reliably fire mouseleave, so a stale
  // tooltip from before a month-navigation click could otherwise be left
  // floating with nothing pointing at it.
  hideDayTooltip();

  const base = new Date();
  base.setDate(1);
  base.setMonth(base.getMonth() - calendarOffset);
  const year  = base.getFullYear();
  const month = base.getMonth();

  label.textContent = base.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  if (next) next.disabled = calendarOffset === 0;

  const active = new Set(getStreakHistory());
  const todayStr = new Date().toDateString();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth  = new Date(year, month + 1, 0).getDate();

  grid.innerHTML = '';
  for (let i = 0; i < firstWeekday; i++) {
    grid.appendChild(document.createElement('span'));
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const cellDate = new Date(year, month, day);
    const dateStr  = cellDate.toDateString();
    const cell = document.createElement('span');
    cell.className = 'settings-calendar-day';

    const num = document.createElement('span');
    num.className = 'settings-calendar-day-num';
    num.textContent = String(day);
    cell.appendChild(num);

    if (active.has(dateStr)) {
      cell.classList.add('settings-calendar-day--active');

      // One small dot per distinct scope (language, or global) that hit at
      // least one goal that day — the per-language breakdown the user asked
      // for, without trying to cram every type into the cell itself; the
      // exact types are in the tooltip instead.
      const scopes = [...new Set(getGoalHitsForDate(dateStr).map(k => parseHitKey(k).scope))];
      if (scopes.length > 0) {
        const dots = document.createElement('span');
        dots.className = 'settings-calendar-day-dots';
        scopes.forEach(scope => {
          const dot = document.createElement('span');
          dot.className = 'settings-calendar-dot';
          dot.style.background = scopeColorVar(scope);
          dots.appendChild(dot);
        });
        cell.appendChild(dots);
      }

      // A styled hover breakdown, not the OS default `title` tooltip — goal
      // hits (known for every past day via GOAL_HISTORY_KEY) plus a
      // per-language word/minute breakdown (getDailyLangStats, recorded
      // going forward from whenever that store shipped — an active day from
      // before then just has none to show).
      const dateLabel = cellDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
      cell.addEventListener('mouseenter', () => showDayTooltip(cell, dateStr, dateLabel));
      cell.addEventListener('mouseleave', hideDayTooltip);
      cell.addEventListener('focus', () => showDayTooltip(cell, dateStr, dateLabel));
      cell.addEventListener('blur', hideDayTooltip);
      cell.tabIndex = 0;
    }
    if (dateStr === todayStr) cell.classList.add('settings-calendar-day--today');
    grid.appendChild(cell);
  }

  if (legend && !legend.childElementCount) {
    const entries: [string, string][] = [['', 'Global'], ...LANGUAGES.map(l => [l.name, l.label] as [string, string])];
    entries.forEach(([scope, text]) => {
      const item = document.createElement('span');
      item.className = 'settings-calendar-legend-item';
      const dot = document.createElement('span');
      dot.className = 'settings-calendar-dot';
      dot.style.background = scopeColorVar(scope);
      item.append(dot, document.createTextNode(text));
      legend.appendChild(item);
    });
  }
}

export function bindStreakCalendarNav(): void {
  document.getElementById('streakCalPrev')?.addEventListener('click', () => {
    calendarOffset++;
    renderStreakCalendar();
  });
  document.getElementById('streakCalNext')?.addEventListener('click', () => {
    if (calendarOffset === 0) return;
    calendarOffset--;
    renderStreakCalendar();
  });
}
