// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { resolveChord, nextTabIndex, GO_CHORDS, CHORD_WINDOW_MS, initGlobalShortcuts } from '../../src/client/ui/global-shortcuts.ts';

describe('resolveChord', () => {
  it('maps the documented second keys and nothing else', () => {
    expect(resolveChord('t')).toBe('table');
    expect(resolveChord(',')).toBe('settings');
    expect(resolveChord('x')).toBeNull();
    // Object.prototype members must not read as chords.
    expect(resolveChord('constructor')).toBeNull();
    expect(resolveChord('toString')).toBeNull();
  });

  it('every chord key is a single, distinct character', () => {
    const keys = Object.keys(GO_CHORDS);
    expect(keys.every(k => k.length === 1)).toBe(true);
    expect(new Set(Object.values(GO_CHORDS)).size).toBe(keys.length);
  });
});

describe('nextTabIndex', () => {
  it('moves and wraps', () => {
    expect(nextTabIndex('ArrowRight', 0, 3)).toBe(1);
    expect(nextTabIndex('ArrowRight', 2, 3)).toBe(0);
    expect(nextTabIndex('ArrowLeft', 0, 3)).toBe(2);
    expect(nextTabIndex('Home', 2, 3)).toBe(0);
    expect(nextTabIndex('End', 0, 3)).toBe(2);
  });
  it('ignores other keys and empty bars', () => {
    expect(nextTabIndex('a', 0, 3)).toBeNull();
    expect(nextTabIndex('ArrowRight', 0, 0)).toBeNull();
  });
});

describe('initGlobalShortcuts (DOM)', () => {
  const key = (k: string, init: KeyboardEventInit = {}, target: EventTarget = document.body): void => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }));
  };
  let clicks: string[];

  beforeEach(() => {
    vi.useFakeTimers();
    clicks = [];
    document.body.innerHTML = `
      <div class="mode-tablist" role="tablist">
        <button class="mode-tab" role="tab" data-mode="table">Table</button>
        <button class="mode-tab" role="tab" data-mode="picture">Picture</button>
        <button class="mode-tab" role="tab" data-mode="history" hidden>History</button>
        <button class="mode-tab" role="tab" data-mode="settings">Settings</button>
      </div>
      <button id="dueBadge">3 due</button>
      <div id="shortcutsOverlay"></div>
      <input id="field">`;
    document.querySelectorAll<HTMLElement>('.mode-tab').forEach(t =>
      t.addEventListener('click', () => clicks.push(t.dataset['mode'] ?? '')));
    document.getElementById('dueBadge')?.addEventListener('click', () => clicks.push('due'));
  });
  afterEach(() => vi.useRealTimers());

  // The module registers on `document` each time it is called; bind once.
  let bound = false;
  const bind = (): void => { if (!bound) { initGlobalShortcuts(); bound = true; } };
  // (tablist listener is attached per call, so re-bind for the arrow tests separately)

  it('g then p goes to Picture', () => {
    bind();
    key('g'); key('p');
    expect(clicks).toEqual(['picture']);
  });

  it('a lone letter, or the wrong order, does nothing', () => {
    bind();
    key('p');
    key('x'); key('g');
    vi.advanceTimersByTime(CHORD_WINDOW_MS + 10);
    key('t');
    expect(clicks).toEqual([]);
  });

  it('the chord expires', () => {
    bind();
    key('g');
    vi.advanceTimersByTime(CHORD_WINDOW_MS + 10);
    key('t');
    expect(clicks).toEqual([]);
  });

  it('does not go to a hidden tab', () => {
    bind();
    key('g'); key('h');
    expect(clicks).toEqual([]);
  });

  it('is silent while typing, with a modifier, or with the dialog open', () => {
    bind();
    key('g', {}, document.getElementById('field') as HTMLElement); key('t');
    key('g', { ctrlKey: true }); key('t');
    document.getElementById('shortcutsOverlay')?.classList.add('open');
    key('g'); key('t');
    key('r');
    expect(clicks).toEqual([]);
  });

  it('r starts the due review only when the badge is showing', () => {
    bind();
    key('r');
    expect(clicks).toEqual(['due']);
    (document.getElementById('dueBadge') as HTMLElement).hidden = true;
    key('r');
    expect(clicks).toEqual(['due']);
  });

  it('arrow keys move focus between visible tabs without activating them', () => {
    initGlobalShortcuts();   // fresh tablist listener for this fixture
    const tabs = [...document.querySelectorAll<HTMLElement>('.mode-tab')];
    tabs[0].focus();
    key('ArrowRight', {}, tabs[0]);
    expect(document.activeElement).toBe(tabs[1]);
    key('ArrowRight', {}, tabs[1]);          // History is hidden -> skips to Settings
    expect(document.activeElement).toBe(tabs[3]);
    key('ArrowRight', {}, tabs[3]);          // wraps
    expect(document.activeElement).toBe(tabs[0]);
    key('End', {}, tabs[0]);
    expect(document.activeElement).toBe(tabs[3]);
    expect(clicks).toEqual([]);              // focus only, never activation
  });
});
