/**
 * data-loader.ts
 *
 * Fetches vocabulary from the backend API at /api/vocab/:lang.
 * Returns typed Word arrays with in-memory caching.
 */

import type { Word } from '../types.js';
import { showLoading, hideLoading, showErrorMessage } from '../ui/ui.js';
import { logger } from '../utils/logger.js';

interface VocabApiResponse {
  success: boolean;
  error?:  string;   // set when success is false; contains the error message
  data:    Word[];
}

const cache: Record<string, Word[]> = {};

export async function loadWords(lang: string): Promise<Word[]> {
  if (cache[lang]) return cache[lang];

  try {
    showLoading(`Loading ${lang} vocabulary...`);

    const response = await fetch(`${window.location.origin}/api/vocab/${lang}`);

    if (!response.ok) {
      throw new Error(`Failed to load vocabulary: ${response.status} ${response.statusText}`);
    }

    const data: VocabApiResponse = await response.json();

    if (data.error) {
      throw new Error(data.error);
    }

    const words = data.data ?? [];
    logger.info(`✓ Loaded ${words.length} words for ${lang}`);

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
