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
import { conjugate } from './verb-rules.js';
import { SUPPORTED_LANGUAGES } from '../routes/admin/_utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const appRoot    = path.join(__dirname, '../../../..');   // => VocabApp/

// Singleton DB connection
let db = null;

// Per-language in-memory cache
const vocabCache = new Map();


// Running count of JSON parse failures since process start — surfaced in getDbInfo()
let parseErrorCount = 0;

/**
 * Parse a JSON column value, logging a warning on failure instead of swallowing it.
 * @param {string|null} raw   - raw DB value
 * @param {string}      word  - word being loaded (for log context)
 * @param {string}      field - column name (for log context)
 * @param {*}           fallback - value to return on failure (default: null)
 */
function parseJsonField(raw, word, field, fallback = null) {
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.warn(
      `vocab-loader: JSON parse error on '${word}' field '${field}': ${err.message}` +
      ` — raw: ${String(raw).slice(0, 120)}`
    );
    parseErrorCount++;
    return fallback;
  }
}


// DB init
function initializeDatabase() {
  if (db) return;

  const dbPath = path.join(appRoot, 'data', 'vocabulary.db');
  try {
    console.log(`Connecting to SQLite database: ${dbPath}`);
    db = new Database(dbPath, { fileMustExist: true });
    db.pragma('journal_mode = WAL');
    console.log('Connected to SQLite database');

    // All schema columns are established by sync_db.py; no runtime migration needed.
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
    return { ...cached, cacheAge: Date.now() - cached.loadedAt, source: 'sqlite' };  // cacheAge in ms
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
        w.translation,
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
        w.conjugation_class,
        w.future_stem,
        w.conjugation_overrides,
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
      // Resolve conjugations: prefer rule-based generation, fall back to stored JSON
      let conjugations = null;
      if (row.conjugation_class) {
        try {
          const overrides = row.conjugation_overrides
            ? parseJsonField(row.conjugation_overrides, row.word, 'conjugation_overrides', {})
            : {};
          conjugations = conjugate(
            row.infinitive || row.word,
            row.conjugation_class,
            overrides,
            row.future_stem || null
          );
        } catch (err) {
          console.warn(`verb-rules: failed to conjugate '${row.word}' [${row.conjugation_class}]: ${err.message}`);
          if (row.conjugations) {
            conjugations = parseJsonField(row.conjugations, row.word, 'conjugations');
          }
        }
      } else if (row.conjugations) {
        conjugations = parseJsonField(row.conjugations, row.word, 'conjugations');
      }

      return {
        word:      row.word,
        translation:   row.translation  || '',
        pos:       row.pos      || null,
        difficulty:row.difficulty || null,
        notes:     row.notes    || '',
        glosses:   row.glosses  ? (parseJsonField(row.glosses,  row.word, 'glosses',  []) ?? []).filter(Boolean) : [],
        examples:  row.examples ? (parseJsonField(row.examples, row.word, 'examples', []) ?? []).filter(Boolean) : [],
        svg_url:   getSvgUrl(lang, row.word),
        emoji:     row.emoji || null,
        linguistic: {
          infinitive:        row.infinitive      || null,
          reflexive:         Boolean(row.reflexive),
          gender:            row.gender          || null,
          plural:            row.plural          || null,
          register:          row.register        || null,
          ipa:               row.ipa             || null,
          syllables:         row.syllables ? row.syllables.split('-') : null,
          conjugations,
          conjugation_class: row.conjugation_class || null,
        },
        frequency: {
          band:            row.band             || null,
          rank:            row.rank             || null,
          corpus_frequency:row.corpus_frequency || null,
        },
        domains: row.domains ? (parseJsonField(row.domains, row.word, 'domains', []) ?? []) : [],
        tags:    row.tags    ? (parseJsonField(row.tags,    row.word, 'tags',    []) ?? []).filter(Boolean) : [],
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

/** Clear the in-memory vocabulary cache for one language, or all if lang is null/'all'.
 *  Does NOT touch the DB connection — use reloadDb() when the DB file has been replaced. */
export function clearCache(language = null) {
  if (!language || language === 'all') {
    vocabCache.clear();
  } else {
    vocabCache.delete(language.toLowerCase());
  }
}

/** Close and null the DB connection so the next request reopens the file from disk.
 *  Call this (in addition to clearCache()) after replacing vocabulary.db on disk. */
export function reloadDb() {
  vocabCache.clear();
  if (db) { try { db.close(); } catch (_) {} db = null; }
}

/** Return connection status and per-language cache info. */
export function getDbInfo() {
  if (!db) return { status: 'disconnected' };

  const info = {
    status: 'connected',
    source: 'sqlite',
    cachedLanguages: vocabCache.size,
    parseErrors: parseErrorCount,  // non-zero means corrupt DB rows — check server logs
    languages: [],
  };

  vocabCache.forEach((data, lang) => {
    info.languages.push({
      language:  lang,
      wordCount: data.wordCount,
      cachedAt:  new Date(data.loadedAt).toISOString(),
      ageMs:     Date.now() - data.loadedAt,
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

export function getDb() {
  if (!db) initializeDatabase();
  return db;
}

export function setDb(testDb) {
  db = testDb;
  vocabCache.clear();
}

export function closeDatabase() {
  if (db) { db.close(); db = null; }
}

export default { loadVocabFile, clearCache, reloadDb, getDbInfo, getDb, setDb, preloadAll, closeDatabase };
