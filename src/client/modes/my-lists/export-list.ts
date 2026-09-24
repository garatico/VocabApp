/**
 * export-list.ts — write a list out as a .txt download.
 *
 * Two formats because they serve different purposes: word + translation is a
 * study sheet, words-only is what other flashcard tools want pasted in.
 */

import type { ExportFormat, VocabEntry } from './types.ts';

export interface ExportRow { word: string; translation?: string; }

/** Download `rows` as `<baseName>.txt` (or `<baseName>-words.txt`). */
export function exportRows(rows: ExportRow[], baseName: string, format: ExportFormat = 'with-translation'): void {
  let content: string;
  let filename: string;
  if (format === 'words-only') {
    content  = rows.map(r => r.word).join('\n');
    filename = `${baseName}-words.txt`;
  } else {
    content  = rows.map(r => r.translation ? `${r.word}\t${r.translation}` : r.word).join('\n');
    filename = `${baseName}.txt`;
  }
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

export function exportList(
  words: string[], vocabMap: Map<string, VocabEntry> | undefined,
  listName: string, lang: string,
  format: ExportFormat = 'with-translation',
): void {
  exportRows(
    words.map(w => ({ word: w, translation: vocabMap?.get(w)?.translation })),
    `${listName}-${lang}`, format,
  );
}
