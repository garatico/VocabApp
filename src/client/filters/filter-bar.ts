/**
 * filter-bar.ts — Part of Speech, Lists and Domains presented as one
 * "Filters" bar instead of three stacked boxes.
 *
 * Presentation only. Each filter keeps its own module, state, On/Off switch,
 * chain and Hide/Focus (class-filter.ts, word-lists.ts's list filter,
 * domain-filter.ts); this file just
 *
 *   1. makes each box's body open as a popover under its header pill — one at
 *      a time, closing on an outside click —
 *   2. moves the controls that only matter while editing (Lists' Hide/Focus and
 *      count, Domains' Clear all) into a header row at the top of that popover,
 *      while On/Off and the link toggle stay on the pill — a collapsed filter
 *      still has to say whether it is doing anything — and
 *   3. draws a summary strip of what is actually filtering right now, each
 *      selection removable with one click, plus "Clear all".
 *
 * The controls are *moved*, not rebuilt: every one keeps its id and listeners,
 * so the filters' own binding code neither knows nor cares where they sit.
 *
 * The strip is rebuilt from the filters' stored state whenever anything inside
 * the bar changes (a MutationObserver — the modules repaint their own DOM on
 * every change, language switch and mode switch, so that is the one signal all
 * of them already give).
 */

import { getClassFilterState, applyClassSelection } from './class-filter.ts';
import { getDomainFilterState, applyDomainSelection } from './domain-filter.ts';
import { currentLangValue } from './filter-lang.ts';
import { currentScope } from './filter-scope.ts';
import {
  getActiveProfile, setActiveProfile, applyPreset, savePreset,
} from './presets.ts';
import {
  getListFilterState, saveListFilterState, refreshFilterSelect, parseSelected,
} from '../utils/word-lists.ts';

const BOXES = ['classFilter', 'listFilter', 'domainFilterWrap'] as const;

function boxes(): HTMLElement[] {
  return BOXES.map(id => document.getElementById(id)).filter((e): e is HTMLElement => !!e);
}

function collapseButton(box: HTMLElement): HTMLButtonElement | null {
  return box.querySelector<HTMLButtonElement>('.filter-collapse-btn[data-collapse]');
}

function isOpen(box: HTMLElement): boolean {
  return collapseButton(box)?.getAttribute('aria-expanded') === 'true';
}

/** Close a box's popover without touching its remembered open/closed state. */
function closeBox(box: HTMLElement): void {
  const btn = collapseButton(box);
  const body = btn ? document.getElementById(btn.dataset.collapse ?? '') : null;
  if (!btn || !body) return;
  btn.setAttribute('aria-expanded', 'false');
  body.classList.add('filter-body--collapsed');
}

function isShown(el: HTMLElement | null): boolean {
  return !!el && !el.hidden && getComputedStyle(el).display !== 'none';
}

function titleCase(s: string): string {
  return s.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
}

// ── Controls → popover header ──────────────────────────────────────────────

/** Selector lists, in the order they should appear, of what moves per box. */
const MOVED_CONTROLS: Record<typeof BOXES[number], string[]> = {
  classFilter:      [],
  listFilter:       ['#listFilterMode', '.list-filter-count'],
  domainFilterWrap: ['#clearAllDomains'],
};

/** The element to move for a control: its `.filter-header-controls` wrapper if it has one. */
function movable(box: HTMLElement, selector: string): HTMLElement | null {
  const el = box.querySelector<HTMLElement>(selector);
  return el?.closest<HTMLElement>('.filter-header-controls') ?? el;
}

