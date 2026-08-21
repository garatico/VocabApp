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
import { dataDir } from './paths.js';
import {
  checkDatabase, BAND_CUTOFFS as REQUIRED_BANDS, REBUILD_INSTRUCTION,
  MINIMUM_SCHEMA_VERSION, type DatabaseReport,
} from './data-requirements.js';
import { getSvgUrl } from './svg-loader.js';
import { conjugate, type VerbForms } from './verb-rules.js';
import { logger } from './logger.js';

// ── Types ──────────────────────────────────────────────────────────────────────

/** Raw row returned by the main SELECT query in loadVocabFile. */
interface DbRow {
  id:                    number;
  word:                  string;
  translation:           string | null;
  pos:                   string | null;
  difficulty:            string | null;
  notes:                 string | null;
  infinitive:            string | null;
  reflexive:             number;
  gender:                string | null;
  plural:                string | null;
  register:              string | null;
  ipa:                   string | null;
  syllables:             string | null;
  conjugations:          string | null;
  conjugation_class:     string | null;
  future_stem:           string | null;
  conjugation_overrides: string | null;
  emoji:                 string | null;
  rank:                  number | null;
  corpus_frequency:      number | null;
  glosses:               string | null;
  examples:              string | null;
  domains:               string | null;
  tags:                  string | null;
}

/** Public word object served via the API. */
export interface Word {
  word:        string;
  translation: string;
  pos:         string | null;
  difficulty:  string | null;
  notes:       string;
  glosses:     string[];
  examples:    string[];
  svg_url:     string | null;
  emoji:       string | null;
  linguistic: {
    infinitive:        string | null;
    reflexive:         boolean;
    gender:            string | null;
    plural:            string | null;
    register:          string | null;
    ipa:               string | null;
    syllables:         string[] | null;
    conjugations:      VerbForms | null;
    conjugation_class: string | null;
  };
  rank:      number | null;
  frequency: {
    band:             string | null;
    rank:             number | null;
    corpus_frequency: number | null;
  };
  domains: string[];
  tags:    string[];
}

/** In-memory cache entry for a loaded language. */
interface VocabData {
  words:     Word[];
  loadedAt:  number;
  language:  string;
  source:    string;
  wordCount: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * CEFR band cutoffs: [band, maxRankInclusive].
 *
 * Defined in data-requirements.ts, and display-only: the database has no band
 * column, so `bandFromRank` below is the only thing that decides what a rank
 * is called. It used to be a shared fact with the pipeline, maintained by hand
 * on both sides of a project boundary, and the two disagreed for a long time.
 *
 * Re-exported so admin routes can derive SQL BETWEEN ranges from the same data.
 */
export const BAND_CUTOFFS = REQUIRED_BANDS;

export function bandFromRank(rank: number | null): string | null {
  if (rank == null) return null;
  for (const [band, max] of BAND_CUTOFFS) {
    if (rank <= max) return band;
  }
  return 'C2';
}


// Singleton DB connection
let db: Database.Database | null = null;

// Per-language in-memory cache
const vocabCache = new Map<string, VocabData>();

// Running count of JSON parse failures since process start
let parseErrorCount = 0;

/**
 * Parse a JSON column value, logging a warning on failure.
 */
function parseJsonField<T>(
  raw:      string | null,
  word:     string,
  field:    string,
  fallback: T | null = null,
): T | null {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    logger.warn(
      `vocab-loader: JSON parse error on '${word}' field '${field}': ${(err as Error).message}` +
      ` — raw: ${String(raw).slice(0, 120)}`
    );
    parseErrorCount++;
    return fallback;
  }
}

// ── DB init ────────────────────────────────────────────────────────────────────

/** What the last startup check found. Surfaced by getDbInfo for the admin UI. */
let dataReport: DatabaseReport | null = null;

/**
 * Check the database we were just handed against what this app needs.
 *
 * A SQLite file is not self-describing in any way that matters here. One built
 * by the current pipeline and one built by a version whose conjugation parser
 * stored 'wurde ich ward' as a verb form are both valid SQLite with plausible
 * rows in every column, and until the pipeline started stamping them there was
 * no way to tell them apart — which is the same bug, one layer out, as a
 * cached parse verdict that outlived its parser.
 *
 * Structural damage throws. Everything else is logged and the server carries
 * on: an old database is usually fine, and a server that refuses to start
 * because its data is a version behind is worse than the problem it reports.
 */
