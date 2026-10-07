/**
 * settings-help.ts — Settings → Help → "CSV import & export": each CSV file the app writes, drawn as a
 * small spreadsheet (column letters, the header row, two example rows) with the exact text of the file
 * under it, and what My Lists → Bulk import accepts, shown as examples rather than described.
 *
 * Nothing here restates a column. The header comes from csv-schema.ts and the vocabulary rows from the
 * exporter's own vocabCsvCells, so the picture cannot drift from the files; the column-by-column reference
 * (renderCsvDocs, settings-search.ts) sits below it in the same group.
 */

import { VOCAB_CSV, TABLE_CSV, csvHeaders, csvCell, type CsvFormat } from '../shared/vocab/csv-schema.ts';
import { vocabCsvCells, type VocabCsvWord } from '../shared/vocab/csv.ts';

/** Two real-looking words. The note on hablar holds a comma and quotes, so the example shows quoting too. */
const SAMPLE_WORDS: VocabCsvWord[] = [
  {
    rank: 46, word: 'hablar', translation: 'to speak', glosses: ['to speak', 'to talk'], pos: 'verb', difficulty: null,
    tags: [], notes: 'Regular -ar verb, like "trabajar"', examples: ['Hablo español.'],
    linguistic: { ipa: '/aˈβlaɾ/', infinitive: 'hablar', reflexive: false, register: 'neutral' }, frequency: { band: 'A1' },
  },
  {
    rank: 68, word: 'casa', translation: 'house', glosses: ['house', 'home'], pos: 'noun', difficulty: null,
    tags: ['home'], notes: '', examples: ['Mi casa es tu casa.'],
    linguistic: { ipa: '/ˈkasa/', gender: 'feminine', plural: 'casas', reflexive: false }, frequency: { band: 'A1' },
  },
];

/** The same two words as the Table's Export CSV writes them (rank, word, language, part of speech, meanings). */
export const TABLE_SAMPLE_ROWS: string[][] = [
  ['46', 'hablar', 'spanish', 'verb', 'to speak / to talk'],
  ['68', 'casa', 'spanish', 'noun', 'house / home'],
];

const cellText = (v: unknown): string => (v == null ? '' : String(v));

/** Example rows for a format, as the strings a spreadsheet would show in each cell. */
export function sampleRows(format: CsvFormat): string[][] {
  if (format.id === VOCAB_CSV.id) return SAMPLE_WORDS.map(w => vocabCsvCells(w).map(cellText));
  if (format.id === TABLE_CSV.id) return TABLE_SAMPLE_ROWS;
  return [];
}

/** A, B, … Z, AA, AB — spreadsheet column letters. */
export function columnLetter(i: number): string {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, cls?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (cls) e.className = cls;
  return e;
}

/** One format: where it comes from, a spreadsheet picture, and the raw text behind it. */
function formatCard(format: CsvFormat): HTMLElement {
  const card = el('div', undefined, 'csv-guide-card');
  card.append(el('h2', format.title, 'csv-guide-title'));
  card.append(el('p', `${format.from}. Saved as ${format.filename}.`, 'csv-guide-from'));

  const header = csvHeaders(format);
  const rows = sampleRows(format);
  const table = el('table', undefined, 'csv-sheet');
  table.setAttribute('aria-label', `${format.title}: the header row and two example rows`);
  const letters = table.createTHead().insertRow();
  letters.append(el('td', '', 'csv-sheet-corner'));   // a plain cell: an empty header is announced as nothing
  header.forEach((_, i) => letters.append(el('th', columnLetter(i), 'csv-sheet-letter')));
  const body = table.createTBody();
  [header, ...rows].forEach((cells, r) => {
    const tr = body.insertRow();
    if (r === 0) tr.className = 'csv-sheet-header';
    tr.append(el('th', String(r + 1), 'csv-sheet-rownum'));
    cells.forEach(c => { const td = el('td', c); td.title = c; tr.append(td); });
  });
  const scroll = el('div', undefined, 'csv-sheet-scroll');
  // It scrolls sideways, so it must be reachable by keyboard to scroll at all.
  scroll.tabIndex = 0;
  scroll.setAttribute('role', 'region');
  scroll.setAttribute('aria-label', `${format.title}, example rows (scrolls sideways)`);
  scroll.append(table);
  card.append(scroll);

  const raw = el('details', undefined, 'csv-guide-raw');
  raw.append(el('summary', 'The same rows as text'));
  raw.append(el('pre', [header, ...rows].map(cells => cells.map(csvCell).join(',')).join('\n')));
  card.append(raw);
  return card;
}

/** What Bulk import takes, and the one shape it doesn't. */
function bulkImportCard(): HTMLElement {
  const card = el('div', undefined, 'csv-guide-card');
  card.append(el('h2', 'My Lists → Bulk import', 'csv-guide-title'));
  card.append(el('p', 'Words only — one list of them, in any of these shapes. Paste it or pick a .csv / .txt file.', 'csv-guide-from'));
  const grid = el('div', undefined, 'csv-guide-examples');
  const example = (label: string, text: string, ok = true): void => {
    const box = el('div', undefined, 'csv-guide-example' + (ok ? '' : ' csv-guide-example--bad'));
    box.append(el('span', (ok ? '✓ ' : '✗ ') + label, 'csv-guide-example-label'));
    box.append(el('pre', text));
    grid.append(box);
  };
  example('One per line', 'hablar\ncasa\ncomer');
  example('Separated by commas or semicolons', 'hablar, casa, comer');
  example('A row copied from a spreadsheet (tabs)', 'hablar\tcasa\tcomer');
  example('Not a table with a header — every cell becomes a word', 'word,translation\nhablar,to speak', false);
  card.append(grid);
  return card;
}

export function renderCsvGuide(): void {
  const host = document.getElementById('csvGuide');
  if (!host || host.childElementCount > 0) return;
  host.append(formatCard(VOCAB_CSV), formatCard(TABLE_CSV), bulkImportCard());
}