function moveControlsIntoPopovers(): void {
  BOXES.forEach(id => {
    const box = document.getElementById(id);
    const btn = box ? collapseButton(box) : null;
    const body = btn ? document.getElementById(btn.dataset.collapse ?? '') : null;
    if (!box || !body) return;

    const head = body.querySelector<HTMLElement>('.filter-popover-head') ?? document.createElement('div');
    head.className = 'filter-popover-head';
    const seen = new Set<HTMLElement>();
    MOVED_CONTROLS[id].forEach(sel => {
      const el = movable(box, sel);
      if (el && !seen.has(el)) { seen.add(el); head.appendChild(el); }
    });
    if (head.children.length > 0) body.insertBefore(head, body.firstChild);

    // The pill keeps a small count of what is selected (Domains already has
    // its own in its label).
    if (id !== 'domainFilterWrap' && !btn!.querySelector('.filters-pill-count')) {
      const count = document.createElement('span');
      count.className = 'filters-pill-count';
      btn!.appendChild(count);
    }
  });
}

function setPillCount(boxId: string, selected: number): void {
  const el = document.querySelector<HTMLElement>(`#${boxId} .filters-pill-count`);
  if (!el) return;
  // (On/Off has its own button on the pill, so the count is just the count.)
  const text = selected > 0 ? String(selected) : '';
  // Only write on a real change: this element sits inside the subtree the
  // MutationObserver watches, so an unconditional write would re-trigger a
  // summary refresh forever.
  if (el.textContent !== text) el.textContent = text;
  if (el.hidden !== (text === '')) el.hidden = text === '';
}

function updatePillCounts(): void {
  const cls = getClassFilterState();
  setPillCount('classFilter', cls.selected.length);
  const lst = getListFilterState(currentLangValue());
  setPillCount('listFilter', lst.selected.length);
}

// ── Summary strip ───────────────────────────────────────────────────────────

interface Chip { label: string; off: boolean; remove: () => void; }
interface Group { title: string; mode?: string; chips: Chip[]; }

function collectGroups(): Group[] {
  const groups: Group[] = [];
  const lang = currentLangValue();

  if (isShown(document.getElementById('classFilter'))) {
    const s = getClassFilterState();
    if (s.selected.length > 0) {
      groups.push({
        title: 'Part of Speech',
        chips: s.selected.map(pos => ({
          label: titleCase(pos), off: !s.active,
          remove: () => applyClassSelection(s.selected.filter(p => p !== pos), s.active),
        })),
      });
    }
  }

  if (isShown(document.getElementById('listFilter'))) {
    const s = getListFilterState(lang);
    if (s.selected.length > 0) {
      groups.push({
        title: 'Lists', mode: s.mode === 'focus' ? 'Focus' : 'Hide',
        chips: s.selected.map(entry => ({
          label: parseSelected(entry, lang).name, off: !s.active,
          remove: () => {
            const next = getListFilterState(lang);
            next.selected = next.selected.filter(e => e !== entry);
            saveListFilterState(lang, next);
            refreshFilterSelect(lang);
            document.getElementById('listFilter')?.dispatchEvent(new Event('change', { bubbles: true }));
          },
        })),
      });
    }
  }

  if (isShown(document.getElementById('domainFilterWrap'))) {
    const s = getDomainFilterState();
    if (s.selected.length > 0) {
      groups.push({
        title: 'Domains',
        chips: s.selected.map(d => ({
          label: titleCase(d), off: !s.active,
          remove: () => applyDomainSelection(s.selected.filter(x => x !== d), s.active),
        })),
      });
    }
  }
  return groups;
}

/** "Profile: Verbs Only" — and, once the filters have drifted from what it
 *  saved, "modified" with Update / Revert. Its own block, ahead of the filters. */
