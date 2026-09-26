import { fillHighlighted } from './utils/dom.ts';
import { foldKey } from './utils/match.ts';
import { resetAllSettings, snapshotSettings, restoreSettingsSnapshot, type SettingsSnapshot } from './utils/reset-settings.ts';
import { readString, writeString } from './utils/storage.ts';
import { showUndo } from './modes/my-lists/undo-toast.ts';
import { t } from './i18n/index.ts';
import { showToast } from './ui/toast.ts';
import {
  COLOUR_GROUPS, captureColourGroup, captureGoal, captureTimedMinutes, colourGroupChanged, goalChanged, goalTypeOf,
  holdsTimedMinutes, resetColourGroup, resetGoal, resetTimedMinutes, timedMinutesChanged,
} from './settings-extras.ts';

/**
 * settings-search.ts — the Settings screen's Glossary tab and the search box
 * that filters every section's rows.
 */

// ── Glossary — search, category filter, A→Z/Grouped sort ──────────────────

/**
 * Wires the Glossary section's search box, category filter chips, and sort
 * toggle. Rows stay in the DOM the whole time (search/filter only toggle
 * `hidden`) so re-matching a term after narrowing needs no re-render — only
 * the sort toggle actually moves nodes, and only between two fixed orders:
 * the original grouped-by-topic markup order (captured once, here) and an
 * alphabetical one computed fresh from whatever's currently on screen (so a
 * UI-language switch re-sorts by the newly-displayed term text, not stale
 * English).
 */
export function bindGlossary(): void {
  const search = document.getElementById('glossarySearch') as HTMLInputElement | null;
  const list   = document.getElementById('glossaryList');
  const empty  = document.getElementById('glossaryEmpty');
  const sortToggle   = document.getElementById('glossarySort');
  const filterChips  = document.getElementById('glossaryFilterChips');
  if (!search || !list || !sortToggle || !filterChips) return;

  const rows = Array.from(list.querySelectorAll<HTMLElement>('.glossary-term'));
  if (rows.length === 0) return;
  const groupedOrder = rows.slice();

  const termSpan = (row: HTMLElement): HTMLElement =>
    row.querySelector<HTMLElement>('.settings-label > span:first-child')!;
  const descSpan = (row: HTMLElement): HTMLElement | null =>
    row.querySelector<HTMLElement>('.settings-desc');

  let activeCategory = 'all';

  function applyFilters(): void {
    const q = foldKey(search!.value);
    let anyVisible = false;
    for (const row of rows) {
      const term = termSpan(row);
      const desc = descSpan(row);
      const matchesCategory = activeCategory === 'all' || row.dataset.category === activeCategory;
      const matchesSearch = !q
        || foldKey(term.textContent ?? '').includes(q)
        || foldKey(desc?.textContent ?? '').includes(q);
      const visible = matchesCategory && matchesSearch;
      row.hidden = !visible;
      if (visible) anyVisible = true;
      // Re-highlight from the term's own full text every time — textContent
      // already flattens whatever <mark> a previous search wrapped it in,
      // so this is safe to call unconditionally rather than needing a
      // separately-cached "original" copy.
      fillHighlighted(term, term.textContent ?? '', search!.value);
    }
    if (empty) empty.hidden = anyVisible;
  }

  search.addEventListener('input', applyFilters);

  filterChips.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('.pos-chip');
    if (!btn?.dataset.category) return;
    filterChips.querySelectorAll('.pos-chip').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    activeCategory = btn.dataset.category;
    applyFilters();
  });

  function reorder(sortKey: string | undefined): void {
    const ordered = sortKey === 'az'
      ? rows.slice().sort((a, b) => foldKey(termSpan(a).textContent ?? '').localeCompare(foldKey(termSpan(b).textContent ?? '')))
      : groupedOrder;
    ordered.forEach(row => list!.appendChild(row));
  }

  sortToggle.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('.sort-order-btn');
    if (!btn?.dataset.sort) return;
    sortToggle.querySelectorAll('.sort-order-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    reorder(btn.dataset.sort);
  });

  // The markup's own default-active button (A → Z) is a claim about order,
  // not just which button looks pressed — apply it now rather than leaving
  // the grouped markup order on screen under an "A → Z" label until the
  // learner clicks something.
  reorder(sortToggle.querySelector<HTMLElement>('.sort-order-btn.active')?.dataset.sort);
  applyFilters();
}

