// @vitest-environment jsdom
/**
 * filter-header.test.ts — syncFilterHeader()/bindFilterHeader()
 * (src/client/filters/filter-header.ts): the shared On/Off + chain-link
 * controls behind the Lists/Class/Domain filter boxes.
 *
 * Exercised through a synthetic FilterHeaderConfig rather than through one
 * real filter (domain-filter.ts's own header wiring is covered separately,
 * in domain-filter.test.ts) — this file is about the header contract itself,
 * so a fake filter proves the module doesn't depend on any one caller's
 * specifics. Chain state is real (filter-state.ts, backed by real
 * localStorage) since that's the whole point of what's under test; only the
 * filter's own active flag and copyState are faked.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { syncFilterHeader, bindFilterHeader, type FilterHeaderConfig } from '../../src/client/filters/filter-header.js';

interface Fixture {
  box: HTMLElement;
  activeBtn: HTMLButtonElement;
  activeLabel: HTMLElement;
  chainBtn: HTMLButtonElement;
  note: HTMLElement;
}

function buildFixture(): Fixture {
  const box = document.createElement('div');
  box.className = 'filter-box';

  const activeBtn = document.createElement('button');
  activeBtn.id = 'testActiveBtn';
  const activeLabel = document.createElement('span');
  activeLabel.className = 'filter-active-label';
  activeBtn.appendChild(activeLabel);

  const chainBtn = document.createElement('button');
  chainBtn.id = 'testChainBtn';

  const note = document.createElement('p');
  note.id = 'testNote';
  note.hidden = true;

  box.append(activeBtn, chainBtn, note);
  document.body.appendChild(box);
  return { box, activeBtn, activeLabel, chainBtn, note };
}

function setMode(mode: string): void {
  localStorage.setItem('vq_mode', mode);
}

function makeConfig(over: Partial<FilterHeaderConfig> = {}): FilterHeaderConfig {
  let active = true;
  return {
    id: 'domain',
    activeBtnId: 'testActiveBtn',
    chainBtnId:  'testChainBtn',
    noteId:      'testNote',
    isActive:    () => active,
    setActive:   on => { active = on; },
    copyState:   vi.fn(),
    onChange:    vi.fn(),
    ...over,
  };
}

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
  setMode('table');
});

describe('syncFilterHeader — active button', () => {
  it('marks the button and box "on" when active', () => {
    const { box, activeBtn, activeLabel } = buildFixture();
    syncFilterHeader(makeConfig({ isActive: () => true }));
    expect(activeBtn.classList.contains('filter-active-btn--on')).toBe(true);
    expect(activeBtn.getAttribute('aria-pressed')).toBe('true');
    expect(activeLabel.textContent).toBe('On');
    expect(box.classList.contains('filter-box--inactive')).toBe(false);
  });

  it('marks the button and box "off" when inactive', () => {
    const { box, activeBtn, activeLabel } = buildFixture();
    syncFilterHeader(makeConfig({ isActive: () => false }));
    expect(activeBtn.classList.contains('filter-active-btn--on')).toBe(false);
    expect(activeBtn.getAttribute('aria-pressed')).toBe('false');
    expect(activeLabel.textContent).toBe('Off');
    expect(box.classList.contains('filter-box--inactive')).toBe(true);
  });

  it('does not throw when the button is missing from the DOM', () => {
    expect(() => syncFilterHeader(makeConfig())).not.toThrow();
  });
});

describe('syncFilterHeader — chain button', () => {
  it('is hidden entirely when filter linking is disabled app-wide', () => {
    localStorage.setItem('s_filter_linking_enabled', 'false');
    const { chainBtn } = buildFixture();
    syncFilterHeader(makeConfig());
    expect(chainBtn.hidden).toBe(true);
  });

  it('shows "linked, with company" by default (every mode starts chained)', () => {
    const { chainBtn } = buildFixture();
    syncFilterHeader(makeConfig());
    expect(chainBtn.hidden).toBe(false);
    expect(chainBtn.classList.contains('filter-chain-btn--on')).toBe(true);
    expect(chainBtn.classList.contains('filter-chain-btn--alone')).toBe(false);
    expect(chainBtn.textContent).toBe('🔗');
    expect(chainBtn.title).toMatch(/^Linked with 4 other modes/);
  });

  it('shows "linked, alone" when every other mode has been unchained', () => {
    localStorage.setItem('vq_filterchain_domain', JSON.stringify({
      table: true, picture: false, trivia: false, conjugation: false, mylists: false,
    }));
    const { chainBtn } = buildFixture();
    syncFilterHeader(makeConfig());
    expect(chainBtn.classList.contains('filter-chain-btn--on')).toBe(true);
    expect(chainBtn.classList.contains('filter-chain-btn--alone')).toBe(true);
    expect(chainBtn.title).toMatch(/nothing is being kept in step/);
  });

  it('shows "unlinked" when this mode has its own setting', () => {
    localStorage.setItem('vq_filterchain_domain', JSON.stringify({ table: false }));
    const { chainBtn } = buildFixture();
    syncFilterHeader(makeConfig());
    expect(chainBtn.classList.contains('filter-chain-btn--on')).toBe(false);
    expect(chainBtn.textContent).toBe('⛓️‍💥');
    expect(chainBtn.title).toMatch(/^Not linked/);
  });
});

describe('bindFilterHeader — active toggle', () => {
  it('clicking the active button flips isActive/setActive and repaints', () => {
    const { activeBtn } = buildFixture();
    const cfg = makeConfig({ isActive: () => true });
    const setActive = vi.fn();
    cfg.setActive = setActive;
    bindFilterHeader(cfg);

    activeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(setActive).toHaveBeenCalledWith(false);
    expect(cfg.onChange).toHaveBeenCalledTimes(1);
  });
});

describe('bindFilterHeader — chain toggle', () => {
  it('chaining calls copyState(scope, shared) and shows a linked note', () => {
    const { chainBtn, note } = buildFixture();
    localStorage.setItem('vq_filterchain_domain', JSON.stringify({ table: false })); // start unlinked
    const cfg = makeConfig();
    bindFilterHeader(cfg);

    chainBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(cfg.copyState).toHaveBeenCalledWith('table', 'shared');
    expect(cfg.onChange).toHaveBeenCalled();
    expect(note.hidden).toBe(false);
    expect(note.textContent).toMatch(/^Linked/);
  });

  it('unchaining calls copyState(shared, scope) and shows an unlinked note', () => {
    const { chainBtn, note } = buildFixture(); // default: chained
    const cfg = makeConfig();
    bindFilterHeader(cfg);

    chainBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(cfg.copyState).toHaveBeenCalledWith('shared', 'table');
    expect(note.textContent).toBe('Unlinked — this mode now keeps its own setting');
  });

  it('names which other modes are affected when they adopt the newly-linked setting', () => {
    // Only Picture already linked besides Table -> chaining Table names Picture.
    localStorage.setItem('vq_filterchain_domain', JSON.stringify({
      table: false, picture: true, trivia: false, conjugation: false, mylists: false,
    }));
    const { chainBtn, note } = buildFixture();
    bindFilterHeader(makeConfig());
    chainBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(note.textContent).toBe('Linked — Picture Quiz now use this too');
  });

  it('the note auto-hides after its timeout', () => {
    vi.useFakeTimers();
    const { chainBtn, note } = buildFixture();
    bindFilterHeader(makeConfig());
    chainBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(note.hidden).toBe(false);
    vi.advanceTimersByTime(3999);
    expect(note.hidden).toBe(false);
    vi.advanceTimersByTime(1);
    expect(note.hidden).toBe(true);
    vi.useRealTimers();
  });
});
