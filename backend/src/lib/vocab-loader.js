/**
 * Vocabulary Loader - SQLite Version
 *
 * Loads vocabulary from SQLite database with caching
 */

import Database from 'better-sqlite3';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.join(__dirname, '../../..');  // Goes to VocabApp/ root

// Database connection
let db = null;

// Cache for vocabulary data
const vocabCache = new Map();

// Supported languages
const SUPPORTED_LANGUAGES = ['spanish', 'portuguese', 'italian', 'french'];

/**
 * Initialize database connection
 */
function initializeDatabase() {
  if (db) return;

  const dbPath = path.join(appRoot, 'data', 'vocabulary.db');

  try {
    console.log(`Connecting to SQLite database: ${dbPath}`);
    db = new Database(dbPath, { fileMustExist: true });
    db.pragma('journal_mode = WAL');
    console.log('✓ SQLite database connected');
  } catch (error) {
    console.error('Database connection error:', error);
    if (error.code === 'SQLITE_CANTOPEN') {
      const err = new Error(`SQLite database not found at: ${dbPath}`);
      err.statusCode = 500;
      err.expectedPath = dbPath;
      throw err;
    }
    throw error;
  }
}

/**
 * Load vocabulary from SQLite database
 * @param {string} language - Language name (spanish, portuguese, etc.)
 * @returns {Promise<Object>} Vocabulary data with words array
 */
export async function loadVocabFile(language) {
  const lang = language.toLowerCase();

  // Check if already cached
  if (vocabCache.has(lang)) {
    const cached = vocabCache.get(lang);
    return {
      ...cached,
      cacheAge: Date.now() - cached.loadedAt,
      source: 'sqlite'
    };
  }

  // Check if language is supported
  if (!SUPPORTED_LANGUAGES.includes(lang)) {
    const error = new Error(`Language not found: ${language}`);
    error.statusCode = 404;
    error.availableLanguages = SUPPORTED_LANGUAGES;
    throw error;
  }

  try {
    // Initialize database if needed
    if (!db) {
      initializeDatabase();
    }

    console.log(`Loading vocabulary for: ${lang}`);

    // Query all words for this language with their related data
    // Sorted by frequency rank (most common first), fallback to alphabetical if no rank
    const stmt = db.prepare(`
      SELECT
        w.id, w.word, w.display, w.pos, w.difficulty, w.notes,
        wl.infinitive, wl.reflexive, wl.gender, wl.plural, wl.register, wl.ipa, wl.syllables, wl.conjugations,
        wf.band, wf.rank, wf.corpus_frequency,
        GROUP_CONCAT(wg.gloss) as glosses,
        GROUP_CONCAT(we.example) as examples,
        GROUP_CONCAT(wd.domain) as domains,
        GROUP_CONCAT(wt.tag) as tags
      FROM words w
      LEFT JOIN word_linguistic wl ON w.id = wl.word_id
      LEFT JOIN word_frequency wf ON w.id = wf.word_id
      LEFT JOIN word_glosses wg ON w.id = wg.word_id
      LEFT JOIN word_examples we ON w.id = we.word_id
      LEFT JOIN word_domains wd ON w.id = wd.word_id
      LEFT JOIN word_tags wt ON w.id = wt.word_id
      WHERE w.language = ?
      GROUP BY w.id
      ORDER BY COALESCE(wf.rank, 9999), w.word
    `);

    const rows = stmt.all(lang);

    // Format results to match JSON structure
    const words = rows.map(row => {
      // Parse conjugations if they exist
      let conjugations = null;
      if (row.conjugations) {
        try {
          conjugations = JSON.parse(row.conjugations);
        } catch (e) {
          conjugations = null;
        }
      }

      const word = {
        word: row.word,
        display: row.display || '',
        pos: row.pos || null,
        difficulty: row.difficulty || null,
        notes: row.notes || '',
        glosses: row.glosses ? row.glosses.split(',').filter(g => g) : [],
        examples: row.examples ? row.examples.split(',').filter(e => e) : [],
        linguistic: {
          infinitive: row.infinitive || null,
          reflexive: row.reflexive ? true : false,
          gender: row.gender || null,
          plural: row.plural || null,
          register: row.register || null,
          ipa: row.ipa || null,
          syllables: row.syllables ? row.syllables.split('-') : null,
          conjugations: conjugations
        },
        frequency: {
          band: row.band || null,
          rank: row.rank || null,
          corpus_frequency: row.corpus_frequency || null
        },
        domains: row.domains ? row.domains.split(',').filter(d => d) : [],
        tags: row.tags ? row.tags.split(',').filter(t => t) : []
      };

      return word;
    });

    // Cache the result
    const vocabData = {
      words,
      loadedAt: Date.now(),
      language: lang,
      source: 'sqlite',
      wordCount: words.length
    };

    vocabCache.set(lang, vocabData);

    return {
      ...vocabData,
      cacheAge: 0
    };

  } catch (error) {
    console.error(`Error loading vocabulary for ${lang}:`, error.message);
    console.error('Stack:', error.stack);

    if (error.code === 'SQLITE_CANTOPEN' || error.message.includes('no such file')) {
      const err = new Error(`Vocabulary database not found. Run setup first.`);
      err.statusCode = 500;
      throw err;
    }

    // Re-throw with status code if not already set
    if (!error.statusCode) {
      error.statusCode = 500;
    }
    throw error;
  }
}

/**
 * Clear cache for a language
 * @param {string} language - Language to clear cache for (or 'all')
 */
export function clearCache(language = null) {
  if (language === null || language === 'all') {
    vocabCache.clear();
  } else {
    vocabCache.delete(language.toLowerCase());
  }
}

/**
 * Get database info
 * @returns {Object} Database statistics
 */
export function getDbInfo() {
  if (!db) {
    return { status: 'disconnected' };
  }

  const info = {
    status: 'connected',
    source: 'sqlite',
    cachedLanguages: vocabCache.size,
    languages: []
  };

  vocabCache.forEach((data, lang) => {
    info.languages.push({
      language: lang,
      wordCount: data.wordCount,
      cachedAt: new Date(data.loadedAt).toISOString(),
      age: Date.now() - data.loadedAt
    });
  });

  return info;
}

/**
 * Pre-load all vocabulary files from database
 * @returns {Promise<Array>}
 */
export async function preloadAll() {
  console.log('Pre-loading vocabularies from SQLite...');
  const results = [];

  for (const lang of SUPPORTED_LANGUAGES) {
    try {
      await loadVocabFile(lang);
      results.push({ language: lang, status: 'loaded' });
      console.log(`  ✓ ${lang}`);
    } catch (error) {
      results.push({ language: lang, status: 'failed', error: error.message });
      console.log(`  ✗ ${lang}: ${error.message}`);
    }
  }

  return results;
}

/**
 * Close database connection
 */
export function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}

export default {
  loadVocabFile,
  clearCache,
  getDbInfo,
  preloadAll,
  closeDatabase
};
