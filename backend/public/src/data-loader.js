/**
 * Data Loader - Phase 3 Updated with Phase 4B Enhancements
 * Fetches vocabulary from backend API at /api/vocab/:lang
 * Includes loading spinner and error feedback
 */

import { showLoading, hideLoading, showErrorMessage } from './ui.js';

const cache = {};

export async function loadWords(lang) {
  // Check cache first
  if (cache[lang]) return cache[lang];

  try {
    showLoading(`Loading ${lang} vocabulary...`);
    console.log(`Loading ${lang} vocabulary from API...`);

    // Fetch from backend API
    const baseUrl = window.location.origin;
    const apiUrl = `${baseUrl}/api/vocab/${lang}`;

    const response = await fetch(apiUrl);

    if (!response.ok) {
      throw new Error(`Failed to load vocabulary: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(data.message || 'Unknown error loading vocabulary');
    }

    const words = data.data || [];
    console.log(`✓ Loaded ${words.length} words for ${lang}`);

    // Cache the result
    cache[lang] = words;

    hideLoading();
    return words;
  } catch (error) {
    console.error('Error loading vocabulary:', error);
    hideLoading();
    showErrorMessage(error.message || 'Failed to load vocabulary. Please try again.');
    throw error;
  }
}

export async function preloadLanguages() {
  try {
    const response = await fetch(`${window.location.origin}/api/languages`);
    const data = await response.json();
    return data.languages || [];
  } catch (error) {
    console.error('Error loading languages:', error);
    return [];
  }
}
