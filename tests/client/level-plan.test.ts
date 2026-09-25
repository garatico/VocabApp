// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { LEVELS, levelById, bandStates } from '../../src/client/utils/level-plan.ts';
import { applyPlan } from '../../src/client/ui/level-picker.ts';
import { BANDS } from '../../src/client/data/bands.ts';

describe('LEVELS', () => {
  it('has four distinct, labelled choices in order of difficulty', () => {
    expect(LEVELS.map(l => l.id)).toEqual(['new', 'basics', 'comfortable', 'advanced']);
    for (const l of LEVELS) { expect(l.label).not.toBe(''); expect(l.blurb).not.toBe(''); }
  });

  it('only names real CEFR bands', () => {
    for (const l of LEVELS) {
      if (l.plan.pool === 'band') {
        expect(l.plan.bands.length).toBeGreaterThan(0);
        for (const b of l.plan.bands) expect(BANDS).toContain(b);
      }
    }
  });

  it('bands never overlap between levels, so each choice is a distinct slice', () => {
    const seen = new Set<string>();
    for (const l of LEVELS) {
      if (l.plan.pool !== 'band') continue;
      for (const b of l.plan.bands) { expect(seen.has(b)).toBe(false); seen.add(b); }
    }
  });

  it('levelById finds a level and rejects junk', () => {
    expect(levelById('advanced')?.label).toBe('Advanced');
    expect(levelById('nope')).toBeNull();
    expect(levelById('constructor')).toBeNull();
  });
});

describe('bandStates', () => {
  it('marks exactly the plan\'s bands on', () => {
    const s = bandStates({ pool: 'band', bands: ['B1', 'B2'] });
    expect(Object.entries(s).filter(([, on]) => on).map(([b]) => b)).toEqual(['B1', 'B2']);
  });
  it('is all off for a Most Common plan', () => {
    expect(Object.values(bandStates({ pool: 'topn', size: '100' })).some(Boolean)).toBe(false);
  });
});

describe('applyPlan — drives the real Words controls', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="poolModeToggle">
        <button class="sort-order-btn active" data-pool="topn">Most Common</button>
        <button class="sort-order-btn" data-pool="band">Level</button>
      </div>
      <select id="sizeSelect"><option value="100">100</option><option value="1000" selected>1000</option></select>
      <div id="bandChips">
        ${BANDS.map(b => `<button class="pos-chip" data-band="${b}">${b}</button>`).join('')}
      </div>`;
    // Stand-ins for app.ts's handlers, which are what real clicks reach.
    document.getElementById('poolModeToggle')!.addEventListener('click', e => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('.sort-order-btn');
      if (!btn) return;
      document.querySelectorAll('#poolModeToggle .sort-order-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
    document.getElementById('bandChips')!.addEventListener('click', e => {
      (e.target as HTMLElement).closest('.pos-chip')?.classList.toggle('active');
    });
  });

  const active = (sel: string): string[] =>
    [...document.querySelectorAll<HTMLElement>(sel)].filter(e => e.classList.contains('active'))
      .map(e => e.dataset['band'] ?? e.dataset['pool'] ?? '');

  it('a Most Common plan picks that pool and size, and fires the size change', () => {
    let changed = 0;
    document.getElementById('sizeSelect')!.addEventListener('change', () => changed++);
    applyPlan({ pool: 'topn', size: '100' });
    expect(active('#poolModeToggle .sort-order-btn')).toEqual(['topn']);
    expect((document.getElementById('sizeSelect') as HTMLSelectElement).value).toBe('100');
    expect(changed).toBe(1);
  });

  it('a Level plan switches pool and toggles only the chips that differ', () => {
    applyPlan({ pool: 'band', bands: ['B1', 'B2'] });
    expect(active('#poolModeToggle .sort-order-btn')).toEqual(['band']);
    expect(active('#bandChips .pos-chip')).toEqual(['B1', 'B2']);
  });

  it('replaces an earlier selection rather than adding to it', () => {
    document.querySelector<HTMLElement>('#bandChips [data-band="A1"]')!.classList.add('active');
    document.querySelector<HTMLElement>('#bandChips [data-band="B1"]')!.classList.add('active');
    applyPlan({ pool: 'band', bands: ['B1', 'B2'] });
    expect(active('#bandChips .pos-chip')).toEqual(['B1', 'B2']);   // A1 off, B1 kept, B2 on
  });

  it('is a no-op on a page without those controls', () => {
    document.body.innerHTML = '';
    expect(() => applyPlan({ pool: 'band', bands: ['C1'] })).not.toThrow();
    expect(() => applyPlan({ pool: 'topn', size: '100' })).not.toThrow();
  });
});
