/**
 * domain-filter-pool.test.ts — the dropdown's candidate pool.
 *
 * computeDropdownPool() is what showDropdown() calls to decide what to list
 * under the search box. The module comment promises "remaining domains in a
 * scrollable dropdown" — remaining meaning "not already a pill" — so a
 * top-10 domain that hasn't been picked yet must not also show up in the
 * search results underneath its own pill.
 */

import { describe, it, expect } from 'vitest';
import { computeDropdownPool } from '../../src/client/filters/domain-filter.ts';

const ALL = [
  { domain: 'food',     count: 100 },
  { domain: 'travel',   count: 80 },
  { domain: 'health',   count: 60 },
  { domain: 'sports',   count: 10 },
  { domain: 'weather',  count: 5 },
];

const PILLS = ['food', 'travel', 'health'];

describe('computeDropdownPool', () => {
  it('excludes pill domains even when nothing is selected and the query is empty', () => {
    const pool = computeDropdownPool(ALL, PILLS, new Set(), '');
    expect(pool.map(x => x.domain)).toEqual(['sports', 'weather']);
  });

  it('excludes selected domains alongside pill domains', () => {
    const pool = computeDropdownPool(ALL, PILLS, new Set(['sports']), '');
    expect(pool.map(x => x.domain)).toEqual(['weather']);
  });

  it('does not resurface a pill domain in search results just because it matches the query', () => {
    // "food" is a pill and matches the query, but it already has a pill —
    // it should not also appear in the dropdown underneath it.
    const pool = computeDropdownPool(ALL, PILLS, new Set(), 'o');
    expect(pool.map(x => x.domain)).not.toContain('food');
  });

  it('ranks starts-with matches before contains matches among the remaining domains', () => {
    const all = [
      { domain: 'sports',        count: 10 },
      { domain: 'water_sports',  count: 4 },
      { domain: 'weather',       count: 5 },
    ];
    const pool = computeDropdownPool(all, [], new Set(), 'sport');
    expect(pool.map(x => x.domain)).toEqual(['sports', 'water_sports']);
  });

  it('empty query lists the remaining domains alphabetically', () => {
    const pool = computeDropdownPool(ALL, PILLS, new Set(), '');
    expect(pool.map(x => x.domain)).toEqual(['sports', 'weather']);
  });
});
