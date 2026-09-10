// @vitest-environment jsdom
/**
 * script-type-filter.test.ts — the Kanji/Katakana/Hiragana pill-toggle
 * filter (src/client/filters/script-type-filter.ts). Same interaction shape
 * as class-filter.ts (see class-filter.test.ts): an "All" chip active means
 * no filtering, individual chips narrow the pool. Uses jsdom for the same
 * reason class-filter.test.ts does — the click delegation needs real
 * element behavior (closest, bubbling).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

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

const SCRIPTS = ['kanji', 'katakana', 'hiragana'];

/** Markup matching index.html's #scriptTypeFilterWrap box: an "All" chip
 *  plus one chip per script type. */
function buildFixture(): void {
  const wrap = document.createElement('div');
  wrap.id = 'scriptTypeFilterWrap';
  wrap.className = 'class-filter-wrap';

  const allChip = document.createElement('button');
  allChip.className = 'pos-chip pos-chip-all active';
  allChip.textContent = 'All';
  wrap.appendChild(allChip);

  for (const script of SCRIPTS) {
    const chip = document.createElement('button');
    chip.className = 'pos-chip';
    chip.dataset.script = script;
    chip.textContent = script;
    wrap.appendChild(chip);
  }

  document.body.appendChild(wrap);
}

function chip(script: string): HTMLButtonElement {
  return document.querySelector<HTMLButtonElement>(`.pos-chip[data-script="${script}"]`)!;
}
function allChip(): HTMLButtonElement {
  return document.querySelector<HTMLButtonElement>('.pos-chip-all')!;
}
function click(el: Element): void {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

async function load() {
  return import('../../src/client/filters/script-type-filter.js');
}

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  document.body.innerHTML = '';
  setLang('japanese');
});

describe('bindScriptTypeFilter / syncScriptTypeUI', () => {
  it('bindScriptTypeFilter does nothing when #scriptTypeFilterWrap is missing', async () => {
    const { bindScriptTypeFilter } = await load();
    expect(() => bindScriptTypeFilter()).not.toThrow();
  });

  it('syncScriptTypeUI does nothing when #scriptTypeFilterWrap is missing', async () => {
    const { syncScriptTypeUI } = await load();
    expect(() => syncScriptTypeUI()).not.toThrow();
  });

  it('starts with "All" active and no script chips selected', async () => {
    buildFixture();
    const { bindScriptTypeFilter } = await load();
    bindScriptTypeFilter();
    expect(allChip().classList.contains('active')).toBe(true);
    SCRIPTS.forEach(s => expect(chip(s).classList.contains('active')).toBe(false));
  });
});

