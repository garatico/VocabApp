/**
 * data-loader.ts
 *
 * Fetches vocabulary from the backend API at /api/vocab/:lang.
 * Returns typed Word arrays with in-memory caching.
 */

import type { Word } from '../types.js';
import { loadVocab, loadVocabPage } from './vocab-source.ts';
import { showLoading, hideLoading, showErrorMessage } from '../ui/ui.js';
import { logger } from '../utils/logger.js';
import { capitalize } from '../utils/utils.js';
import { enrichDerivedTenses } from './derived-tenses.ts';
import { getUserWords, toWord, applyWordOverride, getConjOverrides, pickConjOverride, applyConjOverrideRecord } from './user-content.ts';


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
  return addUserWords(lang, await loadCachedVocab(lang));
}

function addUserWords(lang: string, words: Word[]): Word[] {
  const userWords = getUserWords(lang).map(toWord);
  return userWords.length ? [...userWords, ...words] : words;
}

/** `words` with My Content's own words added and every override applied — what loadWords does after the fetch. */
async function withUserContent(lang: string, words: Word[]): Promise<Word[]> {
  return applyEdits(lang, addUserWords(lang, words));
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
  return applyEdits(lang, await loadRawWords(lang));
}

function applyEdits(lang: string, words: Word[]): Word[] {
  const conj = getConjOverrides(lang);            // read once, not per word
  const hasConj = Object.keys(conj).length > 0;
  return words.map(w => {
    const withEdits = applyWordOverride(lang, w);
    return hasConj ? applyConjOverrideRecord(withEdits, pickConjOverride(conj, w.word)) : withEdits;
  });
}

/** Full loads in progress, so a foreground caller and the background top-up share one fetch. */
const inflight: Record<string, Promise<Word[]>> = {};

function loadCachedVocab(lang: string, silent = false): Promise<Word[]> {
  if (cache[lang]) return Promise.resolve(cache[lang]);
  return inflight[lang] ??= fetchFullVocab(lang, silent).finally(() => { delete inflight[lang]; });
}

/** How many of the most frequent words the first paint waits for. The page API caps a page at 200. */
const PREVIEW_SIZE = 200;

export interface ProgressiveWords {
  words:    Word[];
  /** False when `words` is only the most frequent slice; `full` then resolves to the whole language. */
  complete: boolean;
  full:     Promise<Word[]>;
}

/**
 * `loadWords`, but for the first paint: when the language isn't in memory yet and a paged source is
 * available (the live API or the desktop app's SQLite), returns just the most frequent 200 words at once
 * and finishes the rest in the background — `full` resolves when they are in. Where no paged source
 * exists (the bundled static export) it behaves exactly like `loadWords`. Only the caller that redraws
 * when `full` resolves should use this; everything else keeps calling `loadWords` and gets all of it.
 */
export async function loadWordsProgressive(lang: string): Promise<ProgressiveWords> {
  if (!cache[lang]) {
    let preview: Word[] | null = null;
    try {
      const page = await loadVocabPage(lang, { page: 1, limit: PREVIEW_SIZE });
      if (page.total > page.words.length) { preview = page.words; enrichDerivedTenses(lang, preview); }
    } catch { /* no paged source — fall through to the whole-language load */ }

    if (preview) {
      const full = loadCachedVocab(lang, true).then(() => loadWords(lang));
      full.catch(() => { /* the foreground load path reports failures; a silent top-up just stays partial */ });
      return { words: await withUserContent(lang, preview), complete: false, full };
    }
  }
  const words = await loadWords(lang);
  return { words, complete: true, full: Promise.resolve(words) };
}

async function fetchFullVocab(lang: string, silent: boolean): Promise<Word[]> {
  const label = capitalize(lang);
  const show = (msg: string): void => { if (!silent) showLoading(msg); };

  try {
    show(`Loading ${label} vocabulary...`);

    // Live API first, bundled static export second — see vocab-source.ts.
    // A packaged Tauri/Capacitor build has no server to answer /api/vocab.
    // onRetry fires while a sleeping Render instance wakes up; onProgress
    // fires as bytes stream in once it has. Either way the spinner says
    // something truer than a silent multi-second stall — Spanish alone is
    // ~4.7MB, plenty long enough on a cold connection to look hung.
    const payload = await loadVocab(lang, {
      onRetry: () => {
        show('Waking up the server... this can take up to a minute on first load.');
      },
      onProgress: loadedBytes => {
        show(`Loading ${label} vocabulary... ${formatBytes(loadedBytes)} received`);
      },
    });
    const words   = payload.data;
    enrichDerivedTenses(lang, words);   // tenses the database lacks (Portuguese, French, Italian), derived from those it has
    logger.info(`✓ Loaded ${words.length} words for ${lang} (${payload.origin})`);

    cache[lang] = words;
    if (!silent) hideLoading();
    return words;
  } catch (error) {
    if (!silent) hideLoading();
    const msg = error instanceof Error ? error.message : 'Failed to load vocabulary. Please try again.';
    logger.error('Error loading vocabulary:', error);
    if (!silent) showErrorMessage(msg);
    throw error;
  }
}
