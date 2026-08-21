/**
 * filter-chain.test.ts — do linked modes actually share a filter?
 *
 * The chain button's whole promise is that two modes marked linked read and
 * write one setting. These drive the real modules through a real mode switch
 * rather than asserting on the storage keys, because the keys were never the
 * part in doubt.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ── A localStorage and just enough DOM for the filters to run ────────────────

class FakeStorage {
  map = new Map<string, string>();
  get length(): number { return this.map.size; }
  key(i: number): string | null { return [...this.map.keys()][i] ?? null; }
  getItem(k: string): string | null { return this.map.get(k) ?? null; }
  setItem(k: string, v: string): void { this.map.set(k, v); }
  removeItem(k: string): void { this.map.delete(k); }
}

let store: FakeStorage;
let language = 'spanish';

/**
 * `currentLangValue()` reads #langSelect and the filter UIs read their own
 * containers. Only the language matters here — every other lookup returning
 * null makes the repaint code a no-op, which is what we want: this is about
 * where the state lives, not about pixels.
 */
function stubDom(): void {
  (globalThis as Record<string, unknown>).document = {
    getElementById: (id: string) => (id === 'langSelect' ? { value: language } : null),
    querySelector: () => null,
    querySelectorAll: () => [],
  };
}

beforeEach(() => {
  vi.resetModules();
  store = new FakeStorage();
  language = 'spanish';
  (globalThis as Record<string, unknown>).localStorage = store;
  stubDom();
});

afterEach(() => {
  delete (globalThis as Record<string, unknown>).localStorage;
  delete (globalThis as Record<string, unknown>).document;
});

/** Switch mode the way the tab handler does: write vq_mode. */
function switchTo(mode: string): void {
  store.setItem('vq_mode', mode);
}

async function load() {
  const state = await import('../../src/client/filters/filter-state.ts');
  const cls   = await import('../../src/client/filters/class-filter.ts');
  const scope = await import('../../src/client/filters/filter-scope.ts');
  return { state, cls, scope };
}

/** Set the class filter through its public surface, as a chip click would. */
async function selectClasses(values: string[]) {
  const { state } = await load();
  const { writeJson } = await import('../../src/client/utils/storage.ts');
  const bucket = state.bucketFor('class');
  writeJson(`vq_classfilter_${language}__${bucket}`, { active: true, selected: values });
}

describe('a mode with no chain flag yet', () => {
  it('is chained, because that is how the app behaved before chaining existed', async () => {
    const { state } = await load();
    switchTo('table');
    expect(state.isChained('class')).toBe(true);
  });

  it('reads the shared bucket', async () => {
    const { state } = await load();
    switchTo('recall');
    expect(state.bucketFor('class')).toBe(state.SHARED_BUCKET);
  });
});

describe('two linked modes', () => {
  it('see the same selection', async () => {
    const { cls } = await load();

    switchTo('table');
    await selectClasses(['noun']);
    expect(cls.getSelectedClasses()).toEqual(['noun']);

    switchTo('recall');
    expect(cls.getSelectedClasses()).toEqual(['noun']);
  });

  it('see a change made in either one', async () => {
    const { cls } = await load();

    switchTo('recall');
    await selectClasses(['verb']);

    switchTo('table');
    expect(cls.getSelectedClasses()).toEqual(['verb']);
  });
});

describe('unlinking a mode', () => {
  it('forks it onto its own bucket', async () => {
    const { state, cls } = await load();

    switchTo('table');
    await selectClasses(['noun']);

    // Unlink Recall.
    switchTo('recall');
    state.toggleChain('class', (from, to) => cls.copyStateForTest(from, to));

    expect(state.isChained('class', 'recall')).toBe(false);
    expect(state.bucketFor('class')).toBe('recall');
  });

  it('carries the shared setting across so nothing changes at the click', async () => {
    const { state, cls } = await load();

    switchTo('table');
    await selectClasses(['noun']);

    switchTo('recall');
    state.toggleChain('class', (from, to) => cls.copyStateForTest(from, to));

    expect(cls.getSelectedClasses()).toEqual(['noun']);
  });

  it('stops it following the other modes afterwards', async () => {
    const { state, cls } = await load();

    switchTo('recall');
    state.toggleChain('class', (from, to) => cls.copyStateForTest(from, to));

    switchTo('table');
    await selectClasses(['adjective']);

    switchTo('recall');
    expect(cls.getSelectedClasses()).not.toEqual(['adjective']);
  });
});

describe('re-linking a mode', () => {
  it('pushes its setting to the modes that were already linked', async () => {
    const { state, cls } = await load();

    // Recall goes its own way with 'verb'.
    switchTo('recall');
    state.toggleChain('class', (from, to) => cls.copyStateForTest(from, to));
    await selectClasses(['verb']);

    // Table, still linked, has something else.
    switchTo('table');
    await selectClasses(['noun']);

    // Re-link Recall: its setting becomes everyone's.
    switchTo('recall');
    state.toggleChain('class', (from, to) => cls.copyStateForTest(from, to));
    expect(state.isChained('class', 'recall')).toBe(true);
    expect(cls.getSelectedClasses()).toEqual(['verb']);

    switchTo('table');
    expect(cls.getSelectedClasses()).toEqual(['verb']);
  });
});

