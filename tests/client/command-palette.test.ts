// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { scoreItem, rank, buildItems, openPalette, closePalette, isPaletteOpen, type PaletteItem } from '../../src/client/ui/command-palette.ts';

const item = (label: string, extra: Partial<PaletteItem> = {}): PaletteItem => ({ id: label, label, hint: '', run: () => {}, ...extra });

describe('scoreItem', () => {
  it('is 0 when a word of the query is nowhere in the item', () => {
    expect(scoreItem('zebra', 'Conjugation')).toBe(0);
    expect(scoreItem('conj zebra', 'Conjugation')).toBe(0);
  });
  it('ranks exact > prefix > word start > substring > keywords > subsequence', () => {
    const s = (label: string, kw = '') => scoreItem('con', label, kw);
    expect(s('Con')).toBeGreaterThan(s('Conjugation'));
    expect(s('Conjugation')).toBeGreaterThan(s('Daily contest'));
    expect(s('Daily contest')).toBeGreaterThan(s('Second'));
    expect(s('Second')).toBeGreaterThan(s('Table', 'concise'));
    expect(s('Table', 'concise')).toBeGreaterThan(s('Cabo nada'));
    expect(s('Cabo nada')).toBeGreaterThan(0);
  });
  it('needs every word, in any order', () => {
    expect(scoreItem('size text', 'Text size')).toBeGreaterThan(0);
  });
  it('shows everything for an empty query', () => {
    expect(scoreItem('', 'Anything')).toBeGreaterThan(0);
  });
  it('does not treat regex characters in the query as syntax', () => {
    expect(() => scoreItem('(.*', 'Table')).not.toThrow();
  });
});

describe('rank', () => {
  it('orders by score, keeps the original order among ties, and respects the limit', () => {
    const items = [item('Settings'), item('Set up'), item('Reset all')];
    expect(rank(items, 'set').map(i => i.label)).toEqual(['Settings', 'Set up', 'Reset all']);
    expect(rank(items, 'set', 2)).toHaveLength(2);
    expect(rank(items, 'xyz')).toEqual([]);
  });
});

describe('buildItems', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div class="mode-tablist">
        <button class="mode-tab" data-mode="table">Table</button>
        <button class="mode-tab" data-mode="history">History</button>
        <button class="mode-tab" data-mode="mylists" hidden>My Lists</button>
        <button class="mode-tab" data-mode="conjugation" disabled>Conjugation</button>
      </div>
      <select id="langSelect"><option value="spanish">Spanish</option><option value="french">French</option></select>
      <button id="startBtn">Start Quiz</button>
      <div id="settingsArea"><section class="settings-section"><h3 class="settings-section-title">Appearance</h3>
        <div class="settings-row"><div class="settings-label"><span>Window zoom</span><span class="settings-desc">Pinch to zoom</span></div><div id="settingAppZoom"></div></div>
        <div class="settings-row"><div class="settings-label"><span>No control here</span></div></div>
      </section></div>`;
  });

  it('offers the modes that are on, the languages, the settings that have a control, and actions', () => {
    const labels = buildItems().map(i => i.label);
    expect(labels).toContain('Table');
    expect(labels).toContain('History');
    expect(labels).not.toContain('My Lists');        // hidden (Simple Mode)
    expect(labels).not.toContain('Conjugation');     // disabled for this language
    expect(labels).toContain('French');
    expect(labels).toContain('Window zoom');
    expect(labels).not.toContain('No control here'); // nothing to open
    expect(labels).toContain('Dark mode');
  });

  it('runs the real control: choosing a mode clicks its tab; choosing a language changes the select', () => {
    const spy = vi.fn();
    document.querySelector('[data-mode="history"]')!.addEventListener('click', spy);
    const onChange = vi.fn();
    document.getElementById('langSelect')!.addEventListener('change', onChange);
    const items = buildItems();
    items.find(i => i.label === 'History')!.run();
    expect(spy).toHaveBeenCalledTimes(1);
    items.find(i => i.label === 'French')!.run();
    expect((document.getElementById('langSelect') as HTMLSelectElement).value).toBe('french');
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe('the dialog', () => {
  beforeEach(() => { document.body.innerHTML = '<div class="mode-tablist"><button class="mode-tab" data-mode="table">Table</button></div>'; });

  it('opens focused on its input, filters as you type, runs the chosen item, and closes', async () => {
    const tab = document.querySelector<HTMLElement>('.mode-tab')!;
    const spy = vi.fn();
    tab.addEventListener('click', spy);
    openPalette();
    expect(isPaletteOpen()).toBe(true);
    const input = document.querySelector<HTMLInputElement>('.cmdk-input')!;
    expect(document.activeElement).toBe(input);
    input.value = 'tabl';
    input.dispatchEvent(new Event('input'));
    expect(document.querySelectorAll('.cmdk-item')).toHaveLength(1);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(isPaletteOpen()).toBe(false);
    await new Promise(r => setTimeout(r, 5));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape without running anything', () => {
    openPalette();
    document.querySelector('.cmdk-input')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(isPaletteOpen()).toBe(false);
    closePalette();
  });
});
