/**
 * session-history.test.ts — quiz history, miss tracking and word ordering
 * (src/client/utils/session-history.ts).
 *
 * These are the functions recall, table and conjugation all share, so a bug
 * here shows up in three places at once. Node environment with an in-memory
 * localStorage stub, same pattern as table-pagination.test.ts.
 */
import { describe, it, expect, beforeEach } from 'vitest';

// ── localStorage stub (must exist before the module reads it) ─────────────────
const store = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem:    (k: string) => store.get(k) ?? null,
  setItem:    (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  clear:      () => { store.clear(); },
  get length() { return store.size; },
  key: (i: number) => [...store.keys()][i] ?? null,
};

const {
  getSessions, saveSession, wordsPerMinute,
  getMisses, recordOutcome, missCount, troubleWords,
  orderWords, clearHistory, HISTORY_KEEP,
} = await import('../../src/client/utils/session-history.js');

beforeEach(() => store.clear());

type Sess = Parameters<typeof saveSession>[1];
const session = (over: Partial<Sess> = {}): Sess => ({
  at: '2026-01-01T00:00:00.000Z',
  mode: 'recall',
  total: 50,
  correct: 20,
  unassisted: 18,
  hints: 2,
  revealed: 1,
  seconds: 300,
  ...over,
});

// ── Sessions ──────────────────────────────────────────────────────────────────

describe('sessions', () => {
  it('round-trips a saved session', () => {
    saveSession('spanish', session({ correct: 7 }));
    const all = getSessions('spanish');
    expect(all).toHaveLength(1);
    expect(all[0].correct).toBe(7);
  });

  it('returns the sessions that existed *before* the one being saved', () => {
    saveSession('spanish', session({ correct: 1 }));
    const prior = saveSession('spanish', session({ correct: 2 }));
    // The caller compares against history without a second read, so `prior`
    // must not include the session just written.
    expect(prior).toHaveLength(1);
    expect(prior[0].correct).toBe(1);
  });

  it('filters by mode, and prior is filtered to the same mode', () => {
    saveSession('spanish', session({ mode: 'recall', correct: 1 }));
    saveSession('spanish', session({ mode: 'table',  correct: 2 }));
    expect(getSessions('spanish', 'recall')).toHaveLength(1);
    expect(getSessions('spanish', 'table')).toHaveLength(1);
    expect(getSessions('spanish')).toHaveLength(2);

    const prior = saveSession('spanish', session({ mode: 'table', correct: 3 }));
    expect(prior.every(s => s.mode === 'table')).toBe(true);
  });

  it('keeps languages separate', () => {
    saveSession('spanish', session());
    expect(getSessions('french')).toEqual([]);
  });

  it('caps retained history at HISTORY_KEEP, keeping the newest', () => {
    for (let i = 0; i < HISTORY_KEEP + 5; i++) {
      saveSession('spanish', session({ correct: i }));
    }
    const all = getSessions('spanish');
    expect(all).toHaveLength(HISTORY_KEEP);
    expect(all[all.length - 1].correct).toBe(HISTORY_KEEP + 4);
  });

  it('survives a corrupt payload rather than throwing', () => {
    store.set('vq_history_spanish', '{not json');
    expect(getSessions('spanish')).toEqual([]);
  });
});

// ── Words per minute ──────────────────────────────────────────────────────────

describe('wordsPerMinute', () => {
  it('computes a rate', () => {
    expect(wordsPerMinute(30, 300)).toBe(6);
    expect(wordsPerMinute(12, 90)).toBe(8);
  });

  it('returns 0 below five seconds, where the figure is noise', () => {
    expect(wordsPerMinute(5, 3)).toBe(0);
    expect(wordsPerMinute(5, 0)).toBe(0);
  });

  it('rounds to one decimal', () => {
    expect(wordsPerMinute(10, 62)).toBe(9.7);
  });
});

// ── Misses ────────────────────────────────────────────────────────────────────