// ── "Changed from default" ───────────────────────────────────────────────
//
// A row is "changed" when its controls no longer read the way the markup shipped them. The markup is
// the record of each control's default (which toggle button carries `.active`, which option is
// selected, whether a box is ticked), so the answer is a comparison against a snapshot taken
// *before* restoreSettingsUI() paints the saved values over it. tests/e2e/settings-organisation.spec.ts
// fails if a fresh browser shows anything as changed, which is how a markup default that has drifted
// from the code's own default gets noticed.
//
// What the markup cannot describe — colour pickers, the daily-goal rows, the timed-quiz minutes box —
// is settings-extras.ts's job; isChanged() and the reset/undo helpers below ask both.

interface RowDefault { state: string; reset: () => void }
const rowDefaults = new WeakMap<HTMLElement, RowDefault>();

function stateOf(row: HTMLElement): string {
  const parts: string[] = [];
  row.querySelectorAll<HTMLElement>('.sort-order-toggle').forEach(group => {
    const buttons = Array.from(group.querySelectorAll('.sort-order-btn'));
    parts.push(buttons.map((b, i) => (b.classList.contains('active') ? i : -1)).filter(i => i >= 0).join(','));
  });
  // Toggles, dropdowns and tick boxes only. A number or text box is filled in from storage after the
  // markup is read (e.g. the timed-quiz minutes), so it says nothing about whether the row moved.
  row.querySelectorAll<HTMLInputElement | HTMLSelectElement>('select, input[type="checkbox"], input[type="radio"]').forEach(el => {
    if (el.closest('.sort-order-toggle')) return;
    parts.push(el instanceof HTMLInputElement ? String(el.checked) : el.value);
  });
  return parts.join('|');
}

/**
 * Operations that put a row's ordinary controls back to how they read *now*. Resetting goes through the
 * control itself — clicking the button, re-selecting the option — so the setting's own handler persists
 * it and repaints whatever depends on it, exactly as if it had been chosen by hand. Taken at load, these
 * are "back to the default"; taken just before a reset, they are Undo.
 */
function controlOps(row: HTMLElement): Array<() => void> {
  const ops: Array<() => void> = [];
  row.querySelectorAll<HTMLElement>('.sort-order-toggle').forEach(group => {
    const want = group.querySelector<HTMLElement>('.sort-order-btn.active');
    if (want) ops.push(() => { if (!want.classList.contains('active')) want.click(); });
  });
  row.querySelectorAll<HTMLInputElement | HTMLSelectElement>('select, input[type="checkbox"], input[type="radio"]').forEach(el => {
    if (el.closest('.sort-order-toggle')) return;
    if (el instanceof HTMLInputElement) {
      const want = el.checked;
      ops.push(() => { if (el.checked !== want) el.click(); });
    } else {
      const want = el.value;
      ops.push(() => { if (el.value !== want) { el.value = want; el.dispatchEvent(new Event('change', { bubbles: true })); } });
    }
  });
  return ops;
}

/** Record every row's default, and how to put it back. Call once, before saved settings are painted. */
export function snapshotSettingDefaults(): void {
  document.querySelectorAll<HTMLElement>('.settings-section .settings-row').forEach(row => {
    const ops = controlOps(row);
    rowDefaults.set(row, { state: stateOf(row), reset: () => ops.forEach(op => op()) });
  });
}

