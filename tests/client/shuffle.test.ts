/**
 * shuffle.test.ts — the one Fisher–Yates.
 *
 * Five copies of this loop existed. The properties worth pinning are the ones
 * a subtly wrong rewrite breaks silently: it must be a permutation (nothing
 * lost, nothing duplicated), and `shuffle` must not touch its input — three of
 * the five copies were called on arrays the caller still held.
 */

import { describe, it, expect } from 'vitest';
import { shuffle, shuffleInPlace, shuffledIndices } from '../../src/client/utils/shuffle.ts';

describe('shuffle', () => {
  it('returns a permutation of the input', () => {
    const input = ['a', 'b', 'c', 'd', 'e'];
    const out   = shuffle(input);
    expect(out).toHaveLength(input.length);
    expect([...out].sort()).toEqual([...input].sort());
  });

  it('leaves the input untouched', () => {
    const input = ['a', 'b', 'c', 'd', 'e'];
    shuffle(input);
    expect(input).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('handles the empty and single-item cases', () => {
    expect(shuffle([])).toEqual([]);
    expect(shuffle(['only'])).toEqual(['only']);
  });

  it('actually reorders — over many runs it is not always the identity', () => {
    // A 10-item array has 3.6M orderings; 50 runs all returning the input
    // would mean the swap loop never fires.
    const input = Array.from({ length: 10 }, (_, i) => i);
    const moved = Array.from({ length: 50 }, () => shuffle(input))
      .some(out => out.some((v, i) => v !== input[i]));
    expect(moved).toBe(true);
  });

  it('reaches the first position — the classic off-by-one leaves items[0] pinned', () => {
    const input = Array.from({ length: 6 }, (_, i) => i);
    const firstMoved = Array.from({ length: 100 }, () => shuffle(input))
      .some(out => out[0] !== 0);
    expect(firstMoved).toBe(true);
  });
});

describe('shuffleInPlace', () => {
  it('mutates and returns the same array', () => {
    const input = [1, 2, 3, 4, 5];
    const out   = shuffleInPlace(input);
    expect(out).toBe(input);
    expect([...out].sort()).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('shuffledIndices', () => {
  it('returns every index exactly once', () => {
    const out = shuffledIndices(8);
    expect([...out].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('returns an empty array for length 0', () => {
    expect(shuffledIndices(0)).toEqual([]);
  });
});
