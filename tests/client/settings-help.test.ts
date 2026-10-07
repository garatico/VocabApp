// @vitest-environment jsdom
/**
 * settings-help.test.ts — Settings → Help & Tips → "CSV import & export" (src/client/settings-help.ts).
 * The pictures of the CSV files must stay the files: one cell per schema column, the vocabulary rows
 * built by the exporter itself, and the text view quoted the way the exporters quote.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderCsvGuide, sampleRows, columnLetter } from '../../src/client/settings-help.ts';
import { VOCAB_CSV, TABLE_CSV, CSV_FORMATS, csvHeaders } from '../../src/shared/vocab/csv-schema.ts';

describe('sample rows', () => {
  it.each(CSV_FORMATS.map(f => [f.id, f] as const))('%s: two rows, one cell per column', (_id, format) => {
    const rows = sampleRows(format);
    expect(rows).toHaveLength(2);
    rows.forEach(r => expect(r).toHaveLength(csvHeaders(format).length));
  });

  it('the vocabulary example puts each value under its own header', () => {
    const [hablar] = sampleRows(VOCAB_CSV);
    const at = (col: string): string => hablar[csvHeaders(VOCAB_CSV).indexOf(col)];
    expect(at('word')).toBe('hablar');
    expect(at('glosses')).toBe('to speak|to talk');
    expect(at('frequency_band')).toBe('A1');
    expect(at('reflexive')).toBe('');
  });
});

describe('columnLetter', () => {
  it('counts like a spreadsheet', () => {
    expect([0, 1, 25, 26, 27, 51, 52].map(columnLetter)).toEqual(['A', 'B', 'Z', 'AA', 'AB', 'AZ', 'BA']);
  });
});

describe('renderCsvGuide', () => {
  beforeEach(() => { document.body.innerHTML = '<div id="csvGuide"></div>'; });

  it('draws every format as a sheet: letters, header row, two example rows', () => {
    renderCsvGuide();
    const sheets = [...document.querySelectorAll('#csvGuide table.csv-sheet')];
    expect(sheets).toHaveLength(2);
    [VOCAB_CSV, TABLE_CSV].forEach((fmt, i) => {
      const letters = [...sheets[i].querySelectorAll('thead .csv-sheet-letter')].map(th => th.textContent);
      expect(letters).toEqual(csvHeaders(fmt).map((_, c) => columnLetter(c)));
      const header = [...sheets[i].querySelectorAll('.csv-sheet-header td')].map(td => td.textContent);
      expect(header).toEqual(csvHeaders(fmt));
      expect(sheets[i].querySelectorAll('tbody tr')).toHaveLength(3);
    });
  });

  it('the text view quotes a cell holding a comma or quotes, as the exporters do', () => {
    renderCsvGuide();
    const text = document.querySelector('.csv-guide-raw pre')?.textContent ?? '';
    expect(text.split('\n')[0]).toBe(csvHeaders(VOCAB_CSV).join(','));
    expect(text).toContain('"Regular -ar verb, like ""trabajar"""');
  });

  it('shows what Bulk import takes, and the shape it does not', () => {
    renderCsvGuide();
    expect(document.querySelectorAll('.csv-guide-example')).toHaveLength(4);
    expect(document.querySelectorAll('.csv-guide-example--bad')).toHaveLength(1);
  });

  it('draws once, however often Settings is bound', () => {
    renderCsvGuide();
    renderCsvGuide();
    expect(document.querySelectorAll('#csvGuide table.csv-sheet')).toHaveLength(2);
  });
});
