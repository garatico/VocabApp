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

import { loadWords } from '../../data/data-loader.ts';
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
    // The same words every other mode reads — one download, held once, with My
    // Content's overrides and the derived tenses applied. This used to call
    // loadVocab itself, so the whole language (~4.7 MB for Spanish) was fetched
    // and parsed a second time, and a second copy kept in memory, just for My Lists.
    const data = await loadWords(lang);
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
        domains:     Array.isArray(w.domains)  ? w.domains.filter(Boolean)  : [],
        ipa:         w.linguistic?.ipa || null,
        audioUrl:    w.audio_url ?? null,
        disambiguator: w.disambiguator || null,
        meaningDisambiguators: w.meaningDisambiguators || null,
        conjugations: w.linguistic?.conjugations ?? null,
      }));
    vocabCache.set(lang, entries);
    vocabMapCache.set(lang, new Map(entries.map(e => [e.word, e])));
    return entries;
  } catch {
    return [];
  }
}
