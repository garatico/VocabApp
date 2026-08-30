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
import { capitalize } from '../utils/utils.js';
import { getUserWords, toWord } from './user-content.ts';


const cache: Record<string, Word[]> = {};

/** "482318" -> "0.5 MB". Below 1 MB shows KB instead — Dutch/German are a few hundred KB. */
function formatBytes(bytes: number): string {
  return bytes >= 1_048_576
    ? `${(bytes / 1_048_576).toFixed(1)} MB`
    : `${Math.round(bytes / 1024)} KB`;
}

/**
 * Merges in words added on the My Content tab (see data/user-content.ts) —
 * done here rather than folded into `cache`, so a word added after this
 * language was first loaded shows up on the next call instead of needing a
 * full reload. The vocabulary fetch itself is still cached below; only this
 * cheap merge re-runs every call.
 */
export async function loadWords(lang: string): Promise<Word[]> {
  const words = await loadCachedVocab(lang);
  const userWords = getUserWords(lang).map(toWord);
  return userWords.length ? [...userWords, ...words] : words;
}

async function loadCachedVocab(lang: string): Promise<Word[]> {
  if (cache[lang]) return cache[lang];

  const label = capitalize(lang);

  try {
    showLoading(`Loading ${label} vocabulary...`);

    // Live API first, bundled static export second — see vocab-source.ts.
    // A packaged Tauri/Capacitor build has no server to answer /api/vocab.
    // onRetry fires while a sleeping Render instance wakes up; onProgress
    // fires as bytes stream in once it has. Either way the spinner says
    // something truer than a silent multi-second stall — Spanish alone is
    // ~4.7MB, plenty long enough on a cold connection to look hung.
    const payload = await loadVocab(lang, {
      onRetry: () => {
        showLoading('Waking up the server... this can take up to a minute on first load.');
      },
      onProgress: loadedBytes => {
        showLoading(`Loading ${label} vocabulary... ${formatBytes(loadedBytes)} received`);
      },
    });
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
