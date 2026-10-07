import { loadWords } from '../../data/data-loader.ts';
import type { Word } from '../../types.ts';
import { buildCsv } from '../../../shared/vocab/csv.ts';

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

/** The vocabulary CSV — the same builder the Tauri admin export uses. */
export const buildVocabCsv = (words: Word[]): string => buildCsv(words);

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
