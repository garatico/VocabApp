import { loadWords } from '../../data/data-loader.ts';
import type { Word } from '../../types.ts';

/**
 * my-content/csv-export.ts — the "Export vocabulary as CSV" download.
 */

// ── Vocabulary CSV export ────────────────────────────────────────────────────
//
// A client-side twin of routes/admin/export.ts's CSV, built from loadWords()
// (already-loaded, overrides-applied vocab) rather than a server query — the
// packaged Tauri build has no Express behind it at all (vocab-source.ts), and
// the real Admin panel is dev+localhost-gated regardless, so that route was
// never reachable there. This one needs nothing but what the page already has.

function csvEscape(v: unknown): string {
  if (v == null) return '';
  const s = String(v);
  return (s.includes(',') || s.includes('"') || s.includes('\n'))
    ? '"' + s.replace(/"/g, '""') + '"'
    : s;
}

const VOCAB_CSV_HEADERS = [
  'rank', 'word', 'translation', 'glosses', 'pos', 'difficulty', 'tags',
  'notes', 'examples', 'ipa', 'frequency_band', 'gender', 'plural',
  'infinitive', 'reflexive', 'register',
];

function buildVocabCsv(words: Word[]): string {
  const lines = [VOCAB_CSV_HEADERS.join(',')];
  for (const w of words) {
    lines.push([
      csvEscape(w.rank ?? ''),
      csvEscape(w.word),
      csvEscape(w.translation),
      csvEscape(w.glosses.join('|')),
      csvEscape(w.pos),
      csvEscape(w.difficulty),
      csvEscape(w.tags.join('|')),
      csvEscape(w.notes),
      csvEscape(w.examples.join('|')),
      csvEscape(w.linguistic?.ipa),
      csvEscape(w.frequency?.band),
      csvEscape(w.linguistic?.gender),
      csvEscape(w.linguistic?.plural),
      csvEscape(w.linguistic?.infinitive),
      csvEscape(w.linguistic?.reflexive ? 'true' : ''),
      csvEscape(w.linguistic?.register),
    ].join(','));
  }
  return lines.join('\n');
}

export async function downloadVocabCsv(lang: string): Promise<void> {
  const words = await loadWords(lang);
  const blob  = new Blob([buildVocabCsv(words)], { type: 'text/csv;charset=utf-8' });
  const url   = URL.createObjectURL(blob);
  const a     = document.createElement('a');
  a.href      = url;
  a.download  = `${lang}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}
