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
import { getSvgUrl } from './svg-loader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const appRoot    = path.join(__dirname, '../../../..');   // => VocabApp/

// Singleton DB connection
let db = null;

// Per-language in-memory cache
const vocabCache = new Map();

const SUPPORTED_LANGUAGES = ['spanish', 'portuguese', 'italian', 'french'];

// DB init
function initializeDatabase() {
  if (db) return;

  const dbPath = path.join(appRoot, 'data', 'vocabulary.db');
  try {
    console.log(`Connecting to SQLite database: ${dbPath}`);
    db = new Database(dbPath, { fileMustExist: true });
    db.pragma('journal_mode = WAL');
    console.log('Connected to SQLite database');

    // Auto-migrate: add columns that may not exist yet
    const cols = db.pragma('table_info(words)').map(c => c.name);
    if (!cols.includes('emoji')) {
      db.exec('ALTER TABLE words ADD COLUMN emoji TEXT');
      console.log('  ✓ auto-migrated: added emoji column');
    }
    if (!cols.includes('conjugations')) {
      db.exec('ALTER TABLE words ADD COLUMN conjugations TEXT');
      console.log('  ✓ auto-migrated: added conjugations column');
    }
    if (!cols.includes('updated_at')) {
      db.exec('ALTER TABLE words ADD COLUMN updated_at TEXT');
      console.log('  ✓ auto-migrated: added updated_at column');
    }
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
 * Load vocabulary for a language from SQLite.
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
        w.emoji,
        w.band,
        w.rank,
        w.corpus_frequency,
        (SELECT json_group_array(gloss)
           FROM (SELECT gloss FROM word_glosses  WHERE word_id = w.id ORDER BY position)
        ) AS glosses,
        (SELECT json_group_array(example)
           FROM (SELECT example FROM word_examples WHERE word_id = w.id ORDER BY rowid)
        ) AS examples,
        w.domains,
        (SELECT json_group_array(tag)
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
        glosses:   row.glosses  ? (() => { try { return JSON.parse(row.glosses).filter(Boolean);  } catch (_) { return []; } })() : [],
        examples:  row.examples ? (() => { try { return JSON.parse(row.examples).filter(Boolean); } catch (_) { return []; } })() : [],
        svg_url:   getSvgUrl(lang, row.word),
        emoji:     row.emoji || null,
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
        domains: row.domains ? (() => { try { return JSON.parse(row.domains); } catch (_) { return []; } })() : [],
        tags:    row.tags    ? (() => { try { return JSON.parse(row.tags).filter(Boolean);    } catch (_) { return []; } })() : [],
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

/** Clear cache for one language, or all languages if lang is null/'all'. */
export function clearCache(language = null) {
  if (!language || language === 'all') {
    vocabCache.clear();
  } else {
    vocabCache.delete(language.toLowerCase());
  }
}

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

/** Load all supported languages into cache at startup. */
export async function preloadAll() {
  console.log('Pre-loading vocabularies from SQLite...');
  const results = [];

  for (const lang of SUPPORTED_LANGUAGES) {
    try {
      await loadVocabFile(lang);
      results.push({ language: lang, status: 'loaded' });
      console.log(`  ok ${lang}`);
    } catch (error) {
      results.push({ language: lang, status: 'failed', error: error.message });
      console.log(`  fail ${lang}: ${error.message}`);
    }
  }

  return results;
}

/**
 * Returns the initialized DB connection, initializing it if needed.
 * Intended for use by admin routes that need direct DB access.
 */
export function getDb() {
  if (!db) initializeDatabase();
  return db;
}

/**
 * Inject an already-open DB instance (used by tests to supply an in-memory DB).
 * Clears the vocab cache so subsequent loadVocabFile() calls read from the
 * injected DB rather than returning stale cache entries.
 */
export function setDb(testDb) {
  db = testDb;
  vocabCache.clear();
}

export function closeDatabase() {
  if (db) { db.close(); db = null; }
}

export default { loadVocabFile, clearCache, getDbInfo, getDb, setDb, preloadAll, closeDatabase };
