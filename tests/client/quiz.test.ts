/**
 * quiz.test.ts — Quiz state machine (src/client/quiz/quiz.ts)
 *
 * Runs in the node environment with a minimal in-memory localStorage stub.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { Quiz } from '../../src/client/quiz/quiz.js';
import type { Word } from '../../src/client/types.js';

// ── localStorage stub ─────────────────────────────────────────────────────────
const store = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem:    (k: string) => store.get(k) ?? null,
  setItem:    (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  clear:      () => { store.clear(); },
};

const word = (over: Record<string, unknown>): Word => over as unknown as Word;

const WORDS: Word[] = [
  word({ word: 'hablar', glosses: ['to speak', 'to talk'] }),
  word({ word: 'comer',  glosses: ['to eat'] }),
  word({ word: 'casa',   glosses: ['house'] }),
];

beforeEach(() => store.clear());

describe('Quiz initialization', () => {
  it('creates a sequential order covering every word exactly once', () => {
    // Sequential, not shuffled: the caller (start-handler.ts) already put
    // `words` in whatever order its Order setting picked, shuffle included —
    // reshuffling here would silently discard every other option.
    const q = new Quiz({ words: WORDS, storageKey: 'k' });
    expect(q.state.order).toEqual([0, 1, 2]);
    expect(q.state.pos).toBe(0);
    expect(q.state.seen).toEqual({});
  });

  it('persists state and restores it for the same word list', () => {
    const q1 = new Quiz({ words: WORDS, storageKey: 'k' });
    q1.next();
    const q2 = new Quiz({ words: WORDS, storageKey: 'k' });
    expect(q2.state.pos).toBe(1);
    expect(q2.state.order).toEqual(q1.state.order);
  });

  it('resets stale state when the word list size changes', () => {
    new Quiz({ words: WORDS, storageKey: 'k' });
    const q = new Quiz({ words: WORDS.slice(0, 2), storageKey: 'k' });
    expect(q.state.order).toHaveLength(2);
    expect(q.state.pos).toBe(0);
  });

  it('resets when saved indices are out of range', () => {
    store.set('k', JSON.stringify({ order: [5, 6, 7], pos: 1, seen: {} }));
    const q = new Quiz({ words: WORDS, storageKey: 'k' });
    expect([...q.state.order].sort()).toEqual([0, 1, 2]);
    expect(q.state.pos).toBe(0);
  });
});

describe('Quiz progression', () => {
  it('next() advances and wraps around', () => {
    const q = new Quiz({ words: WORDS, storageKey: 'k' });
    const first = q.current();
    q.next(); q.next(); q.next(); // full cycle
    expect(q.current()).toBe(first);
  });
});

describe('Quiz.check', () => {
  function quizAt(targetWord: string): Quiz {
    const q = new Quiz({ words: WORDS, storageKey: 'k' });
    while (q.current().word !== targetWord) q.next();
    return q;
  }

  it('accepts an exact gloss', () => {
    const q = quizAt('casa');
    expect(q.check('house').ok).toBe(true);
  });

  it('accepts near-misses within the levenshtein threshold', () => {
    const q = quizAt('hablar');
    expect(q.check('to speek').ok).toBe(true); // 1 edit, thresh = 2
  });

  it('rejects answers beyond the threshold', () => {
    const q = quizAt('casa');
    expect(q.check('mouth').ok).toBe(false);   // dist 3 > thresh 1
    expect(q.check('xxxxx').ok).toBe(false);
  });

  it('returns the expected answers and tallies stats', () => {
    const q = quizAt('comer');
    const res = q.check('wrong answer');
    expect(res.expected).toBe('to eat');
    q.check('to eat');
    const s = q.stats();
    expect(s).toMatchObject({ seen: 1, correct: 1, incorrect: 1, total: 3 });
    expect(q.uniqueCorrectCount()).toBe(1);
  });
});

describe('Quiz.reset', () => {
  it('clears progress', () => {
    const q = new Quiz({ words: WORDS, storageKey: 'k' });
    q.check('whatever');
    q.reset();
    expect(q.stats()).toMatchObject({ seen: 0, correct: 0, incorrect: 0 });
    expect(q.state.pos).toBe(0);
  });
});

describe('Quiz typo tolerance option', () => {
  function quizWith(tolerance: number | undefined, targetWord: string): Quiz {
    const q = new Quiz({ words: WORDS, storageKey: 'k', tolerance });
    while (q.current().word !== targetWord) q.next();
    return q;
  }

  it('tolerance 0 requires the exact (normalized) answer', () => {
    const q = quizWith(0, 'casa');
    expect(q.check('mouse').ok).toBe(false);  // 1 edit — rejected when off
    expect(q.check('house').ok).toBe(true);   // exact still works
  });

  it('tolerance 0 still ignores case/accents/whitespace', () => {
    const q = quizWith(0, 'casa');
    expect(q.check('  HOUSE ').ok).toBe(true);
  });

  it('low tolerance forgives fewer edits than high', () => {
    // "to speak" (8 chars): low → thresh max(1, floor(8*0.15)) = 1, high → 2
    expect(quizWith(0.15, 'hablar').check('to speek').ok).toBe(true);   // 1 edit
    expect(quizWith(0.15, 'hablar').check('ta speek').ok).toBe(false);  // 2 edits
    expect(quizWith(0.35, 'hablar').check('ta speek').ok).toBe(true);   // 2 edits
  });

  it('defaults to normal (25%) when not specified', () => {
    const q = quizWith(undefined, 'hablar');
    expect(q.tolerance).toBe(0.25);
    expect(q.check('to speek').ok).toBe(true);
  });
});

describe('prototype-key words (regression)', () => {
  // Spanish "constructor" (= builder) used to resolve to Object.prototype.constructor
  // in the seen-stats lookup, corrupting tallies.
  const TRICKY: Word[] = [
    word({ word: 'constructor', glosses: ['builder'] }),
    word({ word: 'casa', glosses: ['house'] }),
  ];

  it('tallies stats correctly for a word named "constructor"', () => {
    const q = new Quiz({ words: TRICKY, storageKey: 'k' });
    while (q.current().word !== 'constructor') q.next();
    expect(q.check('builder').ok).toBe(true);
    expect(q.stats()).toMatchObject({ seen: 1, correct: 1, incorrect: 0 });
    expect(q.uniqueCorrectCount()).toBe(1);
    // and the tally landed in state, not on the global Object function
    expect((Object as unknown as { correct?: number }).correct).toBeUndefined();
  });
});
