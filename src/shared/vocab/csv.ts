import { VOCAB_CSV, csvHeaders, csvCell } from './csv-schema.js';

/**
 * csv.ts — the vocabulary CSV (VOCAB_CSV), built from the shaped word that
 * shape-word.ts produces. Used by the Tauri admin export and by My Content's
 * "Export vocabulary as CSV"; src/server/routes/admin/export.ts keeps its own
 * GROUP_CONCAT query but writes the same cells through the same csvCell.
 */

/** The fields the vocabulary CSV reads — satisfied by both the server's and the client's `Word`. */
export interface VocabCsvWord {
  rank?:       number | null;
  word:        string;
  translation: string;
  glosses:     string[];
  pos:         string | null;
  difficulty:  string | number | null;
  tags:        string[];
  notes:       string;
  examples:    string[];
  linguistic?: {
    ipa?: string | null; gender?: string | null; plural?: string | null;
    infinitive?: string | null; reflexive?: boolean | null; register?: string | null;
  } | null;
  frequency?: { band?: string | null } | null;
}

const HEADERS = csvHeaders(VOCAB_CSV);   // the columns are declared in csv-schema.ts, which also documents them

/** One word's cells, in VOCAB_CSV's column order, before quoting. Settings → Help draws its example from this. */
export function vocabCsvCells(w: VocabCsvWord): unknown[] {
  const l = w.linguistic;
  return [
    w.rank, w.word, w.translation,
    w.glosses.join('|'),
    w.pos, w.difficulty,
    w.tags.join('|'),
    w.notes,
    w.examples.join('|'),
    l?.ipa, w.frequency?.band, l?.gender,
    l?.plural, l?.infinitive,
    l?.reflexive ? 'true' : '',
    l?.register,
  ];
}

export function buildCsv(words: readonly VocabCsvWord[]): string {
  const lines = [HEADERS.join(',')];
  for (const w of words) lines.push(vocabCsvCells(w).map(csvCell).join(','));
  return lines.join('\n');
}
