/**
 * table-pagination.test.ts — table mode paging maths and the words-per-page
 * setting (src/client/modes/table-controls.ts, src/client/settings.ts).
 *
 * Runs in the node environment with a minimal in-memory localStorage stub.
 * Only the pure helpers are exercised here; the DOM rendering around them is
 * covered by hand.
 */
import { describe, it, expect, beforeEach } from 'vitest';

// ── localStorage stub (must exist before Settings reads it) ───────────────────
const store = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem:    (k: string) => store.get(k) ?? null,
  setItem:    (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  clear:      () => { store.clear(); },
};

const { pageCountFor, pageSlice } = await import('../../src/client/modes/table-controls.js');
const { Settings }                = await import('../../src/client/settings.js');

beforeEach(() => store.clear());

const words = (n: number): string[] => Array.from({ length: n }, (_, i) => `w${i + 1}`);

// ── Page count ───────────────────────────────────────────────────────────────

describe('pageCountFor', () => {
  it('splits an exact multiple evenly', () => {
    expect(pageCountFor(200, 100)).toBe(2);
  });

  it('rounds a partial last page up', () => {
    expect(pageCountFor(201, 100)).toBe(3);
    expect(pageCountFor(1, 100)).toBe(1);
  });

  it('reports a single page when pagination is off', () => {
    expect(pageCountFor(5000, Infinity)).toBe(1);
  });

  it('never reports fewer than one page', () => {
    expect(pageCountFor(0, 100)).toBe(1);
    expect(pageCountFor(-5, 100)).toBe(1);
  });

  it('treats a nonsensical page size as no pagination', () => {
    expect(pageCountFor(500, 0)).toBe(1);
    expect(pageCountFor(500, -10)).toBe(1);
    expect(pageCountFor(500, NaN)).toBe(1);
  });
});

// ── Page slicing ─────────────────────────────────────────────────────────────

describe('pageSlice', () => {
  it('returns the first page', () => {
    expect(pageSlice(words(250), 100, 0)).toEqual(words(250).slice(0, 100));
  });

  it('returns a middle page', () => {
    const page = pageSlice(words(250), 100, 1);
    expect(page).toHaveLength(100);
    expect(page[0]).toBe('w101');
    expect(page[99]).toBe('w200');
  });

  it('returns a short final page', () => {
    const page = pageSlice(words(250), 100, 2);
    expect(page).toHaveLength(50);
    expect(page[0]).toBe('w201');
    expect(page[49]).toBe('w250');
  });

  it('clamps an index past the end to the last page', () => {
    expect(pageSlice(words(250), 100, 99)).toEqual(pageSlice(words(250), 100, 2));
  });

  it('clamps a negative index to the first page', () => {
    expect(pageSlice(words(250), 100, -3)).toEqual(pageSlice(words(250), 100, 0));
  });

  it('returns everything when pagination is off', () => {
    expect(pageSlice(words(250), Infinity, 0)).toHaveLength(250);
  });

  it('covers every word exactly once across all pages', () => {
    const all   = words(250);
    const pages = pageCountFor(all.length, 100);
    const seen  = Array.from({ length: pages }, (_, i) => pageSlice(all, 100, i)).flat();
    expect(seen).toEqual(all);
  });

  it('does not mutate the source list', () => {
    const all = words(10);
    pageSlice(all, 4, 1);
    expect(all).toHaveLength(10);
  });
});

// ── Setting ──────────────────────────────────────────────────────────────────

describe('Settings.getTablePageSize', () => {
  it('defaults to 100', () => {
    expect(Settings.getTablePageSize()).toBe(100);
  });

  it('reads a saved numeric size', () => {
    store.set('s_table_page_size', '25');
    expect(Settings.getTablePageSize()).toBe(25);
  });

  it('treats "all" as no pagination', () => {
    store.set('s_table_page_size', 'all');
    expect(Settings.getTablePageSize()).toBe(Infinity);
  });

  it('falls back to no pagination for junk or non-positive values', () => {
    for (const bad of ['banana', '0', '-10', '']) {
      store.set('s_table_page_size', bad);
      expect(Settings.getTablePageSize()).toBe(Infinity);
    }
  });
});