describe('miss tracking', () => {
  it('increments on a miss', () => {
    recordOutcome('spanish', ['casa', 'perro']);
    expect(missCount('spanish', 'casa')).toBe(1);
    recordOutcome('spanish', ['casa']);
    expect(missCount('spanish', 'casa')).toBe(2);
  });

  it('counts every occurrence in a single call', () => {
    // Real callers pass a de-duplicated word list, but the function does not
    // assume that — each entry increments.
    recordOutcome('spanish', ['casa', 'casa', 'casa']);
    expect(missCount('spanish', 'casa')).toBe(3);
  });

  it('decays on a correct answer instead of clearing outright', () => {
    recordOutcome('spanish', ['casa']);
    recordOutcome('spanish', ['casa']);
    expect(missCount('spanish', 'casa')).toBe(2);

    recordOutcome('spanish', [], ['casa']);
    expect(missCount('spanish', 'casa')).toBe(1);
  });

  it('drops a word once its tally reaches zero', () => {
    recordOutcome('spanish', ['casa']);
    recordOutcome('spanish', [], ['casa']);
    expect(missCount('spanish', 'casa')).toBe(0);
    expect(Object.keys(getMisses('spanish'))).not.toContain('casa');
  });

  it('never goes negative for a word that was never missed', () => {
    recordOutcome('spanish', [], ['nunca']);
    expect(missCount('spanish', 'nunca')).toBe(0);
    expect(getMisses('spanish')).toEqual({});
  });

  it('troubleWords returns words at or above the threshold, worst first', () => {
    recordOutcome('spanish', ['a', 'b', 'c']);
    recordOutcome('spanish', ['a', 'b']);
    recordOutcome('spanish', ['a']);
    expect(troubleWords('spanish')).toEqual(['a', 'b']);
    expect(troubleWords('spanish', 3)).toEqual(['a']);
    expect(troubleWords('spanish', 4)).toEqual([]);
  });

  it('clearHistory removes both sessions and misses', () => {
    saveSession('spanish', session());
    recordOutcome('spanish', ['casa']);
    clearHistory('spanish');
    expect(getSessions('spanish')).toEqual([]);
    expect(getMisses('spanish')).toEqual({});
  });
});

// ── Ordering ──────────────────────────────────────────────────────────────────

describe('orderWords', () => {
  const words = [
    { word: 'zebra',  rank: 3 },
    { word: 'alpha',  rank: 1 },
    { word: 'medio',  rank: 2 },
    { word: 'sinval', rank: null },
  ];

  it('orders by rank, treating null as last', () => {
    expect(orderWords(words, 'rank', 'spanish').map(w => w.word))
      .toEqual(['alpha', 'medio', 'zebra', 'sinval']);
  });

  it('orders alphabetically', () => {
    expect(orderWords(words, 'alpha', 'spanish').map(w => w.word))
      .toEqual(['alpha', 'medio', 'sinval', 'zebra']);
  });

  it('does not mutate the input', () => {
    const before = words.map(w => w.word);
    orderWords(words, 'alpha', 'spanish');
    expect(words.map(w => w.word)).toEqual(before);
  });

  it('shuffle keeps every word exactly once', () => {
    const out = orderWords(words, 'shuffle', 'spanish');
    expect(out).toHaveLength(words.length);
    expect(out.map(w => w.word).sort()).toEqual(words.map(w => w.word).sort());
  });

  it('trouble puts the most-missed first, falling back to rank', () => {
    recordOutcome('spanish', ['zebra']);
    recordOutcome('spanish', ['zebra']);   // zebra: 2
    recordOutcome('spanish', ['medio']);   // medio: 1
    expect(orderWords(words, 'trouble', 'spanish').map(w => w.word))
      .toEqual(['zebra', 'medio', 'alpha', 'sinval']);
  });

  it('trouble falls back to pure rank order when nothing has been missed', () => {
    expect(orderWords(words, 'trouble', 'spanish').map(w => w.word))
      .toEqual(orderWords(words, 'rank', 'spanish').map(w => w.word));
  });

  it('handles an empty set', () => {
    expect(orderWords([], 'shuffle', 'spanish')).toEqual([]);
  });
});
