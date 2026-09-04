// @vitest-environment jsdom
/**
 * ui-state.test.ts — src/client/ui/ui-state.ts: which controls-bar groups
 * show for which mode tab (updateModeUI, the ~25-element sweep app.ts calls
 * on every tab switch and every "hide this filter" Settings change), plus
 * getCurrentMode() and the sizeSelect/"custom" wiring in bindUIState().
 *
 * jsdom for real element behavior (scrollIntoView, classList, click-driven
 * event wiring). scrollIntoView is stubbed since jsdom doesn't implement
 * layout — same as domain-filter.test.ts's keyboard-nav tests.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getCurrentMode, bindUIState, bindModeSwitch } from '../../src/client/ui/ui-state.js';

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

const GROUP_IDS = [
  'controls', 'classFilter', 'listFilter', 'domainFilterWrap', 'wordsSizeGroup',
  'conjSizeSelectGroup', 'directionGroup', 'recallTimerGroup', 'sortOrderGroup',
  'conjDisplayGroup', 'conjViewGroup', 'conjModeControls', 'conjRandomTableSizeGroup',
  'conjMatchStyleGroup', 'pictureStyleGroup', 'triviaStyleGroup', 'triviaCategoryGroup',
  'guessBlankDifficultyGroup', 'triviaDifficultyGroup', 'triviaReadingDifficultyGroup',
  'triviaReadingLengthGroup', 'tableStyleGroup', 'compareGroup', 'presetsBtn',
];

const MODES = ['table', 'picture', 'conjugation', 'trivia', 'guessBlank', 'mylists', 'settings', 'history', 'chat', 'myContent'];

let groups: Record<string, HTMLElement>;
let tabs: Record<string, HTMLButtonElement>;

function buildFixture(): { tableArea: HTMLElement; pictureArea: HTMLElement; conjugationArea: HTMLElement } {
  document.body.innerHTML = '';
  groups = {};
  for (const id of GROUP_IDS) {
    const el = document.createElement('div');
    el.id = id;
    document.body.appendChild(el);
    groups[id] = el;
  }
  tabs = {};
  for (const m of MODES) {
    const btn = document.createElement('button');
    btn.className = 'mode-tab';
    btn.dataset.mode = m;
    document.body.appendChild(btn);
    tabs[m] = btn;
  }
  const tableArea = document.createElement('div'); tableArea.id = 'tableArea';
  const pictureArea = document.createElement('div'); pictureArea.id = 'pictureArea';
  const conjugationArea = document.createElement('div'); conjugationArea.id = 'conjugationArea';
  document.body.append(tableArea, pictureArea, conjugationArea);
  return { tableArea, pictureArea, conjugationArea };
}

function setHidden(legacyKeyModes: string, modes: string[]): void {
  localStorage.setItem(`s_${legacyKeyModes}_modes`, modes.join(','));
}

beforeEach(() => {
  localStorage.clear();
});

describe('getCurrentMode', () => {
  it('falls back to "table" when there is no active tab', () => {
    document.body.innerHTML = '';
    expect(getCurrentMode()).toBe('table');
  });

  it('reads the active tab\'s data-mode', () => {
    document.body.innerHTML = '';
    const btn = document.createElement('button');
    btn.className = 'mode-tab active';
    btn.dataset.mode = 'picture';
    document.body.appendChild(btn);
    expect(getCurrentMode()).toBe('picture');
  });
});

describe('bindUIState', () => {
  it('shows the custom-size input only when "Custom..." is selected, and focuses it', () => {
    document.body.innerHTML = '';
    const sizeSelect = document.createElement('select');
    sizeSelect.id = 'sizeSelect';
    ['1000', 'custom'].forEach(v => {
      const opt = document.createElement('option');
      opt.value = v;
      sizeSelect.appendChild(opt);
    });
    const custom = document.createElement('input');
    custom.id = 'sizeCustom';
    document.body.append(sizeSelect, custom);

    bindUIState();
    sizeSelect.value = 'custom';
    sizeSelect.dispatchEvent(new Event('change'));
    expect(custom.style.display).toBe('inline-block');
    expect(document.activeElement).toBe(custom);

    sizeSelect.value = '1000';
    sizeSelect.dispatchEvent(new Event('change'));
    expect(custom.style.display).toBe('none');
  });
});

describe('bindModeSwitch — area visibility', () => {
  it('shows only the current mode\'s core area', () => {
    const { tableArea, pictureArea, conjugationArea } = buildFixture();
    const { updateModeUI } = bindModeSwitch({ tableArea, pictureArea, conjugationArea });
    updateModeUI(); // paints the default 'table' state
    expect(tableArea.hidden).toBe(false);
    expect(pictureArea.hidden).toBe(true);
    expect(conjugationArea.hidden).toBe(true);

    tabs.picture.click();
    expect(tableArea.hidden).toBe(true);
    expect(pictureArea.hidden).toBe(false);
  });

  it('shows an extra area only on its own mode, hiding the three core areas', () => {
    const { tableArea, pictureArea, conjugationArea } = buildFixture();
    const myListsArea = document.createElement('div');
    document.body.appendChild(myListsArea);
    const { updateModeUI } = bindModeSwitch({
      tableArea, pictureArea, conjugationArea, extraAreas: { mylists: myListsArea },
    });
    updateModeUI();
    tabs.mylists.click();
    expect(myListsArea.hidden).toBe(false);
    expect(tableArea.hidden).toBe(true);
    expect(pictureArea.hidden).toBe(true);
    expect(conjugationArea.hidden).toBe(true);
  });

  it('tolerates a null conjugationArea', () => {
    const { tableArea, pictureArea } = buildFixture();
    const { updateModeUI } = bindModeSwitch({ tableArea, pictureArea, conjugationArea: null });
    expect(() => updateModeUI()).not.toThrow();
  });
});

describe('bindModeSwitch — #controls visibility', () => {
  it.each(['mylists', 'settings', 'history', 'chat', 'myContent'])(
    'hides the whole controls card on %s',
    mode => {
      const { tableArea, pictureArea, conjugationArea } = buildFixture();
      bindModeSwitch({ tableArea, pictureArea, conjugationArea });
      tabs[mode].click();
      expect(groups.controls.hidden).toBe(true);
    },
  );

  it.each(['table', 'picture', 'conjugation', 'trivia', 'guessBlank'])(
    'shows the controls card on %s',
    mode => {
      const { tableArea, pictureArea, conjugationArea } = buildFixture();
      bindModeSwitch({ tableArea, pictureArea, conjugationArea });
      tabs[mode].click();
      expect(groups.controls.hidden).toBe(false);
    },
  );
});

describe('bindModeSwitch — word-list filters (classFilter/listFilter/domainFilterWrap)', () => {
  it('hides all three on Trivia and Guess the Blank, except Domains stays on Trivia', () => {
    const { tableArea, pictureArea, conjugationArea } = buildFixture();
    bindModeSwitch({ tableArea, pictureArea, conjugationArea });

    tabs.trivia.click();
    expect(groups.classFilter.style.display).toBe('none');
    expect(groups.listFilter.style.display).toBe('none');
    expect(groups.domainFilterWrap.style.display).toBe(''); // Trivia questions carry real domains

    tabs.guessBlank.click();
    expect(groups.classFilter.style.display).toBe('none');
    expect(groups.listFilter.style.display).toBe('none');
    expect(groups.domainFilterWrap.style.display).toBe('none'); // no domains on Guess the Blank
  });

  it('hides classFilter (but not listFilter) on Conjugation — the list filter still narrows verbs there', () => {
    const { tableArea, pictureArea, conjugationArea } = buildFixture();
    bindModeSwitch({ tableArea, pictureArea, conjugationArea });
    tabs.conjugation.click();
    expect(groups.classFilter.style.display).toBe('none');
    expect(groups.listFilter.style.display).toBe('');
    expect(groups.domainFilterWrap.style.display).toBe('');
  });

  it('shows all three on Table and Picture', () => {
    const { tableArea, pictureArea, conjugationArea } = buildFixture();
    bindModeSwitch({ tableArea, pictureArea, conjugationArea });
    for (const mode of ['table', 'picture']) {
      tabs[mode].click();
      expect(groups.classFilter.style.display).toBe('');
      expect(groups.listFilter.style.display).toBe('');
      expect(groups.domainFilterWrap.style.display).toBe('');
    }
  });

  it('a Settings-level "hide app-wide" toggle wins even on a mode that would otherwise show it', () => {
    const { tableArea, pictureArea, conjugationArea } = buildFixture();
    setHidden('hide_pos_filter', ['table']);
    setHidden('hide_lists_filter', ['table']);
    setHidden('hide_domains_filter', ['table']);
    bindModeSwitch({ tableArea, pictureArea, conjugationArea });
    tabs.table.click();
    expect(groups.classFilter.style.display).toBe('none');
    expect(groups.listFilter.style.display).toBe('none');
    expect(groups.domainFilterWrap.style.display).toBe('none');
  });
});

describe('bindModeSwitch — Words size vs. Conjugation\'s own Verbs control', () => {
  it('shows wordsSizeGroup on Table/Picture, hides it (and shows conjSizeSelectGroup) on Conjugation', () => {
    const { tableArea, pictureArea, conjugationArea } = buildFixture();
    bindModeSwitch({ tableArea, pictureArea, conjugationArea });

    tabs.table.click();
    expect(groups.wordsSizeGroup.style.display).toBe('');
    expect(groups.conjSizeSelectGroup.style.display).toBe('none');

    tabs.conjugation.click();
    expect(groups.wordsSizeGroup.style.display).toBe('none');
    expect(groups.conjSizeSelectGroup.style.display).toBe('');
  });

  it('hides wordsSizeGroup on Trivia/Guess the Blank too — neither uses the vocabulary pool', () => {
    const { tableArea, pictureArea, conjugationArea } = buildFixture();
    bindModeSwitch({ tableArea, pictureArea, conjugationArea });
    tabs.trivia.click();
    expect(groups.wordsSizeGroup.style.display).toBe('none');
  });
});

describe('bindModeSwitch — compareGroup (multi-language merge)', () => {
  it.each(['table', 'conjugation'])('shows on %s', mode => {
    const { tableArea, pictureArea, conjugationArea } = buildFixture();
    bindModeSwitch({ tableArea, pictureArea, conjugationArea });
    tabs[mode].click();
    expect(groups.compareGroup.style.display).toBe('');
  });

  it.each(['picture', 'trivia', 'guessBlank'])('hides on %s — no mixed-language scoring there', mode => {
    const { tableArea, pictureArea, conjugationArea } = buildFixture();
    bindModeSwitch({ tableArea, pictureArea, conjugationArea });
    tabs[mode].click();
    expect(groups.compareGroup.style.display).toBe('none');
  });
});

describe('bindModeSwitch — sortOrderGroup (only shown where there is no in-quiz order control)', () => {
  it('hides on Table and Conjugation (each has its own order control) and on Trivia (fixed bank)', () => {
    const { tableArea, pictureArea, conjugationArea } = buildFixture();
    bindModeSwitch({ tableArea, pictureArea, conjugationArea });
    for (const mode of ['table', 'conjugation', 'trivia']) {
      tabs[mode].click();
      expect(groups.sortOrderGroup.style.display).toBe('none');
    }
  });

  it('shows on Picture, which has no in-quiz equivalent', () => {
    const { tableArea, pictureArea, conjugationArea } = buildFixture();
    bindModeSwitch({ tableArea, pictureArea, conjugationArea });
    tabs.picture.click();
    expect(groups.sortOrderGroup.style.display).toBe('');
  });
});

describe('bindModeSwitch — presetsBtn / controls--no-profiles', () => {
  it('hides Profiles and reclaims its space on Trivia/Guess the Blank', () => {
    const { tableArea, pictureArea, conjugationArea } = buildFixture();
    bindModeSwitch({ tableArea, pictureArea, conjugationArea });
    tabs.trivia.click();
    expect(groups.presetsBtn.style.display).toBe('none');
    expect(groups.controls.classList.contains('controls--no-profiles')).toBe(true);
  });

  it('shows Profiles elsewhere', () => {
    const { tableArea, pictureArea, conjugationArea } = buildFixture();
    bindModeSwitch({ tableArea, pictureArea, conjugationArea });
    tabs.table.click();
    expect(groups.presetsBtn.style.display).toBe('');
    expect(groups.controls.classList.contains('controls--no-profiles')).toBe(false);
  });
});

describe('bindModeSwitch — recallTimerGroup', () => {
  it('is always hidden, on every mode — the tab it belonged to no longer exists', () => {
    const { tableArea, pictureArea, conjugationArea } = buildFixture();
    bindModeSwitch({ tableArea, pictureArea, conjugationArea });
    for (const mode of MODES) {
      tabs[mode].click();
      expect(groups.recallTimerGroup.style.display).toBe('none');
    }
  });
});

describe('bindModeSwitch — conjRandomTableSizeGroup/conjMatchStyleGroup are only ever hidden here, never shown', () => {
  it('leaving Conjugation hides them if they were visible', () => {
    const { tableArea, pictureArea, conjugationArea } = buildFixture();
    bindModeSwitch({ tableArea, pictureArea, conjugationArea });
    tabs.conjugation.click();
    groups.conjRandomTableSizeGroup.style.display = '';
    groups.conjMatchStyleGroup.style.display = '';
    tabs.table.click();
    expect(groups.conjRandomTableSizeGroup.style.display).toBe('none');
    expect(groups.conjMatchStyleGroup.style.display).toBe('none');
  });

  it('entering Conjugation does not itself reveal them — that is a sub-view toggle owned elsewhere', () => {
    const { tableArea, pictureArea, conjugationArea } = buildFixture();
    bindModeSwitch({ tableArea, pictureArea, conjugationArea });
    tabs.table.click();
    groups.conjRandomTableSizeGroup.style.display = 'none';
    tabs.conjugation.click();
    expect(groups.conjRandomTableSizeGroup.style.display).toBe('none');
  });
});

describe('bindModeSwitch — mode-tab active state and scroll-into-view', () => {
  it('marks only the clicked tab active, with matching aria-selected', () => {
    const { tableArea, pictureArea, conjugationArea } = buildFixture();
    bindModeSwitch({ tableArea, pictureArea, conjugationArea });
    tabs.picture.click();
    expect(tabs.picture.classList.contains('active')).toBe(true);
    expect(tabs.picture.getAttribute('aria-selected')).toBe('true');
    expect(tabs.table.classList.contains('active')).toBe(false);
    expect(tabs.table.getAttribute('aria-selected')).toBe('false');
  });

  it('scrolls the newly active tab into view by default', () => {
    const { tableArea, pictureArea, conjugationArea } = buildFixture();
    const spy = vi.fn();
    tabs.picture.scrollIntoView = spy;
    bindModeSwitch({ tableArea, pictureArea, conjugationArea });
    tabs.picture.click();
    expect(spy).toHaveBeenCalled();
  });

  it('does not scroll when updateModeUI(false) is called directly (a filter-visibility resync, not a tab switch)', () => {
    const { tableArea, pictureArea, conjugationArea } = buildFixture();
    const { updateModeUI } = bindModeSwitch({ tableArea, pictureArea, conjugationArea });
    tabs.picture.click();
    const spy = vi.fn();
    tabs.picture.scrollIntoView = spy;
    updateModeUI(false);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('bindModeSwitch — onActivate', () => {
  it('fires the callback for the mode just switched to', () => {
    const { tableArea, pictureArea, conjugationArea } = buildFixture();
    const onTable = vi.fn();
    const onPicture = vi.fn();
    bindModeSwitch({ tableArea, pictureArea, conjugationArea, onActivate: { table: onTable, picture: onPicture } });
    tabs.picture.click();
    expect(onPicture).toHaveBeenCalledTimes(1);
    expect(onTable).not.toHaveBeenCalled();
  });

  it('fires again each time that mode is (re-)activated', () => {
    const { tableArea, pictureArea, conjugationArea } = buildFixture();
    const onTable = vi.fn();
    bindModeSwitch({ tableArea, pictureArea, conjugationArea, onActivate: { table: onTable } });
    tabs.picture.click();
    tabs.table.click();
    tabs.table.click();
    expect(onTable).toHaveBeenCalledTimes(2);
  });
});
