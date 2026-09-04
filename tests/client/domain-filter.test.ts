// @vitest-environment jsdom
/**
 * domain-filter.test.ts — the Domains filter box (src/client/filters/
 * domain-filter.ts): top-10 pills, the search dropdown for the rest,
 * selected-domain chips, and the pure matching helpers other modules
 * (start-handler.ts) apply against a word list.
 *
 * Node-stub-style tests elsewhere (table-filters.test.ts) already cover
 * getSelectedDomains/applyDomainFilter through a minimal document stub —
 * this file exercises the DOM this module actually builds and wires itself
 * (bindDomainFilter), which needs real element behavior (closest,
 * insertAdjacentElement, keyboard events), hence jsdom.
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

/** The header markup bindDomainFilter() expects to already exist. */
function buildDomFixture(): void {
  const wrap = document.createElement('div');
  wrap.id = 'domainFilterWrap';
  wrap.className = 'domain-filter-wrap';

  const countEl = document.createElement('span');
  countEl.id = 'domainFilterCount';
  const activeBtn = document.createElement('button');
  activeBtn.id = 'domainFilterActive';
  activeBtn.appendChild(document.createElement('span')).className = 'filter-active-label';
  const chainBtn = document.createElement('button');
  chainBtn.id = 'domainFilterChain';
  const note = document.createElement('p');
  note.id = 'domainFilterChainNote';
  note.hidden = true;
  const clearBtn = document.createElement('button');
  clearBtn.id = 'clearAllDomains';

  const body = document.createElement('div');
  body.id = 'domainFilterBody';

  wrap.append(countEl, activeBtn, chainBtn, note, clearBtn, body);
  document.body.appendChild(wrap);
}

async function load() {
  return import('../../src/client/filters/domain-filter.js');
}

const COUNTS = [
  { domain: 'animals', count: 50 }, { domain: 'food', count: 45 }, { domain: 'travel', count: 40 },
  { domain: 'sports', count: 35 }, { domain: 'weather', count: 30 }, { domain: 'colors', count: 25 },
  { domain: 'family', count: 20 }, { domain: 'numbers', count: 15 }, { domain: 'time', count: 10 },
  { domain: 'clothing', count: 9 }, { domain: 'health', count: 8 }, { domain: 'business', count: 7 },
];

/** Finds the pill for a domain by its formatted label (fmt() capitalizes,
 *  replaces underscores) and clicks it. */
function clickPill(label: string): void {
  const btn = [...document.querySelectorAll<HTMLButtonElement>('.domain-qpick')]
    .find(b => b.textContent?.startsWith(label));
  if (!btn) throw new Error(`no pill found for "${label}"`);
  btn.click();
}

// jsdom does not implement layout, so Element.scrollIntoView is absent —
// the keyboard-nav handler calls it on the newly-highlighted item.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  document.body.innerHTML = '';
  setMode('table');
  setLang('spanish');
});

describe('bindDomainFilter', () => {
  it('does nothing when #domainFilterBody is missing', async () => {
    const { bindDomainFilter } = await load();
    expect(() => bindDomainFilter()).not.toThrow();
  });
});