describe('clicking a chip', () => {
  beforeEach(() => buildFixture());

  it('selects a script type, marks its chip active, and clears "All"', async () => {
    const { bindScriptTypeFilter, getSelectedScriptTypes } = await load();
    bindScriptTypeFilter();
    click(chip('kanji'));
    expect(chip('kanji').classList.contains('active')).toBe(true);
    expect(allChip().classList.contains('active')).toBe(false);
    expect(getSelectedScriptTypes()).toEqual(['kanji']);
  });

  it('supports multiple script types selected at once', async () => {
    const { bindScriptTypeFilter, getSelectedScriptTypes } = await load();
    bindScriptTypeFilter();
    click(chip('kanji'));
    click(chip('hiragana'));
    expect(getSelectedScriptTypes().sort()).toEqual(['hiragana', 'kanji']);
  });

  it('clicking a selected chip again deselects it', async () => {
    const { bindScriptTypeFilter, getSelectedScriptTypes } = await load();
    bindScriptTypeFilter();
    click(chip('kanji'));
    click(chip('kanji'));
    expect(chip('kanji').classList.contains('active')).toBe(false);
    expect(getSelectedScriptTypes()).toEqual([]);
  });

  it('deselecting every chip returns to "All" active', async () => {
    const { bindScriptTypeFilter } = await load();
    bindScriptTypeFilter();
    click(chip('kanji'));
    click(chip('kanji'));
    expect(allChip().classList.contains('active')).toBe(true);
  });

  it('clicking "All" clears every selection', async () => {
    const { bindScriptTypeFilter, getSelectedScriptTypes } = await load();
    bindScriptTypeFilter();
    click(chip('kanji'));
    click(chip('katakana'));
    click(allChip());
    expect(getSelectedScriptTypes()).toEqual([]);
    expect(allChip().classList.contains('active')).toBe(true);
  });

  it('dispatches a bubbling "change" event for each selection change', async () => {
    const { bindScriptTypeFilter } = await load();
    bindScriptTypeFilter();
    const onChange = vi.fn();
    document.body.addEventListener('change', onChange);
    click(chip('kanji'));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('a click that misses every chip is ignored', async () => {
    const { bindScriptTypeFilter, getSelectedScriptTypes } = await load();
    bindScriptTypeFilter();
    document.getElementById('scriptTypeFilterWrap')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(getSelectedScriptTypes()).toEqual([]);
  });

  it('selection is stored per language', async () => {
    const { bindScriptTypeFilter, getSelectedScriptTypes } = await load();
    bindScriptTypeFilter();
    click(chip('kanji'));
    setLang('chinese');
    expect(getSelectedScriptTypes()).toEqual([]);
    setLang('japanese');
    expect(getSelectedScriptTypes()).toEqual(['kanji']);
  });
});

describe('getSelectedScriptTypes', () => {
  beforeEach(() => buildFixture());

  it('is empty while Kid-Friendly Mode is on, regardless of selection', async () => {
    const { bindScriptTypeFilter, getSelectedScriptTypes } = await load();
    bindScriptTypeFilter();
    click(chip('kanji'));
    localStorage.setItem('s_kid_friendly_mode', 'true');
    expect(getSelectedScriptTypes()).toEqual([]);
  });
});

describe('getScriptTypeSelection (raw, for presets)', () => {
  beforeEach(() => buildFixture());

  it('returns the real selection even while Kid-Friendly Mode is on', async () => {
    const { bindScriptTypeFilter, getScriptTypeSelection } = await load();
    bindScriptTypeFilter();
    click(chip('kanji'));
    localStorage.setItem('s_kid_friendly_mode', 'true');
    expect(getScriptTypeSelection()).toEqual(['kanji']);
  });
});

describe('applyScriptTypeSelection', () => {
  beforeEach(() => buildFixture());

  it('sets the selection directly and repaints', async () => {
    const { bindScriptTypeFilter, applyScriptTypeSelection, getSelectedScriptTypes } = await load();
    bindScriptTypeFilter();
    applyScriptTypeSelection(['kanji', 'hiragana']);
    expect(getSelectedScriptTypes().sort()).toEqual(['hiragana', 'kanji']);
    expect(allChip().classList.contains('active')).toBe(false);
    expect(chip('kanji').classList.contains('active')).toBe(true);
    expect(chip('hiragana').classList.contains('active')).toBe(true);
  });

  it('applying [] resets to "All" active', async () => {
    const { bindScriptTypeFilter, applyScriptTypeSelection } = await load();
    bindScriptTypeFilter();
    applyScriptTypeSelection(['kanji']);
    applyScriptTypeSelection([]);
    expect(allChip().classList.contains('active')).toBe(true);
  });
});

describe('applyScriptTypeFilter', () => {
  it('passes every word through when no script type is selected', async () => {
    const { applyScriptTypeFilter } = await load();
    const words = [{ word: '会社' }, { word: 'ある' }, { word: 'コーヒー' }];
    expect(applyScriptTypeFilter(words, [])).toEqual(words);
  });

  it('narrows to the selected script types', async () => {
    const { applyScriptTypeFilter } = await load();
    const words = [{ word: '会社' }, { word: 'ある' }, { word: 'コーヒー' }];
    expect(applyScriptTypeFilter(words, ['kanji'])).toEqual([{ word: '会社' }]);
    expect(applyScriptTypeFilter(words, ['hiragana', 'katakana']))
      .toEqual([{ word: 'ある' }, { word: 'コーヒー' }]);
  });

  it('passes through a word with no classifiable Japanese script unconditionally', async () => {
    const { applyScriptTypeFilter } = await load();
    const words = [{ word: '会社' }, { word: '123' }];
    // '123' has no kanji/kana at all — classifyJapaneseScript returns null,
    // and a filter can't narrow by a fact this word doesn't have.
    expect(applyScriptTypeFilter(words, ['kanji'])).toEqual(words);
  });
});
