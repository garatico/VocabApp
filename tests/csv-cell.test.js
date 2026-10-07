/**
 * tests/csv-cell.test.js — csvCell (src/shared/vocab/csv-schema.ts), the one
 * CSV cell escaper every exporter shares (there used to be four copies, none
 * of which quoted a bare carriage return).
 */
import { describe, it, expect } from 'vitest';
import { csvCell } from '../src/shared/vocab/csv-schema.js';
import { buildCsv } from '../src/shared/vocab/csv.js';

describe('csvCell', () => {
  it('leaves a plain value alone', () => {
    expect(csvCell('hablar')).toBe('hablar');
    expect(csvCell(42)).toBe('42');
    expect(csvCell(false)).toBe('false');
  });

  it('turns null and undefined into an empty cell', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });

  it.each([
    ['a,b',      '"a,b"'],
    ['say "hi"', '"say ""hi"""'],
    ['line\nbreak', '"line\nbreak"'],
    ['cr\ronly',   '"cr\ronly"'],
    ['crlf\r\nx',  '"crlf\r\nx"'],
  ])('quotes %j', (input, expected) => {
    expect(csvCell(input)).toBe(expected);
  });
});

describe('buildCsv', () => {
  it('tolerates a word with no linguistic or frequency block (client words can have null there)', () => {
    const csv = buildCsv([{
      word: 'y', translation: 'and', glosses: [], pos: null, difficulty: null,
      tags: [], notes: '', examples: [], linguistic: null, frequency: null,
    }]);
    const [, row] = csv.split('\n');
    expect(row.startsWith(',y,and,')).toBe(true);
  });
});