describe('chain flags are not per language', () => {
  it('unlinking a mode keeps it unlinked in every language', async () => {
    const { state, cls } = await load();

    switchTo('recall');
    state.toggleChain('class', (from, to) => cls.copyStateForTest(from, to));

    language = 'french';
    expect(state.isChained('class', 'recall')).toBe(false);
  });

  it('falls back to shared in a language the unlinked mode was never used in', async () => {
    const { state, cls } = await load();

    // Spanish: unlink Recall while the shared bucket holds nouns.
    switchTo('table');
    await selectClasses(['noun']);
    switchTo('recall');
    state.toggleChain('class', (from, to) => cls.copyStateForTest(from, to));
    expect(cls.getSelectedClasses()).toEqual(['noun']);

    // French was never open when that happened, so it has no Recall bucket.
    // Reading it as empty would mean the French filter silently switched
    // itself off in that one mode; it reads the shared setting until French
    // Recall is actually edited.
    language = 'french';
    switchTo('table');
    await selectClasses(['verb']);
    switchTo('recall');
    expect(cls.getSelectedClasses()).toEqual(['verb']);
  });

  it('still diverges once the unlinked mode is edited in that language', async () => {
    const { state, cls } = await load();

    switchTo('recall');
    state.toggleChain('class', (from, to) => cls.copyStateForTest(from, to));

    language = 'french';
    switchTo('table');
    await selectClasses(['verb']);

    // First edit in French Recall creates its own bucket…
    switchTo('recall');
    await selectClasses(['adverb']);
    expect(cls.getSelectedClasses()).toEqual(['adverb']);

    // …and Table keeps its own from then on.
    switchTo('table');
    expect(cls.getSelectedClasses()).toEqual(['verb']);
  });
});

describe('conjugation mode', () => {
  it('falls back to the Table bucket rather than inventing a sixth', async () => {
    const { scope } = await load();
    switchTo('conjugation');
    expect(scope.currentScope()).toBe('table');
  });

  it('therefore shares Table\'s selection', async () => {
    const { cls } = await load();
    switchTo('table');
    await selectClasses(['verb']);

    switchTo('conjugation');
    expect(cls.getSelectedClasses()).toEqual(['verb']);
  });
});

describe('the domain filter persists every way of changing it', () => {
  /**
   * The Top-10 pills used to change the working Set and repaint without
   * writing anything back — they open-coded renderAll's first three lines and
   * left off the persist. So a domain picked from a pill drew correctly, was
   * gone after a mode switch, never reached a linked mode, and did not survive
   * a reload. Removing it again *did* persist, because the chip's × button
   * called renderAll, so the filter looked intermittently broken.
   *
   * This asserts on the source rather than the DOM: the module needs a live
   * document to render, and the invariant worth pinning is structural — every
   * mutation of `selected` goes through the one function that saves.
   */
  it('routes every mutation through changeSelection', async () => {
    const fs   = await import('node:fs');
    const path = await import('node:path');
    const url  = await import('node:url');

    const here   = path.dirname(url.fileURLToPath(import.meta.url));
    const source = fs.readFileSync(
      path.join(here, '../../src/client/filters/domain-filter.ts'), 'utf8');

    const lines = source.split('\n');
    const offenders: string[] = [];

    lines.forEach((line, i) => {
      if (!/\bselected\.(add|delete|clear)\(/.test(line)) return;
      // The declaration and the loader are allowed: one creates the Set, the
      // other fills it *from* storage, so there is nothing to write back.
      const context = lines.slice(Math.max(0, i - 12), i + 1).join('\n');
      if (/function loadFromBucket/.test(context)) return;
      if (/changeSelection\(/.test(context)) return;
      offenders.push(`  line ${i + 1}: ${line.trim()}`);
    });

    expect(offenders,
      'these mutate the domain selection without going through changeSelection, ' +
      'so the change is drawn but never saved:\n' + offenders.join('\n')
    ).toEqual([]);
  });

  it('has exactly one place that writes the selection back', async () => {
    const fs   = await import('node:fs');
    const path = await import('node:path');
    const url  = await import('node:url');

    const here   = path.dirname(url.fileURLToPath(import.meta.url));
    const source = fs.readFileSync(
      path.join(here, '../../src/client/filters/domain-filter.ts'), 'utf8');

    // One definition, one call. A second call site is how the first one came
    // to be skippable.
    expect(source.match(/^function persist\(/gm)?.length).toBe(1);
    expect(source.match(/^\s+persist\(\);/gm)?.length).toBe(1);
  });
});