function isChanged(row: HTMLElement): boolean {
  const goal = goalTypeOf(row);
  if (goal) return goalChanged(goal);      // built by JS after load, so the markup is no baseline
  if (holdsTimedMinutes(row) && timedMinutesChanged()) return true;
  const base = rowDefaults.get(row)?.state;
  return base !== undefined && base !== '' && stateOf(row) !== base;
}

/** Put one row back to its default. */
function resetRow(row: HTMLElement): void {
  const goal = goalTypeOf(row);
  if (goal) { resetGoal(goal); return; }
  rowDefaults.get(row)?.reset();
  if (holdsTimedMinutes(row)) resetTimedMinutes();
}

/** A closure that puts one row back to what it is now — call it before resetting, to make Undo. */
function captureRow(row: HTMLElement): () => void {
  const goal = goalTypeOf(row);
  if (goal) return captureGoal(goal);
  const ops = controlOps(row);
  const minutes = holdsTimedMinutes(row) ? captureTimedMinutes() : null;
  return () => { ops.forEach(op => op()); minutes?.(); };
}

/** The stable name of a row for links: its first control's id (`settingHintButton`). */
function settingKeyOf(row: HTMLElement): string | null {
  return row.querySelector<HTMLElement>('[id^="setting"]')?.id ?? null;
}

// ── Which section you were in ─────────────────────────────────────────────

const LAST_SECTION_KEY = 's_settings_section';

/** Return to the section the learner was last reading, expanding it if it is collapsed. */
export function restoreSettingsPosition(): void {
  const id = readString(LAST_SECTION_KEY);
  const section = id ? document.getElementById(id) : null;
  if (!section?.classList.contains('settings-section') || section.hidden) return;
  const btn = section.querySelector<HTMLButtonElement>(':scope > .settings-collapse-btn');
  if (btn?.getAttribute('aria-expanded') === 'false') btn.click();
  section.scrollIntoView({ block: 'start' });
}

// ── Jumping to one setting (from a quiz, the Glossary, or a link) ─────────

/**
 * Bring one setting into view: clear any search, open its section, fold and group, scroll to it and
 * flash it. Returns false if there is no such setting. Keys are control ids (`settingHintButton`) —
 * treat them as public, since links and the Glossary use them.
 */
export function revealSetting(key: string): boolean {
  const control = document.getElementById(key);
  // A few settings (Simple Mode, Advanced, Theme) live in the toolbar beside the sections, not in one.
  const toolbarItem = control?.closest<HTMLElement>('.settings-toolbar-item') ?? null;
  const row = control?.closest<HTMLElement>('.settings-row') ?? toolbarItem;
  const section = row?.closest<HTMLElement>('.settings-section') ?? null;
  if (!row || (!section && !toolbarItem)) return false;

  const input = document.getElementById('settingsSearch') as HTMLInputElement | null;
  if (input?.value) { input.value = ''; input.dispatchEvent(new Event('input')); }
  const changedBtn = document.getElementById('settingsChangedOnly');
  if (changedBtn?.getAttribute('aria-pressed') === 'true') changedBtn.click();

  // A setting behind Advanced mode is invisible until that is on; turn it on rather than fail silently.
  if (row.closest('[data-advanced="true"]') && !document.body.classList.contains('advanced-mode')) {
    document.querySelector<HTMLElement>('#settingAdvancedMode [data-advanced-mode="true"]')?.click();
    showToast(t('settings.advancedShown', 'Advanced settings were switched on to show this setting.'), 'info');
  }

  const open = (body: HTMLElement | null): void => {
    if (!body?.classList.contains('filter-body--collapsed')) return;
    document.querySelector<HTMLElement>(`[data-collapse="${body.id}"]`)?.click();
  };
  if (section) open(section.querySelector<HTMLElement>(':scope > .settings-section-body'));
  for (let el = row.parentElement?.closest<HTMLElement>('.filter-body') ?? null; el; el = el.parentElement?.closest<HTMLElement>('.filter-body') ?? null) open(el);

  row.scrollIntoView({ block: 'center' });
  row.classList.remove('settings-row--flash');
  void row.offsetWidth;                                   // restart the animation if it is already running
  row.classList.add('settings-row--flash');
  window.setTimeout(() => row.classList.remove('settings-row--flash'), 2200);
  return true;
}