describe('with the filter box in the DOM', () => {
  beforeEach(() => buildDomFixture());

  describe('updateDomainFilter — pills', () => {
    it('shows only the top 10 by count, alphabetically ordered', async () => {
      const { bindDomainFilter, updateDomainFilter } = await load();
      bindDomainFilter();
      updateDomainFilter(COUNTS);
      const labels = [...document.querySelectorAll('.domain-qpick span:first-child')].map(s => s.textContent);
      expect(labels).toEqual([
        'Animals', 'Clothing', 'Colors', 'Family', 'Food',
        'Numbers', 'Sports', 'Time', 'Travel', 'Weather',
      ]);
    });

    it('formats an underscored domain name and shows its count badge', async () => {
      const { bindDomainFilter, updateDomainFilter } = await load();
      bindDomainFilter();
      updateDomainFilter([{ domain: 'pop_culture', count: 12 }]);
      const pill = document.querySelector('.domain-qpick')!;
      expect(pill.querySelector('span:first-child')?.textContent).toBe('Pop culture');
      expect(pill.querySelector('.domain-qpick-count')?.textContent).toBe('12');
    });
  });

  describe('selecting a domain via its pill', () => {
    it('marks the pill active and persists the selection (regression: pills used to render without persisting)', async () => {
      const { bindDomainFilter, updateDomainFilter, getSelectedDomains } = await load();
      bindDomainFilter();
      updateDomainFilter(COUNTS);
      clickPill('Food');
      const foodPill = [...document.querySelectorAll<HTMLButtonElement>('.domain-qpick')]
        .find(b => b.textContent?.startsWith('Food'))!;
      expect(foodPill.classList.contains('active')).toBe(true);
      expect(getSelectedDomains()).toEqual(['food']);
    });

    it('clicking again deselects it', async () => {
      const { bindDomainFilter, updateDomainFilter, getSelectedDomains } = await load();
      bindDomainFilter();
      updateDomainFilter(COUNTS);
      clickPill('Food');
      clickPill('Food');
      expect(getSelectedDomains()).toEqual([]);
    });

    it('a selected domain survives a reload of the module (persisted to storage)', async () => {
      const mod1 = await load();
      mod1.bindDomainFilter();
      mod1.updateDomainFilter(COUNTS);
      clickPill('Food');

      vi.resetModules();
      document.body.innerHTML = '';
      buildDomFixture();
      const mod2 = await load();
      mod2.bindDomainFilter();
      mod2.updateDomainFilter(COUNTS);
      expect(mod2.getSelectedDomains()).toEqual(['food']);
    });
  });

  describe('chips', () => {
    it('shows a removable chip for each selected domain and hides the chip row when empty', async () => {
      const { bindDomainFilter, updateDomainFilter, getSelectedDomains } = await load();
      bindDomainFilter();
      updateDomainFilter(COUNTS);
      const chipsEl = document.getElementById('domainChips')!;
      expect(chipsEl.hidden).toBe(true);

      clickPill('Food');
      expect(chipsEl.hidden).toBe(false);
      expect(chipsEl.textContent).toContain('Food');

      chipsEl.querySelector<HTMLButtonElement>('.domain-chip-x')!.click();
      expect(chipsEl.hidden).toBe(true);
      expect(getSelectedDomains()).toEqual([]);
    });
  });

  describe('search dropdown', () => {
    it('ranks starts-with matches before contains matches', async () => {
      const { bindDomainFilter, updateDomainFilter } = await load();
      bindDomainFilter();
      updateDomainFilter([...COUNTS, { domain: 'overtime', count: 3 }]);
      const input = document.getElementById('domainSearchInput') as HTMLInputElement;
      input.value = 'time';
      input.dispatchEvent(new Event('input'));

      const names = [...document.querySelectorAll('.domain-suggestion span:first-child')].map(s => s.textContent);
      expect(names).toEqual(['Time', 'Overtime']); // starts-with "Time" first, "Overtime" (contains) after
    });

    it('excludes already-selected domains from the results', async () => {
      const { bindDomainFilter, updateDomainFilter } = await load();
      bindDomainFilter();
      updateDomainFilter(COUNTS);
      clickPill('Food');

      const input = document.getElementById('domainSearchInput') as HTMLInputElement;
      input.value = 'foo';
      input.dispatchEvent(new Event('input'));
      expect(document.getElementById('domainSuggestions')?.hidden).toBe(true);
    });

    it('an empty query lists every non-selected domain alphabetically', async () => {
      const { bindDomainFilter, updateDomainFilter } = await load();
      bindDomainFilter();
      updateDomainFilter(COUNTS);
      const input = document.getElementById('domainSearchInput') as HTMLInputElement;
      input.dispatchEvent(new Event('focus'));
      const names = [...document.querySelectorAll('.domain-suggestion span:first-child')].map(s => s.textContent);
      expect(names).toEqual([...names].sort());
      expect(names.length).toBe(COUNTS.length);
    });

    it('picking a suggestion adds it as a selected domain and clears the search box', async () => {
      const { bindDomainFilter, updateDomainFilter, getSelectedDomains } = await load();
      bindDomainFilter();
      updateDomainFilter(COUNTS);
      const input = document.getElementById('domainSearchInput') as HTMLInputElement;
      input.value = 'health';
      input.dispatchEvent(new Event('input'));

      const item = document.querySelector<HTMLElement>('.domain-suggestion[data-domain="health"]')!;
      item.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      expect(getSelectedDomains()).toEqual(['health']);
      expect(input.value).toBe('');
    });

    describe('keyboard navigation', () => {
      function keydown(el: HTMLElement, key: string): void {
        el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
      }

      it('ArrowDown highlights the first item, Enter selects it', async () => {
        const { bindDomainFilter, updateDomainFilter, getSelectedDomains } = await load();
        bindDomainFilter();
        updateDomainFilter(COUNTS);
        const input = document.getElementById('domainSearchInput') as HTMLInputElement;
        input.dispatchEvent(new Event('focus'));
        keydown(input, 'ArrowDown');
        const highlighted = document.querySelector('.domain-suggestion.highlighted');
        expect(highlighted).not.toBeNull();
        keydown(input, 'Enter');
        expect(getSelectedDomains()).toEqual([highlighted!.getAttribute('data-domain')]);
      });

      it('Enter with nothing highlighted selects the first suggestion', async () => {
        const { bindDomainFilter, updateDomainFilter, getSelectedDomains } = await load();
        bindDomainFilter();
        updateDomainFilter(COUNTS);
        const input = document.getElementById('domainSearchInput') as HTMLInputElement;
        input.dispatchEvent(new Event('focus'));
        const first = document.querySelector('.domain-suggestion')!.getAttribute('data-domain');
        keydown(input, 'Enter');
        expect(getSelectedDomains()).toEqual([first]);
      });

      it('Escape hides the dropdown and clears the search box', async () => {
        const { bindDomainFilter, updateDomainFilter } = await load();
        bindDomainFilter();
        updateDomainFilter(COUNTS);
        const input = document.getElementById('domainSearchInput') as HTMLInputElement;
        input.value = 'foo';
        input.dispatchEvent(new Event('input'));
        keydown(input, 'Escape');
        expect(document.getElementById('domainSuggestions')?.hidden).toBe(true);
        expect(input.value).toBe('');
      });
    });
  });

  describe('clear all', () => {
    it('clears every selected domain at once', async () => {
      const { bindDomainFilter, updateDomainFilter, getSelectedDomains } = await load();
      bindDomainFilter();
      updateDomainFilter(COUNTS);
      clickPill('Food');
      clickPill('Travel');
      expect(getSelectedDomains().sort()).toEqual(['food', 'travel']);
      document.getElementById('clearAllDomains')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(getSelectedDomains()).toEqual([]);
    });
  });

  describe('updateDomainFilter — pruning on a language/data change', () => {
    it('drops a selected domain that no longer exists in the new counts', async () => {
      const { bindDomainFilter, updateDomainFilter, getSelectedDomains } = await load();
      bindDomainFilter();
      updateDomainFilter(COUNTS);
      clickPill('Food');
      expect(getSelectedDomains()).toEqual(['food']);

      updateDomainFilter(COUNTS.filter(c => c.domain !== 'food'));
      expect(getSelectedDomains()).toEqual([]);
    });

    it('keeps a selected domain that still exists after the update', async () => {
      const { bindDomainFilter, updateDomainFilter, getSelectedDomains } = await load();
      bindDomainFilter();
      updateDomainFilter(COUNTS);
      clickPill('Food');
      updateDomainFilter(COUNTS);
      expect(getSelectedDomains()).toEqual(['food']);
    });
  });

  describe('getSelectedDomains / getDomainFilterState', () => {
    it('is empty while Kid-Friendly Mode is on, regardless of selection', async () => {
      const { bindDomainFilter, updateDomainFilter, getSelectedDomains } = await load();
      bindDomainFilter();
      updateDomainFilter(COUNTS);
      clickPill('Food');
      localStorage.setItem('s_kid_friendly_mode', 'true');
      expect(getSelectedDomains()).toEqual([]);
    });

    it('is empty when the current mode has this filter hidden', async () => {
      const { bindDomainFilter, updateDomainFilter, getSelectedDomains } = await load();
      bindDomainFilter();
      updateDomainFilter(COUNTS);
      clickPill('Food');
      localStorage.setItem('s_hide_domains_filter_modes', 'table');
      expect(getSelectedDomains()).toEqual([]);
    });

    it('distinguishes "off with a selection" from "on with nothing selected" (getDomainFilterState)', async () => {
      const { bindDomainFilter, updateDomainFilter, getDomainFilterState, getSelectedDomains } = await load();
      bindDomainFilter();
      updateDomainFilter(COUNTS);
      clickPill('Food');
      document.getElementById('domainFilterActive')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(getSelectedDomains()).toEqual([]); // off -> collapses to empty
      expect(getDomainFilterState()).toEqual({ active: false, selected: ['food'] }); // raw state still remembers it
    });
  });

  describe('applyDomainSelection', () => {
    it('sets the selection and active flag directly, for presets.ts to apply a saved bundle', async () => {
      const { bindDomainFilter, applyDomainSelection, getDomainFilterState } = await load();
      bindDomainFilter();
      applyDomainSelection(['food', 'travel'], false);
      expect(getDomainFilterState()).toEqual({ active: false, selected: ['food', 'travel'] });
    });
  });

  describe('chaining integration (real filter-header + filter-state)', () => {
    it('unlinking Table and changing its selection leaves Picture (still linked) unaffected', async () => {
      const { bindDomainFilter, updateDomainFilter, getSelectedDomains } = await load();
      bindDomainFilter();
      updateDomainFilter(COUNTS);

      // Give the shared bucket a baseline selection while everything is still linked.
      clickPill('Travel');

      // Unlink Table — keeps what it had at the moment of unlinking.
      document.getElementById('domainFilterChain')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(getSelectedDomains()).toEqual(['travel']);

      // Change Table's now-own selection.
      clickPill('Food');
      expect(getSelectedDomains().sort()).toEqual(['food', 'travel']);

      // Picture is still linked to the shared bucket, which Table no longer writes to.
      setMode('picture');
      expect(getSelectedDomains()).toEqual(['travel']);
    });
  });
});

describe('matchesDomainFilter / applyDomainFilter (pure)', () => {
  it('passes everything through when nothing is selected', async () => {
    const { matchesDomainFilter, applyDomainFilter } = await load();
    expect(matchesDomainFilter({ domains: [] }, [])).toBe(true);
    expect(applyDomainFilter([{ domains: ['x'] }, { domains: [] }], [])).toHaveLength(2);
  });

  it('matches on any overlap (OR), not requiring every selected domain', async () => {
    const { matchesDomainFilter } = await load();
    expect(matchesDomainFilter({ domains: ['food'] }, ['food', 'travel'])).toBe(true);
  });

  it('gives no free pass to a word with no domain data once something is selected', async () => {
    const { matchesDomainFilter } = await load();
    expect(matchesDomainFilter({ domains: [] }, ['food'])).toBe(false);
    expect(matchesDomainFilter({}, ['food'])).toBe(false);
  });

  it('applyDomainFilter narrows a list to the matching words', async () => {
    const { applyDomainFilter } = await load();
    const words = [{ id: 1, domains: ['food'] }, { id: 2, domains: ['travel'] }, { id: 3, domains: [] }];
    expect(applyDomainFilter(words, ['food']).map(w => w.id)).toEqual([1]);
  });
});
