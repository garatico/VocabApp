/**
 * export-list.ts — write a list out as a .txt download.
 *
 * Two formats because they serve different purposes: word + translation is a
 * study sheet, words-only is what other flashcard tools want pasted in.
 */

import type { ExportFormat, VocabEntry } from './types.ts';

export function exportList(
  words: string[], vocabMap: Map<string, VocabEntry> | undefined,
  listName: string, lang: string,
  format: ExportFormat = 'with-translation',
): void {
  let content: string;
  let filename: string;
  if (format === 'words-only') {
    content  = words.join('\n');
    filename = `${listName}-${lang}-words.txt`;
  } else {
    const lines = words.map(w => {
      const e = vocabMap?.get(w);
      return e?.translation ? `${w}\t${e.translation}` : w;
    });
    content  = lines.join('\n');
    filename = `${listName}-${lang}.txt`;
  }
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}