/**
 * Switch to the Settings tab and bring one setting into view. On a cold load (a `#setting=` link) the
 * tab's own click handler may not be wired yet, so keep trying until the screen is really showing.
 */
export function openSetting(key: string, tries = 20): void {
  const area = document.getElementById('settingsArea');
  if (area?.hidden) document.querySelector<HTMLElement>('.mode-tab[data-mode="settings"]')?.click();
  window.setTimeout(() => {
    if (area?.hidden && tries > 0) { openSetting(key, tries - 1); return; }
    revealSetting(key);
  }, 80);
}

// ── Settings search — filters every section's rows by label/description ───
//
// Rows/groups/sections stay in the DOM the whole time, same approach as
// bindGlossary() above — only visibility and the collapsed-state toggle,
// never a rebuild. A row also counts as a match when its *group* or
// *section* heading matches (not just its own text) — typing "colors"
// surfaces a whole Table Colors group even though none of its individual
// rows say "colors" themselves. A few plain-language aliases ("clock" for the timer) widen what
// matches, and every hit shows which section and group it lives in.
//
// A group/section the search force-opens is restored to whatever it was
// before the search (collapsed or not) once the query is cleared, rather
// than left open — searching shouldn't permanently change anyone's collapse
// preferences, only reveal what already matches.

interface SettingsSearchRow {
  row: HTMLElement;
  text: string;
  label: HTMLElement;
  groupBody: HTMLElement | null;
  sectionBody: HTMLElement;
  crumb: HTMLElement;
  crumbText: string;
  sr: HTMLElement;
}

/** Words people type that the labels don't contain. Matched against a row's own text. */
const SYNONYMS: ReadonlyArray<readonly [needle: string, aliases: string]> = [
  ['text size', 'font zoom bigger larger smaller magnify'],
  ['timer', 'clock stopwatch time limit'],
  ['hint', 'clue help letter'],
  ['reveal', 'show answer give up'],
  ['typo', 'spelling mistakes misspell forgiveness'],
  ['accent', 'diacritics tildes'],
  ['streak', 'fire days consecutive in a row'],
  ['goal', 'target quota daily'],
  ['back up', 'backup export save download'],
  ['backup', 'export save download'],
  ['restore', 'import upload load'],
  ['column', 'grid layout width'],
  ['density', 'compact spacing padding tight rows'],
  ['color', 'colour palette hue theme'],
  ['swear', 'profanity vulgar curse rude'],
  ['simple mode', 'beginner easy basic kids'],
  ['advanced', 'expert power extra'],
  ['gender', 'masculine feminine el la'],
  ['language indicator', 'flag country'],
  ['per page', 'pagination pages size'],
  ['history', 'past sessions log'],
  ['autofill', 'suggest remember browser'],
  ['romaniz', 'pinyin romaji transliteration'],
];

