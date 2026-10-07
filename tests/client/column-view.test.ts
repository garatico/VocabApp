import { describe, it, expect } from 'vitest';
import {
  nextSort, sortArrow, ariaSort, compareCells, parseNumericFilter, cellMatches, sortByColumn,
  type SortState,
} from '../../src/client/utils/column-view.ts';

describe('nextSort', () => {
  it('cycles ascending -> descending -> unsorted', () => {
    let s: SortState = { key: null, dir: 'asc' };
    s = nextSort(s, 'rank');  expect(s).toEqual({ key: 'rank', dir: 'asc' });
    s = nextSort(s, 'rank');  expect(s).toEqual({ key: 'rank', dir: 'desc' });
    s = nextSort(s, 'rank');  expect(s).toEqual({ key: null, dir: 'asc' });
  });

  it('starts a different column ascending, whatever the last one was doing', () => {
    expect(nextSort({ key: 'rank', dir: 'desc' }, 'word')).toEqual({ key: 'word', dir: 'asc' });
  });
});

describe('header indicators', () => {
  it('shows an arrow only on the sorted column', () => {
    const s: SortState = { key: 'word', dir: 'desc' };
    expect(sortArrow(s, 'word')).toBe(' ▼');
    expect(sortArrow(s, 'rank')).toBe('');
    expect(sortArrow({ key: 'word', dir: 'asc' }, 'word')).toBe(' ▲');
  });

  it('reports aria-sort', () => {
    expect(ariaSort({ key: 'a', dir: 'asc' }, 'a')).toBe('ascending');
    expect(ariaSort({ key: 'a', dir: 'desc' }, 'a')).toBe('descending');
    expect(ariaSort({ key: 'a', dir: 'desc' }, 'b')).toBe('none');
  });
});

describe('compareCells', () => {
  it('compares numbers as numbers, not text', () => {
    expect(compareCells('9', '10', true, 'asc')).toBeLessThan(0);
    expect(compareCells('9', '10', false, 'asc')).toBeGreaterThan(0);   // as text, "9" > "10"
  });

  it('puts blanks last in both directions', () => {
    expect(compareCells('', '5', true, 'asc')).toBeGreaterThan(0);
    expect(compareCells('', '5', true, 'desc')).toBeGreaterThan(0);
    expect(compareCells('5', '', true, 'asc')).toBeLessThan(0);
    expect(compareCells('5', '', true, 'desc')).toBeLessThan(0);
    expect(compareCells('', '', true, 'asc')).toBe(0);
  });

  it('treats non-numbers in a numeric column as blank', () => {
    expect(compareCells('n/a', '3', true, 'asc')).toBeGreaterThan(0);
  });

  it('puts blank text last in both directions too', () => {
    expect(compareCells('', 'a', false, 'asc')).toBeGreaterThan(0);
    expect(compareCells('', 'a', false, 'desc')).toBeGreaterThan(0);
    expect(compareCells('a', '', false, 'asc')).toBeLessThan(0);
    expect(compareCells('a', '', false, 'desc')).toBeLessThan(0);
  });

  it('reverses text order for descending', () => {
    expect(compareCells('a', 'b', false, 'asc')).toBeLessThan(0);
    expect(compareCells('a', 'b', false, 'desc')).toBeGreaterThan(0);
  });
});

describe('parseNumericFilter', () => {
  it('understands comparisons', () => {
    expect(parseNumericFilter('>100')!(101)).toBe(true);
    expect(parseNumericFilter('>100')!(100)).toBe(false);
    expect(parseNumericFilter('>=100')!(100)).toBe(true);
    expect(parseNumericFilter('< 50')!(49)).toBe(true);
    expect(parseNumericFilter('<=50')!(51)).toBe(false);
    expect(parseNumericFilter('=7')!(7)).toBe(true);
    expect(parseNumericFilter('=7')!(8)).toBe(false);
  });

  it('understands inclusive ranges, in either order', () => {
    const r = parseNumericFilter('10-50')!;
    expect([9, 10, 30, 50, 51].map(r)).toEqual([false, true, true, true, false]);
    expect(parseNumericFilter('50..10')!(30)).toBe(true);
  });

  it('returns null for anything else, so it is matched as text', () => {
    expect(parseNumericFilter('10')).toBeNull();
    expect(parseNumericFilter('abc')).toBeNull();
    expect(parseNumericFilter('>')).toBeNull();
    expect(parseNumericFilter('')).toBeNull();
  });
});

describe('cellMatches', () => {
  it('passes everything for an empty filter', () => {
    expect(cellMatches('anything', '')).toBe(true);
    expect(cellMatches('', '   ')).toBe(true);
  });

  it('matches a substring, case-insensitively by default', () => {
    expect(cellMatches('Hablar', 'abl')).toBe(true);
    expect(cellMatches('Hablar', 'xyz')).toBe(false);
  });

  it('keeps a plain number a substring, as the Admin grid always did', () => {
    expect(cellMatches('1010', '10', { numeric: true })).toBe(true);
    expect(cellMatches('7', '10', { numeric: true })).toBe(false);
  });

  it('applies comparisons only to numeric columns', () => {
    expect(cellMatches('150', '>100', { numeric: true })).toBe(true);
    expect(cellMatches('50', '>100', { numeric: true })).toBe(false);
    expect(cellMatches('150', '>100')).toBe(false);          // text column: ">100" is just text
  });

  it('matches a plain filter against richer text when the cell is only a number', () => {
    // a mastery level 3 should answer to "confident" as well as to ">=3"
    expect(cellMatches('3', 'confid', { numeric: true, text: '3 Confident' })).toBe(true);
    expect(cellMatches('3', '>=3', { numeric: true, text: '3 Confident' })).toBe(true);
    expect(cellMatches('3', 'learning', { numeric: true, text: '3 Confident' })).toBe(false);
  });

  it('never lets a blank cell pass a comparison', () => {
    expect(cellMatches('', '>100', { numeric: true })).toBe(false);
    expect(cellMatches('', '<100', { numeric: true })).toBe(false);
  });

  it('uses the supplied fold for substring tests', () => {
    const fold = (s: string): string => s.normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase();
    expect(cellMatches('canción', 'cancion', { fold })).toBe(true);
    expect(cellMatches('canción', 'cancion')).toBe(false);
  });
});

describe('sortByColumn', () => {
  const rows = [{ w: 'b', r: '20' }, { w: 'a', r: '' }, { w: 'c', r: '3' }];
  const valueOf = (x: { w: string; r: string }, key: string): string => (key === 'rank' ? x.r : x.w);
  const isNumeric = (key: string): boolean => key === 'rank';

  it('sorts text and numbers by their own rules and never mutates the input', () => {
    const before = [...rows];
    expect(sortByColumn(rows, { key: 'word', dir: 'desc' }, valueOf, isNumeric).map(x => x.w)).toEqual(['c', 'b', 'a']);
    expect(sortByColumn(rows, { key: 'rank', dir: 'asc' }, valueOf, isNumeric).map(x => x.w)).toEqual(['c', 'b', 'a']);
    expect(sortByColumn(rows, { key: 'rank', dir: 'desc' }, valueOf, isNumeric).map(x => x.w)).toEqual(['b', 'c', 'a']);
    expect(rows).toEqual(before);
  });

  it('returns a copy in the given order when no column is selected', () => {
    const out = sortByColumn(rows, { key: null, dir: 'asc' }, valueOf, isNumeric);
    expect(out).toEqual(rows);
    expect(out).not.toBe(rows);
  });
});
