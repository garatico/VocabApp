/**
 * adaptive-order.test.ts — the 'adaptive' word order (session-history.ts).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const store = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem:    (k: string) => store.get(k) ?? null,
  setItem:    (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  clear:      () => { store.clear(); },
  get length() { return store.size; },
  key: (i: number) => [...store.keys()][i] ?? null,
};

const { adaptiveKey, orderWords } = await import('../../src/client/utils/session-history.js');
beforeEach(() => store.clear());

const NOW = 1_000_000_000_000;
const DAY = 86_400_000;

describe('adaptiveKey tiers', () => {
  it('due < weak < new < scheduled', () => {
    const due   = adaptiveKey({ dueAt: NOW - DAY }, 0, 500, NOW);
    const weak  = adaptiveKey({ dueAt: NOW + DAY }, 3, 500, NOW);
    const fresh = adaptiveKey(null, 0, 50, NOW);
    const later = adaptiveKey({ dueAt: NOW + DAY }, 0, 1, NOW);
    expect(due).toBeLessThan(weak);
    expect(weak).toBeLessThan(fresh);
    expect(fresh).toBeLessThan(later);
  });

  it('within due, most overdue first; within weak, most missed first', () => {
    expect(adaptiveKey({ dueAt: NOW - 3 * DAY }, 0, 1, NOW))
      .toBeLessThan(adaptiveKey({ dueAt: NOW - DAY }, 0, 1, NOW));
    expect(adaptiveKey(null, 5, 1, NOW)).toBeLessThan(adaptiveKey(null, 2, 1, NOW));
  });
});

describe("orderWords 'adaptive'", () => {
  it('puts due words first, then weak, then new by rank, then scheduled', () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    store.set('vq_srs_spanish', JSON.stringify({
      due:   { box: 1, dueAt: NOW - DAY },
      later: { box: 3, dueAt: NOW + 5 * DAY },
    }));
    store.set('vq_misses_spanish', JSON.stringify({ weak: 2 }));
    const words = [
      { word: 'later', rank: 1 }, { word: 'new2', rank: 20 }, { word: 'weak', rank: 9 },
      { word: 'new1', rank: 10 }, { word: 'due', rank: 500 },
    ];
    expect(orderWords(words, 'adaptive', 'spanish').map(w => w.word))
      .toEqual(['due', 'weak', 'new1', 'new2', 'later']);
    vi.restoreAllMocks();
  });
});