function buildProfileBlock(): HTMLElement | null {
  const mode = currentScope();
  const active = getActiveProfile(mode);
  if (!active) return null;

  const wrap = document.createElement('span');
  wrap.className = 'filters-summary-group filters-summary-profile';
  const title = document.createElement('span');
  title.className = 'filters-summary-title';
  title.textContent = 'Profile';
  const name = document.createElement('span');
  name.className = 'filters-summary-profile-name';
  name.textContent = active.name;
  wrap.append(title, name);

  const small = (label: string, tip: string, onClick: () => void): HTMLButtonElement => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'filters-summary-action';
    b.textContent = label;
    b.title = tip;
    b.addEventListener('click', e => { e.stopPropagation(); onClick(); });
    return b;
  };

  if (active.modified) {
    const mod = document.createElement('span');
    mod.className = 'filters-summary-modified';
    mod.textContent = 'modified';
    wrap.appendChild(mod);
    wrap.appendChild(small('Update', `Save the current filters into "${active.name}"`, () => {
      savePreset(mode, active.name);
      renderSummary();
    }));
    wrap.appendChild(small('Revert', `Put the filters back to how "${active.name}" saved them`, () => {
      applyPreset(mode, active.name);
      renderSummary();
    }));
  }
  wrap.appendChild(small('×', 'Stop tracking this profile (the filters stay as they are)', () => {
    setActiveProfile(mode, null);
    renderSummary();
  }));
  return wrap;
}

function renderSummary(): void {
  updatePillCounts();
  const strip = document.getElementById('filtersSummary');
  if (!strip) return;
  const groups = collectGroups();
  const profile = buildProfileBlock();
  strip.innerHTML = '';
  strip.hidden = groups.length === 0 && !profile;
  if (groups.length === 0 && !profile) return;
  if (profile) strip.appendChild(profile);
  if (groups.length === 0) return;

  groups.forEach(g => {
    const wrap = document.createElement('span');
    wrap.className = 'filters-summary-group';
    const title = document.createElement('span');
    title.className = 'filters-summary-title';
    title.textContent = g.mode ? `${g.title} · ${g.mode}` : g.title;
    wrap.appendChild(title);
    g.chips.forEach(c => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'filters-summary-chip' + (c.off ? ' filters-summary-chip--off' : '');
      chip.title = c.off ? `${c.label} — this filter is switched off` : `Remove ${c.label}`;
      chip.append(document.createTextNode(c.label + ' '), Object.assign(document.createElement('span'), {
        textContent: '×', className: 'filters-summary-x',
      }));
      chip.addEventListener('click', e => { e.stopPropagation(); c.remove(); });
      wrap.appendChild(chip);
    });
    strip.appendChild(wrap);
  });

  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'filters-summary-clear';
  clear.textContent = 'Clear all';
  clear.addEventListener('click', e => {
    e.stopPropagation();
    // Snapshot first — each remove() re-reads state, so clearing in place
    // would skip entries as the arrays shrink under it.
    const snapshot = collectGroups();
    snapshot.forEach(g => g.chips.forEach(c => c.remove()));
  });
  strip.appendChild(clear);
}

// ── Wiring ──────────────────────────────────────────────────────────────────

export function initFiltersBar(): void {
  const row = document.getElementById('filtersRow');
  if (!row) return;

  moveControlsIntoPopovers();

  // Popovers are transient: whatever open state section-collapse restored
  // from an earlier session must not put a popover on screen at load.
  boxes().forEach(closeBox);

  // One open at a time; a click anywhere outside the bar closes them all.
  document.addEventListener('click', e => {
    // composedPath() is fixed at dispatch, so a box that repainted (and
    // detached the clicked node) while handling the click still counts as
    // the one that was clicked.
    const path = e.composedPath();
    const inside = boxes().find(b => path.includes(b));
    boxes().forEach(b => { if (b !== inside && isOpen(b)) closeBox(b); });
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') boxes().forEach(b => { if (isOpen(b)) closeBox(b); });
  });

  let queued = false;
  const schedule = (): void => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => { queued = false; renderSummary(); });
  };
  new MutationObserver(schedule).observe(row, {
    subtree: true, childList: true, characterData: true,
    attributes: true, attributeFilter: ['class', 'aria-pressed', 'hidden'],
  });
  row.addEventListener('change', schedule);
  // The applied profile is per mode, so a tab switch can change the strip.
  document.addEventListener('click', e => { if ((e.target as Element).closest('.mode-tab')) schedule(); });
  window.addEventListener('storage', schedule);
  renderSummary();
}