export function bindSettingsSearch(): void {
  const input = document.getElementById('settingsSearch') as HTMLInputElement | null;
  const empty = document.getElementById('settingsSearchEmpty');
  const changedBtn = document.getElementById('settingsChangedOnly') as HTMLButtonElement | null;
  const changedCount = document.getElementById('settingsChangedCount');
  const sections = Array.from(document.querySelectorAll<HTMLElement>('.settings-section'));
  if (!input || sections.length === 0) return;

  const rows: SettingsSearchRow[] = [];
  const groupHeading  = new Map<HTMLElement, string>();
  const sectionTitle  = new Map<HTMLElement, string>();
  const bodyOfSection = new Map<HTMLElement, HTMLElement>();
  const titleOfBody   = new Map<HTMLElement, string>();
  const headingOfBody = new Map<HTMLElement, string>();

  for (const section of sections) {
    const sectionBtn  = section.querySelector<HTMLButtonElement>(':scope > .settings-collapse-btn');
    const sectionBody = section.querySelector<HTMLElement>(':scope > .settings-section-body');
    if (!sectionBtn || !sectionBody) continue;
    bodyOfSection.set(section, sectionBody);
    const titleRaw = sectionBtn.querySelector('.settings-section-title')?.textContent?.trim() ?? '';
    sectionTitle.set(sectionBody, foldKey(titleRaw));
    titleOfBody.set(sectionBody, titleRaw);

    sectionBody.querySelectorAll<HTMLButtonElement>('.settings-group-collapse-btn').forEach(btn => {
      const groupId = btn.dataset.collapse;
      const body = groupId ? document.getElementById(groupId) : null;
      if (!body) return;
      const heading = btn.querySelector('.settings-group-heading')?.textContent?.trim() ?? '';
      groupHeading.set(body, foldKey(heading));
      headingOfBody.set(body, heading);
    });

    sectionBody.querySelectorAll<HTMLElement>('.settings-row').forEach(row => {
      const label = row.querySelector<HTMLElement>('.settings-label > span:first-child');
      if (!label) return; // a readout-only row or similar has nothing to search by — leave it always visible
      const desc = row.querySelector<HTMLElement>('.settings-desc');
      let text = foldKey(`${label.textContent ?? ''} ${desc?.textContent ?? ''}`);
      for (const [needle, aliases] of SYNONYMS) if (text.includes(needle)) text += ' ' + foldKey(aliases);
      const groupBody = row.closest<HTMLElement>('.filter-body[id^="settingsGroup"]');
      const inFold = row.closest('.settings-fold') !== null;
      const crumbText = [titleRaw, inFold ? t('settings.advancedFold', 'Advanced') : '', groupBody ? headingOfBody.get(groupBody) ?? '' : '']
        .filter(Boolean).join(' › ');
      const holder = row.querySelector<HTMLElement>('.settings-label');
      const crumb = document.createElement('span');
      crumb.className = 'settings-crumb';
      crumb.hidden = true;
      const sr = document.createElement('span');
      sr.className = 'sr-only settings-changed-sr';
      holder?.append(crumb, sr);
      rows.push({ row, text, label, groupBody, sectionBody, crumb, crumbText, sr });
    });
  }

  const groups = Array.from(document.querySelectorAll<HTMLElement>('.settings-section .settings-group'));
  const navLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>('.settings-nav-link'));
  const navHeadings = Array.from(document.querySelectorAll<HTMLElement>('.settings-nav-heading'));
  const linkFor = (section: HTMLElement) => navLinks.find(l => l.getAttribute('href') === `#${section.id}`);
  const colourBodies = COLOUR_GROUPS.map(g => document.getElementById(g.body)).filter((b): b is HTMLElement => b !== null);

  let changedOnly = false;

  /** Mark the changed rows and colour groups and show how many there are. Cheap enough to run after every edit. */
  const changedIn = new Map<HTMLElement, number>();
  function refreshChanged(): void {
    let n = 0;
    changedIn.clear();
    const tally = (sectionBody: HTMLElement | null): void => {
      n++;
      if (sectionBody) changedIn.set(sectionBody, (changedIn.get(sectionBody) ?? 0) + 1);
    };
    for (const r of rows) {
      const changed = isChanged(r.row);
      r.row.classList.toggle('settings-row--changed', changed);
      r.sr.textContent = changed ? t('settings.changedSr', ' (changed from default)') : '';
      const rowBtn = r.row.querySelector<HTMLElement>(':scope > .settings-row-reset');
      if (rowBtn) rowBtn.hidden = !changed;
      if (changed) tally(r.sectionBody);
    }
    for (const body of colourBodies) {
      const changed = colourGroupChanged(body.id);
      body.closest('.settings-group')?.classList.toggle('settings-group--changed', changed);
      if (changed) tally(body.closest<HTMLElement>('.settings-section-body'));
    }
    for (const section of sections) {
      const btn = section.querySelector<HTMLElement>(':scope > .settings-section-reset');
      const body = bodyOfSection.get(section);
      if (btn && body) btn.hidden = !changedIn.get(body);
    }
    if (changedCount) changedCount.textContent = n > 0 ? String(n) : '';
  }
  const later = (): void => { window.setTimeout(refreshChanged, 0); };

  // A small ↺ on every changed row, and a "Reset section" on every section head. Both are shown only
  // while there is something to reset, and both can be undone from the toast that follows.
  for (const r of rows) {
    const name = r.label.textContent?.trim() ?? '';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'settings-row-reset';
    btn.hidden = true;
    btn.textContent = '↺';
    btn.title = t('settings.resetRowTitle', 'Reset this setting to its default');
    btn.setAttribute('aria-label', t('settings.resetRowAria', 'Reset {name} to its default').replace('{name}', name));
    btn.addEventListener('click', () => {
      const restore = captureRow(r.row);
      resetRow(r.row);
      showUndo(t('settings.undoRow', 'Reset “{name}” to its default.').replace('{name}', name), () => { restore(); later(); });
      later();
      // The button is about to disappear; leave focus on the setting itself rather than on <body>.
      r.row.querySelector<HTMLElement>('.sort-order-btn.active, select, input:not([type="hidden"]), button:not(.settings-row-reset)')?.focus();
    });
    r.row.appendChild(btn);
  }
  for (const section of sections) {
    const body = bodyOfSection.get(section);
    if (!body) continue;
    const title = titleOfBody.get(body) ?? '';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'settings-section-reset';
    btn.hidden = true;
    btn.textContent = t('settings.resetSection', 'Reset section');
    btn.title = t('settings.resetSectionTitle', 'Put every changed setting in {title} back to its default').replace('{title}', title);
    btn.addEventListener('click', () => {
      const mine = rows.filter(r => r.sectionBody === body && isChanged(r.row));
      const colours = colourBodies.filter(b => b.closest('.settings-section-body') === body && colourGroupChanged(b.id));
      const restores = [...mine.map(r => captureRow(r.row)), ...colours.map(b => captureColourGroup(b.id))];
      mine.forEach(r => resetRow(r.row));
      colours.forEach(b => resetColourGroup(b.id));
      const count = mine.length + colours.length;
      showUndo(t('settings.undoSection', 'Reset {n} changed setting(s) in {title}.').replace('{n}', String(count)).replace('{title}', title),
        () => { restores.forEach(r => r()); later(); });
      later();
      section.querySelector<HTMLElement>(':scope > .settings-collapse-btn')?.focus();
    });
    section.appendChild(btn);
  }

  // Only ever holds groups/sections *this* search opened — checked against
  // their live collapsed state before adding, so something already open on
  // its own (or left open by the user) is never in here and never touched.
  const forcedOpen: HTMLElement[] = [];

  function forceOpen(body: HTMLElement): void {
    // Also opens every collapsed ancestor: a match inside the Advanced fold has to open the fold.
    for (let el: HTMLElement | null = body; el; el = el.parentElement?.closest<HTMLElement>('.filter-body') ?? null) {
      if (!el.classList.contains('filter-body--collapsed')) continue;
      el.classList.remove('filter-body--collapsed');
      document.querySelector(`[data-collapse="${el.id}"]`)?.setAttribute('aria-expanded', 'true');
      forcedOpen.push(el);
    }
  }

  function revertForcedOpen(): void {
    for (const body of forcedOpen) {
      body.classList.add('filter-body--collapsed');
      document.querySelector(`[data-collapse="${body.id}"]`)?.setAttribute('aria-expanded', 'false');
    }
    forcedOpen.length = 0;
  }

  /** Hide a nav box, and its heading, when every link inside it is hidden. */
  function syncNavHeadings(): void {
    for (const heading of navHeadings) {
      const box = heading.closest<HTMLElement>('.settings-nav-group');
      const anyVisible = Array.from(box?.querySelectorAll<HTMLElement>('.settings-nav-link') ?? []).some(l => !l.hidden);
      heading.hidden = !anyVisible;
      if (box) box.hidden = !anyVisible;
    }
  }

  function applySearch(): void {
    revertForcedOpen();
    const raw = input!.value;
    const q = foldKey(raw.trim());

    if (!q && !changedOnly) {
      rows.forEach(r => { r.row.hidden = false; r.crumb.hidden = true; fillHighlighted(r.label, r.label.textContent ?? '', ''); });
      groups.forEach(g => { g.hidden = false; });
      document.querySelectorAll<HTMLElement>('.settings-fold').forEach(f => { f.hidden = false; });
      sections.forEach(s => { s.hidden = false; });
      navLinks.forEach(l => { l.hidden = false; });
      syncNavHeadings();
      if (empty) empty.hidden = true;
      return;
    }

    const sectionMatched = new Set<HTMLElement>();
    const groupMatched   = new Set<HTMLElement>();

    for (const r of rows) {
      const groupText = r.groupBody ? groupHeading.get(r.groupBody) ?? '' : '';
      const secText    = sectionTitle.get(r.sectionBody) ?? '';
      const textOk = !q || r.text.includes(q) || groupText.includes(q) || secText.includes(q);
      const match = textOk && (!changedOnly || isChanged(r.row));
      r.row.hidden = !match;
      r.crumb.hidden = !match;
      if (!match) continue;
      r.crumb.textContent = r.crumbText;
      sectionMatched.add(r.sectionBody);
      if (r.groupBody) groupMatched.add(r.groupBody);
      fillHighlighted(r.label, r.label.textContent ?? '', raw);
    }

    // A group with no rows of its own (the colour pickers) matches on its heading, or — when showing
    // changed settings only — on having any colour overridden.
    for (const g of groups) {
      const body = g.querySelector<HTMLElement>(':scope > .filter-body');
      if (!body) continue;
      if (g.querySelector('.settings-row')) {
        g.hidden = !groupMatched.has(body);
      } else {
        const textOk = !q || (groupHeading.get(body) ?? '').includes(q);
        const changedOk = !changedOnly || colourGroupChanged(body.id);
        g.hidden = !(textOk && changedOk);
        if (!g.hidden) {
          groupMatched.add(body);
          const sec = g.closest<HTMLElement>('.settings-section-body');
          if (sec) sectionMatched.add(sec);
        }
      }
    }
    // An Advanced fold with no visible group left inside it has nothing to show.
    document.querySelectorAll<HTMLElement>('.settings-fold').forEach(f => { f.hidden = !f.querySelector('.settings-group:not([hidden])'); });

    groupMatched.forEach(forceOpen);
    sectionMatched.forEach(forceOpen);

    let anyMatch = false;
    for (const section of sections) {
      const sectionBody = bodyOfSection.get(section);
      const matched = sectionBody ? sectionMatched.has(sectionBody) : false;
      section.hidden = !matched;
      if (matched) anyMatch = true;
      const link = linkFor(section);
      if (link) link.hidden = !matched;
    }
    syncNavHeadings();

    if (empty) empty.hidden = anyMatch;
  }

  input.addEventListener('input', applySearch);
  changedBtn?.addEventListener('click', () => {
    changedOnly = !changedOnly;
    changedBtn.setAttribute('aria-pressed', String(changedOnly));
    refreshChanged();
    applySearch();
  });

  // "/" jumps to the search box, the way it does on most sites — but never while typing in a field.
  document.addEventListener('keydown', e => {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
    if ((e.target as HTMLElement | null)?.closest('input, textarea, select, [contenteditable="true"]')) return;
    const area = document.getElementById('settingsArea');
    if (!area || area.hidden) return;
    e.preventDefault();
    input.focus();
    input.select();
  });

  // Reset everything to defaults: drop every stored preference, then reload so each control (and
  // whatever reads a setting at startup) starts again from its own default. The snapshot rides
  // through the reload in sessionStorage so the page can offer Undo once it is back.
  document.getElementById('settingsResetAll')?.addEventListener('click', () => {
    if (!window.confirm(t('settings.resetAllConfirm', 'Reset every setting to its default?\n\nYour lists, progress, history and saved profiles are not affected.'))) return;
    const before = snapshotSettings();
    if (Object.keys(before).length > 0) {
      try { window.sessionStorage.setItem(UNDO_ALL_KEY, JSON.stringify(before)); } catch { /* no undo, but the reset still works */ }
    }
    resetAllSettings();
    window.location.reload();
  });
  offerUndoOfResetAll();

  // Links: `#setting=<control id>` in the address bar, or any element carrying data-setting-link.
  const followHash = (): void => {
    const m = /^#setting=([\w-]+)$/.exec(window.location.hash);
    if (!m) return;
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    openSetting(m[1]);
  };
  window.addEventListener('hashchange', followHash);
  document.addEventListener('click', e => {
    const link = (e.target as Element).closest<HTMLElement>('[data-setting-link]');
    if (!link) return;
    e.preventDefault();
    openSetting(link.dataset.settingLink ?? '');
  });
  window.setTimeout(followHash, 300);

  // Keep the markers and the count current as settings are edited. This does not re-run the filter:
  // resetting a setting to its default while "changed only" is on should not make its row vanish
  // out from under the cursor.
  const wrap = document.querySelector('.settings-wrap');
  (['click', 'change', 'input'] as const).forEach(type => wrap?.addEventListener(type, later));
  refreshChanged();

  // Highlight the section being read in the nav, and remember it for next time. A thin band near the
  // top of the viewport decides which section is "current".
  if ('IntersectionObserver' in window) {
    const inBand = new Set<string>();
    let saveTimer: ReturnType<typeof setTimeout> | undefined;
    const observer = new IntersectionObserver(entries => {
      for (const e of entries) {
        if (e.isIntersecting) inBand.add(e.target.id); else inBand.delete(e.target.id);
      }
      const current = [...sections].reverse().find(sec => inBand.has(sec.id));
      if (!current) return;
      navLinks.forEach(l => l.classList.toggle('is-current', l.getAttribute('href') === `#${current.id}`));
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => writeString(LAST_SECTION_KEY, current.id), 400);
    }, { rootMargin: '-10% 0px -80% 0px' });
    sections.forEach(sec => observer.observe(sec));
  }
}

// ── Undo for "Reset all" ──────────────────────────────────────────────────

const UNDO_ALL_KEY = 'settingsUndoSnapshot';

/** Back from the reload that "Reset all" causes: say so, and offer to put everything back. */
function offerUndoOfResetAll(): void {
  let saved: SettingsSnapshot;
  try {
    const raw = window.sessionStorage.getItem(UNDO_ALL_KEY);
    window.sessionStorage.removeItem(UNDO_ALL_KEY);
    if (!raw) return;
    saved = JSON.parse(raw) as SettingsSnapshot;
  } catch { return; }
  showUndo(t('settings.undoAll', 'Every setting was reset to its default.'), () => {
    restoreSettingsSnapshot(saved);
    window.location.reload();
  }, 15000);
}

/**
 * Fill in the streak/progress numbers — live values, not a setting, so this
 * runs on every Settings tab visit (see app.ts's onActivate.settings) rather
 * than only once at load like the toggle-restore logic above.
 */
