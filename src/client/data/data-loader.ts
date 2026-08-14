/**
 * data-loader.ts
 *
 * Fetches vocabulary from the backend API at /api/vocab/:lang.
 * Returns typed Word arrays with in-memory caching.
 */

import type { Word } from '../types.js';
import { loadVocab } from './vocab-source.ts';
import { showLoading, hideLoading, showErrorMessage } from '../ui/ui.js';
import { logger } from '../utils/logger.js';


const cache: Record<string, Word[]> = {};

export async function loadWords(lang: string): Promise<Word[]> {
  if (cache[lang]) return cache[lang];

  try {
    showLoading(`Loading ${lang} vocabulary...`);

    // Live API first, bundled static export second — see vocab-source.ts.
    // A packaged Tauri/Capacitor build has no server to answer /api/vocab.
    const payload = await loadVocab(lang);
    const words   = payload.data;
    logger.info(`✓ Loaded ${words.length} words for ${lang} (${payload.origin})`);

    cache[lang] = words;
    hideLoading();
    return words;
  } catch (error) {
    hideLoading();
    const msg = error instanceof Error ? error.message : 'Failed to load vocabulary. Please try again.';
    logger.error('Error loading vocabulary:', error);
    showErrorMessage(msg);
    throw error;
  }
}
