// @vitest-environment jsdom
/**
 * class-filter.test.ts — the Part of Speech pill-toggle filter
 * (src/client/filters/class-filter.ts). table-filters.test.ts already
 * exercises applyClassSelection()/getSelectedClasses() through a minimal
 * document stub as part of a combined-filters scenario; this file covers
 * the DOM wiring (bindClassFilter/syncUI, the click-delegation split between
 * chips and header controls, the "change" event) and the chain-payload
 * mover, which need real element behavior (closest, bubbling), hence jsdom.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

function setMode(mode: string): void {
  localStorage.setItem('vq_mode', mode);
  document.querySelectorAll('.mode-tab').forEach(el => el.classList.remove('active'));
  let tab = document.querySelector<HTMLElement>(`.mode-tab[data-mode="${mode}"]`);
  if (!tab) {
    tab = document.createElement('button');
    tab.className = 'mode-tab';
    tab.dataset.mode = mode;
    document.body.appendChild(tab);
  }
  tab.classList.add('active');
}

function setLang(lang: string): void {
  let sel = document.getElementById('langSelect') as HTMLSelectElement | null;
  if (!sel) {
    sel = document.createElement('select');
    sel.id = 'langSelect';
    document.body.appendChild(sel);
  }
  if (![...sel.options].some(o => o.value === lang)) {
    const opt = document.createElement('option');
    opt.value = lang;
    sel.appendChild(opt);
  }
  sel.value = lang;
}

const POS_LIST = ['verb', 'noun', 'adjective', 'adverb'];

/** Markup matching index.html's #classFilter box: an "All" chip, one chip
 *  per POS, and the shared header controls (excluded from the chip
 *  click-delegation by class-filter.ts itself). */
function buildClassFilterFixture(): void {
  const wrap = document.createElement('div');
  wrap.id = 'classFilter';
  wrap.className = 'class-filter-wrap';

  const allChip = document.createElement('button');
  allChip.className = 'pos-chip pos-chip-all active';
  allChip.textContent = 'All';
  wrap.appendChild(allChip);

  for (const pos of POS_LIST) {
    const chip = document.createElement('button');
    chip.className = 'pos-chip';
    chip.dataset.pos = pos;
    chip.textContent = pos;
    wrap.appendChild(chip);
  }

  const headerControls = document.createElement('span');
  headerControls.className = 'filter-header-controls';
  const activeBtn = document.createElement('button');
  activeBtn.id = 'classFilterActive';
  activeBtn.appendChild(document.createElement('span')).className = 'filter-active-label';
  const chainBtn = document.createElement('button');
  chainBtn.id = 'classFilterChain';
  headerControls.append(activeBtn, chainBtn);
  wrap.appendChild(headerControls);

  const note = document.createElement('p');
  note.id = 'classFilterChainNote';
  note.hidden = true;
  wrap.appendChild(note);

  document.body.appendChild(wrap);
}

function chip(pos: string): HTMLButtonElement {
  return document.querySelector<HTMLButtonElement>(`.pos-chip[data-pos="${pos}"]`)!;
}
function allChip(): HTMLButtonElement {
  return document.querySelector<HTMLButtonElement>('.pos-chip-all')!;
}
function click(el: Element): void {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

async function load() {
  return import('../../src/client/filters/class-filter.js');
}

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  document.body.innerHTML = '';
  setMode('table');
  setLang('spanish');
});

describe('bindClassFilter / syncUI', () => {
  it('bindClassFilter does nothing when #classFilter is missing', async () => {
    const { bindClassFilter } = await load();
    expect(() => bindClassFilter()).not.toThrow();
  });

  it('syncUI does nothing when #classFilter is missing', async () => {
    const { syncUI } = await load();
    expect(() => syncUI()).not.toThrow();
  });

  it('starts with "All" active and no POS chips selected', async () => {
    buildClassFilterFixture();
    const { bindClassFilter } = await load();
    bindClassFilter();
    expect(allChip().classList.contains('active')).toBe(true);
    POS_LIST.forEach(pos => expect(chip(pos).classList.contains('active')).toBe(false));
  });
});

