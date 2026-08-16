/**
 * vocab-cache.ts — the vocabulary My Lists searches, filters and describes.
 *
 * Every part of the panel needs the same rows: the add-search matches against
 * them, the stats line counts them, smart lists evaluate against them, and each
 * word row reads its translation and rank from them. So they are fetched once
 * per language and held here rather than passed down through the render tree.
 *
 * Two structures for the same data. The array is what gets filtered and sorted;
 * the map is what a word row does a single lookup in. Rebuilding one from the
 * other on every keystroke was the panel's slowest operation.
 */

import type { Word as ApiWord } from '../../types.ts';
import { loadVocab } from '../../data/vocab-source.ts';
import type { VocabEntry } from './types.ts';

const vocabCache    = new Map<string, VocabEntry[]>();
const vocabMapCache = new Map<string, Map<string, VocabEntry>>();

/** Rows for a language, or an empty array if they have not loaded yet. */
export function cachedVocab(lang: string): VocabEntry[] {
  return vocabCache.get(lang) ?? [];
}

/** Word → entry for a language, or undefined if not loaded yet. */
export function cachedVocabMap(lang: string): Map<string, VocabEntry> | undefined {
  return vocabMapCache.get(lang);
}

export async function fetchVocab(lang: string): Promise<VocabEntry[]> {
  const hit = vocabCache.get(lang);
  if (hit) return hit;
  try {
    // Same source resolution as the main loader, so lists work offline too.
    const data = (await loadVocab(lang)).data as ApiWord[];
    const entries: VocabEntry[] = data
      .filter(w => w.word)
      .map(w => ({
        word:        w.word,
        translation: w.translation || '',
        pos:         w.pos         || null,
        rank:        w.frequency?.rank ?? w.rank ?? null,
        band:        w.frequency?.band ?? null,
        glosses:     Array.isArray(w.glosses)  ? w.glosses.filter(Boolean)  : [],
        examples:    Array.isArray(w.examples) ? w.examples.filter(Boolean) : [],
        ipa:         w.linguistic?.ipa || null,
      }));
    vocabCache.set(lang, entries);
    vocabMapCache.set(lang, new Map(entries.map(e => [e.word, e])));
    return entries;
  } catch {
    return [];
  }
}
