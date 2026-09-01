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
import { getUserWords, toWord, applyWordOverride } from './user-content.ts';


const cache: Record<string, Word[]> = {};

/**
 * The vocabulary for `lang` if it's already been loaded this session, or
 * null if not — a synchronous escape hatch for callers (word-filters.ts's
 * filterWords, evaluating a smart list) that can't await loadWords()'s
 * fetch mid-filter. Never triggers a load itself: a language nothing has
 * shown yet just contributes nothing, rather than blocking on a fetch.
 */
export function getCachedWords(lang: string): Word[] | null {
  return cache[lang] ?? null;
}

/** "482318" -> "0.5 MB". Below 1 MB shows KB instead — Dutch/German are a few hundred KB. */
function formatBytes(bytes: number): string {
  return bytes >= 1_048_576
    ? `${(bytes / 1_048_576).toFixed(1)} MB`
    : `${Math.round(bytes / 1024)} KB`;
}

/**
 * The vocabulary for `lang` plus words added on the My Content tab, before
 * any My Content word override (see data/user-content.ts's WordOverride) is
 * applied — what My Content's own word editor needs to show the *true*
 * original values (including glosses hidden by an existing override), so
 * hiding something is never a one-way door. Every other caller should use
 * `loadWords` below instead.
 */
export async function loadRawWords(lang: string): Promise<Word[]> {
  const words = await loadCachedVocab(lang);
  const userWords = getUserWords(lang).map(toWord);
  return userWords.length ? [...userWords, ...words] : words;
}

/**
 * `loadRawWords` with any My Content word override applied — done here
 * rather than folded into `cache`, so a word added, or an override changed,
 * after this language was first loaded shows up on the next call instead of
 * needing a full reload. The vocabulary fetch itself is still cached below;
 * only this cheap merge and per-word override application re-run every call.
 *
 * This is the one place every client-side consumer of a Word's translation,
 * pos, notes, domains or glosses — table mode, multiple-choice, tooltips, My
 * Lists — ultimately reads from, so applying the override here propagates
 * everywhere at once rather than needing each mode to re-check for one
 * itself. (The real admin panel reads straight from the server and never
 * calls this, by design — see user-content.ts's own header.)
 */
export async function loadWords(lang: string): Promise<Word[]> {
  const words = await loadRawWords(lang);
  return words.map(w => applyWordOverride(lang, w));
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
