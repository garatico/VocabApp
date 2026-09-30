/**
 * csv-schema.ts — the one statement of what the app's CSV files contain.
 *
 * Every CSV the app writes takes its header row from here, and Settings → Glossary → "CSV formats"
 * renders its tables from here, so the documentation cannot disagree with the files. Add, remove or
 * reorder a column HERE and both follow; tests/client/csv-schema.test.ts fails if an exporter stops
 * using this file or stops matching it.
 *
 * Files the app reads: only the Bulk import in My Lists (see BULK_IMPORT_RULES) — it takes a list of
 * words, not a table. Every other CSV here is output only.
 */

export interface CsvColumn {
  name:        string;
  /** What is in the cell, in one line. */
  description: string;
  /** How the cell is written, when that needs saying (a separator, a fixed set of values, blank when …). */
  format?:     string;
}

export interface CsvFormat {
  /** Stable id — the Glossary heading and the tests refer to it. */
  id:       string;
  title:    string;
  /** Where the file comes from, in the user's terms. */
  from:     string;
  filename: string;
  columns:  CsvColumn[];
  /** Line ending the file is written with. */
  lineEnding: 'LF' | 'CRLF';
}

/** Conventions every exported CSV shares. */
export const CSV_CONVENTIONS: string[] = [
  'UTF-8 text, comma-separated, with one header row. Open it in a spreadsheet as UTF-8 so accents and non-Latin scripts survive.',
  'A cell containing a comma, a double quote or a line break is wrapped in double quotes, and any double quote inside it is doubled ("").',
  'A cell that holds a list (glosses, tags, examples) writes its items separated by a vertical bar: one|two|three. An item that itself contains a bar cannot be told apart from two items.',
  'An empty cell means "not set". There is no other placeholder — not "null", not "N/A".',
];

/** The vocabulary export: My Content → Export vocabulary as CSV, the Admin panel's Export, and the desktop app's Admin export. */
export const VOCAB_CSV: CsvFormat = {
  id: 'vocabulary',
  title: 'Vocabulary export',
  from: 'My Content → Export vocabulary as CSV, and the Admin panel → DB Admin → Export',
  filename: '<language>_<YYYY-MM-DD>.csv',
  lineEnding: 'LF',
  columns: [
    { name: 'rank', description: 'Frequency rank; 1 is the most common word.', format: 'Whole number; blank if the word is unranked.' },
    { name: 'word', description: 'The word itself, in the language being studied.' },
    { name: 'translation', description: 'The primary English meaning.' },
    { name: 'glosses', description: 'Every English meaning, in order. The first is the primary one.', format: 'Items separated by |.' },
    { name: 'pos', description: 'Part of speech.', format: 'noun, verb, adjective, adverb, pronoun, preposition, conjunction, article, interjection or numeral (Japanese and Chinese add particle and suffix).' },
    { name: 'difficulty', description: 'Difficulty rating, if the word has one.', format: 'Whole number 1–5; blank if unset.' },
    { name: 'tags', description: 'Tags attached to the word.', format: 'Items separated by |.' },
    { name: 'notes', description: 'Usage notes and common mistakes.', format: 'Free text.' },
    { name: 'examples', description: 'Example sentences.', format: 'Items separated by |.' },
    { name: 'ipa', description: 'Pronunciation. IPA for most languages; the romanization (pinyin, romaji) for Chinese and Japanese.', format: 'Blank if none.' },
    { name: 'frequency_band', description: 'CEFR level worked out from the rank.', format: 'A1, A2, B1, B2, C1 or C2; blank if unranked.' },
    { name: 'gender', description: 'Grammatical gender, for languages that have it.', format: 'masculine, feminine or m/f; blank otherwise.' },
    { name: 'plural', description: 'The plural form of a noun.' },
    { name: 'infinitive', description: 'The infinitive a verb form belongs to.' },
    { name: 'reflexive', description: 'Whether the verb is reflexive.', format: '"true", or blank.' },
    { name: 'register', description: 'Formality of the word.', format: 'neutral, formal, informal, colloquial, slang, vulgar or literary; blank if not recorded.' },
  ],
};

/** The Table quiz's own export: the "Export CSV" button on the Table screen. */
export const TABLE_CSV: CsvFormat = {
  id: 'table',
  title: 'Table export',
  from: 'Table → Export CSV (the words currently in the table)',
  filename: 'table_words.csv',
  lineEnding: 'CRLF',
  columns: [
    { name: 'rank', description: 'Frequency rank; 1 is the most common word.', format: 'Whole number; blank if unranked.' },
    { name: 'word', description: 'The word itself.' },
    { name: 'language', description: 'Which language the word is from — useful when several are merged into one table.', format: 'Lower-case language name, e.g. spanish.' },
    { name: 'part_of_speech', description: 'Part of speech.', format: 'As in the database; blank if none.' },
    { name: 'translation', description: 'The meanings as the table shows them, with any per-meaning note in parentheses.', format: 'Meanings separated by " / ".' },
  ],
};

export const CSV_FORMATS: CsvFormat[] = [VOCAB_CSV, TABLE_CSV];

/** The header row of `format`, exactly as the exporters write it. */
export const csvHeaders = (format: CsvFormat): string[] => format.columns.map(c => c.name);

/** What My Lists → Bulk import reads. It is a list of words, not a table, so it has no columns. */
export const BULK_IMPORT_RULES: string[] = [
  'A .csv or .txt file, or text pasted into the box. Any of comma, semicolon, tab or line break separates one word from the next.',
  'Every cell is treated as a word — there are no columns and no header row. A file with a header row will try to add the header names as words, and a multi-column file (like the vocabulary export above) will try to add every cell, translations included. Give it one column of words.',
  'Matching ignores accents and capitals. When several entries differ only by an accent (como / cómo) you are asked which you meant; a word with no exact match but close ones (hablo → hablar) is offered as a suggestion; anything still unmatched is listed by name rather than dropped silently.',
];
