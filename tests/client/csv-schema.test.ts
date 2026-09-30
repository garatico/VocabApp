// @vitest-environment jsdom
/**
 * csv-schema.test.ts — the CSV files, the schema that names their columns, and the Glossary page that
 * documents them stay one thing. Add a column to an exporter without touching csv-schema.ts and this fails.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { VOCAB_CSV, TABLE_CSV, CSV_FORMATS, csvHeaders } from '../../src/shared/vocab/csv-schema.ts';
import { buildCsv } from '../../src/shared/vocab/csv.ts';
import { buildVocabCsv } from '../../src/client/modes/my-content/csv-export.ts';
import { renderCsvDocs } from '../../src/client/settings-search.ts';
import type { Word } from '../../src/client/types.ts';

const word = {
  word: 'hablar', translation: 'speak', pos: 'verb', difficulty: 2, notes: 'n', rank: 10,
  glosses: ['speak', 'talk'], examples: ['Hablo.'], tags: ['a', 'b'], domains: [],
  linguistic: { ipa: '/a/', gender: null, plural: null, infinitive: 'hablar', reflexive: false, register: 'neutral' },
  frequency: { band: 'A1', rank: 10, corpus_frequency: 1 },
} as unknown as Word;

const src = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf-8');

describe('vocabulary CSV', () => {
  const headers = csvHeaders(VOCAB_CSV);

  it('every exporter writes exactly the schema\'s header row and as many cells per row', () => {
    for (const csv of [buildCsv([word] as never), buildVocabCsv([word])]) {
      const [head, row] = csv.split('\n');
      expect(head).toBe(headers.join(','));
      expect(row.split(',').length).toBe(headers.length);
    }
  });

  it('the server export takes its header row from the schema', () => {
    expect(src('src/server/routes/admin/export.ts')).toContain('csvHeaders(VOCAB_CSV)');
  });
});

describe('table CSV', () => {
  it('the Table export takes its header row from the schema', () => {
    expect(src('src/client/modes/table-controls.ts')).toContain('csvHeaders(TABLE_CSV)');
    expect(csvHeaders(TABLE_CSV)).toEqual(['rank', 'word', 'language', 'part_of_speech', 'translation']);
  });
});

describe('Glossary "CSV formats"', () => {
  it('renders one table per format with a row for every column', () => {
    document.body.innerHTML = '<div id="csvDocs"></div>';
    renderCsvDocs();
    const tables = [...document.querySelectorAll('#csvDocs table')];
    expect(tables).toHaveLength(CSV_FORMATS.length);
    CSV_FORMATS.forEach((fmt, i) => {
      const names = [...tables[i].querySelectorAll('tbody td.csv-docs-name')].map(td => td.textContent);
      expect(names).toEqual(csvHeaders(fmt));
    });
  });

  it('is in the page', () => {
    expect(src('index.html')).toContain('id="csvDocs"');
  });
});