describe('clicking a chip', () => {
  beforeEach(() => buildClassFilterFixture());

  it('selects a POS, marks its chip active, and clears "All"', async () => {
    const { bindClassFilter, getSelectedClasses } = await load();
    bindClassFilter();
    click(chip('verb'));
    expect(chip('verb').classList.contains('active')).toBe(true);
    expect(allChip().classList.contains('active')).toBe(false);
    expect(getSelectedClasses()).toEqual(['verb']);
  });

  it('supports multiple POS selected at once', async () => {
    const { bindClassFilter, getSelectedClasses } = await load();
    bindClassFilter();
    click(chip('verb'));
    click(chip('noun'));
    expect(getSelectedClasses().sort()).toEqual(['noun', 'verb']);
  });

  it('clicking a selected chip again deselects it', async () => {
    const { bindClassFilter, getSelectedClasses } = await load();
    bindClassFilter();
    click(chip('verb'));
    click(chip('verb'));
    expect(chip('verb').classList.contains('active')).toBe(false);
    expect(getSelectedClasses()).toEqual([]);
  });

  it('deselecting every chip returns to "All" active', async () => {
    const { bindClassFilter } = await load();
    bindClassFilter();
    click(chip('verb'));
    click(chip('verb'));
    expect(allChip().classList.contains('active')).toBe(true);
  });

  it('clicking "All" clears every selection', async () => {
    const { bindClassFilter, getSelectedClasses } = await load();
    bindClassFilter();
    click(chip('verb'));
    click(chip('noun'));
    click(allChip());
    expect(getSelectedClasses()).toEqual([]);
    expect(allChip().classList.contains('active')).toBe(true);
    POS_LIST.forEach(pos => expect(chip(pos).classList.contains('active')).toBe(false));
  });

  it('selecting a POS always turns the filter on, even if it had been switched off', async () => {
    const { bindClassFilter, getClassFilterState } = await load();
    bindClassFilter();
    document.getElementById('classFilterActive')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(getClassFilterState().active).toBe(false);
    click(chip('verb'));
    expect(getClassFilterState().active).toBe(true);
  });

  it('a click on a header control does not toggle any chip', async () => {
    const { bindClassFilter, getSelectedClasses } = await load();
    bindClassFilter();
    // The active/chain buttons have their own listeners (tested via
    // filter-header.test.ts); what matters here is that #classFilter's own
    // delegated handler ignores clicks inside .filter-header-controls
    // rather than misreading them as a chip pick.
    document.getElementById('classFilterActive')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(getSelectedClasses()).toEqual([]);
    expect(allChip().classList.contains('active')).toBe(true);
  });

  it('a click that misses every chip and control is ignored', async () => {
    const { bindClassFilter, getSelectedClasses } = await load();
    bindClassFilter();
    document.getElementById('classFilter')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(getSelectedClasses()).toEqual([]);
  });

  it('dispatches a bubbling "change" event on #classFilter for each selection change', async () => {
    const { bindClassFilter } = await load();
    bindClassFilter();
    const onChange = vi.fn();
    document.body.addEventListener('change', onChange);
    click(chip('verb'));
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe('getSelectedClasses', () => {
  beforeEach(() => buildClassFilterFixture());

  it('is empty while Kid-Friendly Mode is on, regardless of selection', async () => {
    const { bindClassFilter, getSelectedClasses } = await load();
    bindClassFilter();
    click(chip('verb'));
    localStorage.setItem('s_kid_friendly_mode', 'true');
    expect(getSelectedClasses()).toEqual([]);
  });

  it('is empty when the current mode has this filter hidden', async () => {
    const { bindClassFilter, getSelectedClasses } = await load();
    bindClassFilter();
    click(chip('verb'));
    localStorage.setItem('s_hide_pos_filter_modes', 'table');
    expect(getSelectedClasses()).toEqual([]);
  });

  it('is empty when the filter is switched off, even with a real selection stored', async () => {
    const { bindClassFilter, getSelectedClasses } = await load();
    bindClassFilter();
    click(chip('verb'));
    document.getElementById('classFilterActive')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(getSelectedClasses()).toEqual([]);
  });
});

describe('getClassFilterState', () => {
  beforeEach(() => buildClassFilterFixture());

  it('distinguishes "off with a selection" from "on with nothing selected"', async () => {
    const { bindClassFilter, getClassFilterState } = await load();
    bindClassFilter();
    click(chip('verb'));
    document.getElementById('classFilterActive')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(getClassFilterState()).toEqual({ active: false, selected: ['verb'] });
  });
});

describe('applyClassSelection', () => {
  beforeEach(() => buildClassFilterFixture());

  it('sets the selection and active flag directly, and repaints', async () => {
    const { bindClassFilter, applyClassSelection, getClassFilterState } = await load();
    bindClassFilter();
    applyClassSelection(['verb', 'noun'], false);
    expect(getClassFilterState()).toEqual({ active: false, selected: ['verb', 'noun'] });
    expect(allChip().classList.contains('active')).toBe(false);
    expect(chip('verb').classList.contains('active')).toBe(true);
  });

  it('defaults to switching the filter on', async () => {
    const { bindClassFilter, applyClassSelection, getClassFilterState } = await load();
    bindClassFilter();
    applyClassSelection(['adverb']);
    expect(getClassFilterState().active).toBe(true);
  });
});

describe('copyStateForTest (the chain button\'s payload mover)', () => {
  beforeEach(() => buildClassFilterFixture());

  it('copies a bucket\'s state as an independent value, not a live reference', async () => {
    const { bindClassFilter, applyClassSelection, copyStateForTest, getClassFilterState } = await load();
    bindClassFilter();
    applyClassSelection(['noun'], true); // table starts chained -> lands in the shared bucket

    // Unlink Table so its own bucket actually diverges from shared.
    document.getElementById('classFilterChain')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    applyClassSelection(['verb'], true); // now writes into Table's own bucket only

    copyStateForTest('table', 'shared'); // shared := a copy of Table's current state
    applyClassSelection(['adverb'], true); // mutate Table's own bucket again afterward

    // My Lists is still chained by default -> reads the shared bucket, which
    // should hold the snapshot taken at copy time, unaffected by Table's
    // later change.
    setMode('mylists');
    expect(getClassFilterState()).toEqual({ active: true, selected: ['verb'] });
  });

  it('defaults an unwritten source bucket to active:true, nothing selected', async () => {
    const { copyStateForTest, bindClassFilter, getClassFilterState } = await load();
    bindClassFilter();
    copyStateForTest('nonexistent-bucket', 'shared');
    // Table is still chained by default -> reads the shared bucket directly.
    expect(getClassFilterState()).toEqual({ active: true, selected: [] });
  });
});

describe('chaining integration (real filter-header + filter-state)', () => {
  beforeEach(() => buildClassFilterFixture());

  it('unlinking Table keeps its selection while Picture stays on the shared bucket', async () => {
    const { bindClassFilter, getSelectedClasses } = await load();
    bindClassFilter();
    click(chip('verb')); // select a baseline while linked
    expect(getSelectedClasses()).toEqual(['verb']);

    document.getElementById('classFilterChain')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(getSelectedClasses()).toEqual(['verb']); // unchanged at the moment of unlinking

    click(chip('noun')); // now diverges onto Table's own bucket
    expect(getSelectedClasses().sort()).toEqual(['noun', 'verb']);

    setMode('picture');
    expect(getSelectedClasses()).toEqual(['verb']); // still reading the shared bucket
  });
});
