/**
 * Vocabulary Loader - SQLite Version
 *
 * Loads vocabulary from SQLite database with caching.
 *
 * Schema note: word_linguistic and word_frequency were merged into the words
 * table by migrate-flatten-schema.js. All word data now lives in one row.
 * Many-to-many tables (word_glosses, word_domains, word_tags, word_examples)
 * are fetched via correlated subqueries so ordering is deterministic.
 */

import Database from 'better-sqlite3';
import path     from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const appRoot    = path.join(__dirname, '../../..');   // → VocabApp/

// ── Singleton DB connection ───────────────────────────────────────────────
let db = null;

// ── Per-language in-memory cache ─────────────────────────────────────────
const vocabCache = new Map();

const SUPPORTED_LANGUAGES = ['spanish', 'portuguese', 'italian', 'french'];

// ── DB init ───────────────────────────────────────────────────────────────
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

// ── Main loader ───────────────────────────────────────────────────────────

/**
 * Load vocabulary for a language from SQLite.
 * @param {string} language  e.g. 'spanish'
 * @returns {Promise<Object>} { words, wordCount, language, source, loadedAt, cacheAge }
 */
export async function loadVocabFile(language) {
  const lang = language.toLowerCase();

  if (vocabCache.has(lang)) {
    const cached = vocabCache.get(lang);
    return { ...cached, cacheAge: Date.now() - cached.loadedAt, source: 'sqlite' };
  }

  if (!SUPPORTED_LANGUAGES.includes(lang)) {
    const error = new Error(`Language not found: ${language}`);
    error.statusCode = 404;
    error.availableLanguages = SUPPORTED_LANGUAGES;
    throw error;
  }

  try {
    if (!db) initializeDatabase();

    console.log(`Loading vocabulary for: ${lang}`);

    // All word data is flat on `words` after the schema migration.
    // Many-to-many tables use correlated subqueries with explicit ORDER BY
    // so the returned strings are deterministically ordered regardless of
    // SQLite version.
    const stmt = db.prepare(`
      SELECT
        w.id,
        w.word,
        w.display,
        w.pos,
        w.difficulty,
        w.notes,
        w.infinitive,
        w.reflexive,
        w.gender,
        w.plural,
        w.register,
        w.ipa,
        w.syllables,
        w.conjugations,
        w.band,
        w.rank,
        w.corpus_frequency,
        (SELECT GROUP_CONCAT(gloss, ',')
           FROM (SELECT gloss FROM word_glosses  WHERE word_id = w.id ORDER BY position)
        ) AS glosses,
        (SELECT GROUP_CONCAT(example, ',')
           FROM (SELECT example FROM word_examples WHERE word_id = w.id ORDER BY rowid)
        ) AS examples,
        (SELECT GROUP_CONCAT(domain, ',')
           FROM (SELECT domain FROM word_domains  WHERE word_id = w.id ORDER BY rowid)
        ) AS domains,
        (SELECT GROUP_CONCAT(tag, ',')
           FROM (SELECT tag FROM word_tags WHERE word_id = w.id ORDER BY rowid)
        ) AS tags
      FROM words w
      WHERE w.language = ?
      ORDER BY COALESCE(w.rank, 9999), w.word
    `);

    const rows  = stmt.all(lang);
    const words = rows.map(row => {
      let conjugations = null;
      if (row.conjugations) {
        try { conjugations = JSON.parse(row.conjugations); } catch (_) {}
      }

      return {
        word:      row.word,
        display:   row.display  || '',
        pos:       row.pos      || null,
        difficulty:row.difficulty || null,
        notes:     row.notes    || '',
        glosses:   row.glosses  ? row.glosses.split(',').filter(Boolean)  : [],
        examples:  row.examples ? row.examples.split(',').filter(Boolean) : [],
        linguistic: {
          infinitive:   row.infinitive || null,
          reflexive:    Boolean(row.reflexive),
          gender:       row.gender    || null,
          plural:       row.plural    || null,
          register:     row.register  || null,
          ipa:          row.ipa       || null,
          syllables:    row.syllables ? row.syllables.split('-') : null,
          conjugations,
        },
        frequency: {
          band:            row.band             || null,
          rank:            row.rank             || null,
          corpus_frequency:row.corpus_frequency || null,
        },
        domains: row.domains ? row.domains.split(',').filter(Boolean) : [],
        tags:    row.tags    ? row.tags.split(',').filter(Boolean)    : [],
      };
    });

    const vocabData = {
      words,
      loadedAt:  Date.now(),
      language:  lang,
      source:    'sqlite',
      wordCount: words.length,
    };

    vocabCache.set(lang, vocabData);
    return { ...vocabData, cacheAge: 0 };

  } catch (error) {
    console.error(`Error loading vocabulary for ${lang}:`, error.message);
    if (error.code === 'SQLITE_CANTOPEN' || error.message.includes('no such file')) {
      const err = new Error('Vocabulary database not found. Run setup first.');
      err.statusCode = 500;
      throw err;
    }
    if (!error.statusCode) error.statusCode = 500;
    throw error;
  }
}

// ── Cache management ──────────────────────────────────────────────────────

/** Clear cache for one language, or all languages if lang is null/'all'. */
export function clearCache(language = null) {
  if (!language || language === 'all') {
    vocabCache.clear();
  } else {
    vocabCache.delete(language.toLowerCase());
  }
}

// ── Status ────────────────────────────────────────────────────────────────

/** Return connection status and per-language cache info. */
export function getDbInfo() {
  if (!db) return { status: 'disconnected' };

  const info = {
    status: 'connected',
    source: 'sqlite',
    cachedLanguages: vocabCache.size,
    languages: [],
  };

  vocabCache.forEach((data, lang) => {
    info.languages.push({
      language:  lang,
      wordCount: data.wordCount,
      cachedAt:  new Date(data.loadedAt).toISOString(),
      age:       Date.now() - data.loadedAt,
    });
  });

  return info;
}

// ── Pre-load ──────────────────────────────────────────────────────────────

/** Load all supported languages into cache at startup. */
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

// ── Teardown ──────────────────────────────────────────────────────────────

export function closeDatabase() {
  if (db) { db.close(); db = null; }
}

export default { loadVocabFile, clearCache, getDbInfo, preloadAll, closeDatabase };