function verifyDatabase(conn: Database.Database, dbPath: string): void {
  const report = checkDatabase(conn);
  dataReport = report;

  for (const warning of report.warnings) {
    logger.warn(`vocabulary.db: ${warning} — to fix, ${REBUILD_INSTRUCTION}`);
  }

  if (report.fatal.length) {
    const err = Object.assign(new Error(
      `vocabulary.db at ${dbPath} cannot serve this app: ${report.fatal.join('; ')}. ` +
      `This app does not build its data — ${REBUILD_INSTRUCTION}.`
    ), { statusCode: 500, expectedPath: dbPath, database: report });
    logger.error(err.message);
    // Thrown rather than tolerated: every query below names these columns, so
    // the alternative is the same failure on the first request instead of at
    // boot, with no instruction attached and a user watching.
    db = null;
    throw err;
  }

  const built = report.builtAt ? `, built ${report.builtAt}` : '';
  logger.info(
    `vocabulary.db: schema v${report.schemaVersion ?? 'unstamped'}, ` +
    `pipeline v${report.pipelineVersion ?? 'unstamped'}${built}`
  );
}


function initializeDatabase(): void {
  if (db) return;

  const dbPath = path.join(dataDir, 'vocabulary.db');
  try {
    logger.info(`Connecting to SQLite database: ${dbPath}`);
    db = new Database(dbPath, { fileMustExist: true });
    db.pragma('journal_mode = WAL');
    logger.info('Connected to SQLite database');
    verifyDatabase(db, dbPath);
  } catch (error) {
    logger.error('Database connection error:', error);
    if ((error as NodeJS.ErrnoException).code === 'SQLITE_CANTOPEN') {
      // This app does not build its own database, so "not found" is nearly
      // always DATA_DIR pointing somewhere the data is not — which is easy to
      // do now that the pipeline that writes it is a separate project. Say
      // where it looked and what would change it, rather than only what failed.
      const err = Object.assign(new Error(
        `SQLite database not found at: ${dbPath}\n` +
        `This app is given its database rather than building one. ` +
        `Set DATA_DIR to the directory holding vocabulary.db, or ${REBUILD_INSTRUCTION}.`
      ), { statusCode: 500, expectedPath: dbPath });
      throw err;
    }
    throw error;
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

/** Query the DB for languages that actually have data. */
export function getSupportedLanguages(): string[] {
  if (!db) initializeDatabase();
  return (db as Database.Database)
    .prepare('SELECT DISTINCT language FROM words ORDER BY language')
    .all()
    .map((r: unknown) => (r as { language: string }).language);
}

/**
 * Load vocabulary for a language from SQLite.
 */
export function loadVocabFile(language: string): VocabData & { cacheAge: number } {
  const lang = language.toLowerCase();

  if (vocabCache.has(lang)) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const cached = vocabCache.get(lang)!; // safe: has() checked above
    return { ...cached, cacheAge: Date.now() - cached.loadedAt };
  }

  const supported = getSupportedLanguages();
  if (!supported.includes(lang)) {
    const error = Object.assign(new Error(`Language not found: ${language}`), {
      statusCode: 404,
      availableLanguages: supported,
    });
    throw error;
  }

  try {
    if (!db) initializeDatabase();
    const conn = db as Database.Database;

    logger.info(`Loading vocabulary for: ${lang}`);

    const stmt = conn.prepare(`
      SELECT
        w.id, w.word, w.translation, w.pos, w.difficulty, w.notes,
        w.infinitive, w.reflexive, w.gender, w.plural, w.register,
        w.ipa, w.syllables,
        w.conjugations,
        w.conjugation_class, w.future_stem, w.conjugation_overrides,
        w.emoji, w.rank, w.corpus_frequency,
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

    const rows  = stmt.all(lang) as DbRow[];
    const words = rows.map((row): Word => {
      // Conjugations: compute at load time from verb-rules.js for rule-based verbs
      // (regular-*, ortho-*, stem-*). For irregular-* verbs the full forms live in
      // conjugation_overrides. Other languages (French, Italian, Portuguese) that
      // predate the rule engine have conjugations stored as JSON in the DB.
      let conjugations: VerbForms | null = null;
      if (row.conjugation_class) {
        // Spanish: compute from rules + overrides at load time
        const overrides = row.conjugation_overrides
          ? (parseJsonField<Record<string, unknown>>(row.conjugation_overrides, row.word, 'conjugation_overrides', {}) ?? {})
          : {};
        try {
          const inf = row.infinitive || row.word;
          conjugations = conjugate(inf, row.conjugation_class, overrides, row.future_stem ?? null);
        } catch (e) {
          logger.warn(`verb-rules: failed for '${row.word}' (${row.conjugation_class}): ${(e as Error).message}`);
        }
      } else if (row.conjugations) {
        // Legacy (French/Italian/Portuguese): read pre-stored JSON from DB
        conjugations = parseJsonField<VerbForms>(row.conjugations, row.word, 'conjugations');
      }

      return {
        word:        row.word,
        translation: row.translation  || '',
        pos:         row.pos          || null,
        difficulty:  row.difficulty   || null,
        notes:       row.notes        || '',
        glosses:   row.glosses  ? (parseJsonField<string[]>(row.glosses,  row.word, 'glosses',  []) ?? []).filter(Boolean) : [],
        examples:  row.examples ? (parseJsonField<string[]>(row.examples, row.word, 'examples', []) ?? []).filter(Boolean) : [],
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
        rank:      row.rank ?? null,
        frequency: {
          band:             bandFromRank(row.rank),
          rank:             row.rank             ?? null,
          corpus_frequency: row.corpus_frequency ?? null,
        },
        domains: row.domains ? (parseJsonField<string[]>(row.domains, row.word, 'domains', []) ?? []) : [],
        tags:    row.tags    ? (parseJsonField<string[]>(row.tags,    row.word, 'tags',    []) ?? []).filter(Boolean) : [],
      };
    });

    const vocabData: VocabData = {
      words,
      loadedAt:  Date.now(),
      language:  lang,
      source:    'sqlite',
      wordCount: words.length,
    };

    vocabCache.set(lang, vocabData);
    return { ...vocabData, cacheAge: 0 };

  } catch (error) {
    logger.error(`Error loading vocabulary for ${lang}:`, (error as Error).message);
    if ((error as NodeJS.ErrnoException).code === 'SQLITE_CANTOPEN' ||
        (error as Error).message?.includes('no such file')) {
      throw Object.assign(new Error(
        `Vocabulary database not found. Set DATA_DIR, or ${REBUILD_INSTRUCTION}.`
      ), { statusCode: 500 });
    }
    if (!(error as { statusCode?: number }).statusCode) {
      (error as { statusCode: number }).statusCode = 500;
    }
    throw error;
  }
}

/** Clear the in-memory vocabulary cache for one language, or all if lang is null/'all'. */
export function clearCache(language: string | null = null): void {
  if (!language || language === 'all') {
    vocabCache.clear();
  } else {
    vocabCache.delete(language.toLowerCase());
  }
}

/** Close and null the DB connection so the next request reopens the file from disk. */
export function reloadDb(): void {
  vocabCache.clear();
  dataReport = null;
  if (db) { try { db.close(); } catch (_) {} db = null; }
}

/** Return connection status and per-language cache info. */
export function getDbInfo(): Record<string, unknown> {
  if (!db) return { status: 'disconnected' };

  const info: {
    status: string;
    source: string;
    cachedLanguages: number;
    parseErrors: number;
    languages: { language: string; wordCount: number; cachedAt: string; ageMs: number }[];
  } = {
    status: 'connected',
    source: 'sqlite',
    cachedLanguages: vocabCache.size,
    parseErrors: parseErrorCount,
    languages: [],
  };

  // The admin DB panel is where someone looks when the data seems wrong, so
  // "which pipeline built this" belongs on it.
  if (dataReport) {
    (info as Record<string, unknown>)['data'] = {
      schemaVersion:   dataReport.schemaVersion,
      pipelineVersion: dataReport.pipelineVersion,
      builtAt:         dataReport.builtAt,
      minimumSchema:   MINIMUM_SCHEMA_VERSION,
      warnings:        dataReport.warnings,
    };
  }

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
export async function preloadAll(): Promise<{ language: string; status: string; error?: string }[]> {
  logger.info('Pre-loading vocabularies from SQLite...');
  const results: { language: string; status: string; error?: string }[] = [];

  for (const lang of getSupportedLanguages()) {
    try {
      loadVocabFile(lang);
      results.push({ language: lang, status: 'loaded' });
      logger.info(`  ok ${lang}`);
    } catch (error) {
      results.push({ language: lang, status: 'failed', error: (error as Error).message });
      logger.info(`  fail ${lang}: ${(error as Error).message}`);
    }
  }

  return results;
}

export function getDb(): Database.Database {
  if (!db) initializeDatabase();
  return db as Database.Database;
}

export function setDb(testDb: Database.Database): void {
  db = testDb;
  vocabCache.clear();
}

export function closeDatabase(): void {
  if (db) { db.close(); db = null; }
}

export default { loadVocabFile, getSupportedLanguages, clearCache, reloadDb, getDbInfo, getDb, setDb, preloadAll, closeDatabase };
