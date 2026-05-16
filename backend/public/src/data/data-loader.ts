/**
 * data-loader.ts
 *
 * Fetches vocabulary from the backend API at /api/vocab/:lang.
 * Returns typed Word arrays with in-memory caching.
 */

import type { Word } from '../types.js';
import { showLoading, hideLoading, showErrorMessage } from '../ui/ui.js';

interface VocabApiResponse {
  success: boolean;
  error?:  boolean;
  message?: string;
  data:    Word[];
}

interface Language {
  code:       string;
  name:       string;
  nativeName: string;
  flag:       string;
}

interface LanguagesApiResponse {
  languages: Language[];
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
      throw new Error(data.message ?? 'Unknown error loading vocabulary');
    }

    const words = data.data ?? [];
    console.log(`✓ Loaded ${words.length} words for ${lang}`);

    cache[lang] = words;
    hideLoading();
    return words;
  } catch (error) {
    hideLoading();
    const msg = error instanceof Error ? error.message : 'Failed to load vocabulary. Please try again.';
    console.error('Error loading vocabulary:', error);
    showErrorMessage(msg);
    throw error;
  }
}

export async function preloadLanguages(): Promise<Language[]> {
  try {
    const response = await fetch(`${window.location.origin}/api/languages`);
    const data: LanguagesApiResponse = await response.json();
    return data.languages ?? [];
  } catch (error) {
    console.error('Error loading languages:', error);
    return [];
  }
}
