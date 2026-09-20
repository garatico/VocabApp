import type { Word } from '../types.js';

/**
 * csv.ts — the admin export CSV format, built directly from the same Word
 * shape shape-word.ts already produces (glosses/examples/tags are already
 * arrays, frequency.band is already computed) rather than a second
 * GROUP_CONCAT-based query and formatter — src/server/routes/admin/export.ts
 * keeps its own existing query for the web/hosted path unchanged; this is
 * what the Tauri path (no separate route to hit) uses instead, reusing
 * loadAllWordsForLanguage's output directly.
 */
function esc(v: unknown): string {
  if (v == null) return '';
  const s = String(v);
  return (s.includes(',') || s.includes('"') || s.includes('\n'))
    ? '"' + s.replace(/"/g, '""') + '"'
    : s;
}

const HEADERS = [
  'rank', 'word', 'translation', 'glosses', 'pos', 'difficulty', 'tags',
  'notes', 'examples', 'ipa', 'frequency_band', 'gender', 'plural',
  'infinitive', 'reflexive', 'register',
];

export function buildCsv(words: Word[]): string {
  const lines = [HEADERS.join(',')];
  for (const w of words) {
    lines.push([
      esc(w.rank), esc(w.word), esc(w.translation),
      esc(w.glosses.join('|')),
      esc(w.pos), esc(w.difficulty),
      esc(w.tags.join('|')),
      esc(w.notes),
      esc(w.examples.join('|')),
      esc(w.linguistic.ipa ?? null), esc(w.frequency.band), esc(w.linguistic.gender ?? null),
      esc(w.linguistic.plural ?? null), esc(w.linguistic.infinitive ?? null),
      esc(w.linguistic.reflexive ? 'true' : ''),
      esc(w.linguistic.register ?? null),
    ].join(','));
  }
  return lines.join('\n');
}
