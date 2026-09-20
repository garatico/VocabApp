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
import fs       from 'fs';
import { dataDir } from './paths.js';
import {
  checkDatabase, REBUILD_INSTRUCTION,
  MINIMUM_SCHEMA_VERSION, type DatabaseReport,
} from './data-requirements.js';
import { getSvgUrl } from './svg-loader.js';
import { getAudioUrl } from './audio-loader.js';
import { logger } from './logger.js';
import { BAND_CUTOFFS as SHARED_BAND_CUTOFFS, bandFromRank as sharedBandFromRank } from '../../shared/band.js';
import { buildWordSelectSql, type WordSelectRow } from '../../shared/vocab/word-select.js';
import { shapeWordRow, type ShapeWordDeps } from '../../shared/vocab/shape-word.js';
import type { AssetResolver } from '../../shared/assets/types.js';
import type { Word } from '../../shared/types.js';

export type { Word } from '../../shared/types.js';

// ── Types ──────────────────────────────────────────────────────────────────────

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
 * CEFR band cutoffs and bandFromRank now live in src/shared/band.ts, so the
 * Tauri client computes the same bands as this server does. Re-exported here
 * so admin/words.ts and admin/export.ts's existing imports from this module
 * keep working unchanged.
 */
export const BAND_CUTOFFS = SHARED_BAND_CUTOFFS;
export const bandFromRank = sharedBandFromRank;


// Singleton DB connection
let db: Database.Database | null = null;

// mtime of vocabulary.db as of the last (re)open, so an external edit — a
// pipeline sync, a one-off cleanup script, restoring a backup, anything that
// isn't this app's own admin routes — is noticed on the next request instead
// of silently serving whatever was cached at connect time. Belt-and-braces:
// admin routes still clear the cache explicitly, this just covers the writes
// that didn't come through them.
let dbFileMtimeMs: number | null = null;

/**
 * The newest mtime across vocabulary.db and its WAL sidecar. In WAL mode (set
 * below) a committed write lands in `<db>-wal` and isn't folded back into the
 * main file until a checkpoint runs, which a long-lived reader connection —
 * this app's own — can hold off indefinitely. Watching only the main file's
 * mtime missed exactly that case: an external script's write would sit in
 * the WAL, the main file's mtime would never move, and the change would go
 * unnoticed until something else happened to trigger a checkpoint.
 */
function newestDbMtimeMs(dbPath: string): number | null {
  let newest: number | null = null;
  for (const p of [dbPath, `${dbPath}-wal`]) {
    try {
      const mtimeMs = fs.statSync(p).mtimeMs;
      if (newest === null || mtimeMs > newest) newest = mtimeMs;
    } catch {
      // missing is normal for -wal when nothing's been written since the
      // last checkpoint, or briefly during an external file replace
    }
  }
  return newest;
}

/**
 * If vocabulary.db (or its WAL) has moved since we last opened it, someone
 * wrote to it outside this process. A plain SELECT on the existing connection
 * would already see the new rows — SQLite doesn't need a reopen for that — so
 * this exists only to invalidate `vocabCache`, the layer that actually goes
 * stale. Goes through the same close+reopen as /db/reload rather than just
 * clearing the cache, in case the external write also changed the schema
 * (e.g. a pipeline sync bumping schema_version), and because closing our own
 * connection is what lets SQLite checkpoint the WAL an external write left
 * behind — cheap either way, this runs once per request at most.
 */
function checkForExternalDbChange(dbPath: string): void {
  if (dbFileMtimeMs === null) return; // not connected yet — initializeDatabase will set it
  const mtimeMs = newestDbMtimeMs(dbPath);
  if (mtimeMs === null || mtimeMs === dbFileMtimeMs) return;
  logger.info(`vocabulary.db changed on disk (external edit) — reloading (was ${dbFileMtimeMs}, now ${mtimeMs})`);
  reloadDb();
}

// Whether the connected database has a `disambiguator` column on `words` yet
// — see the Word.disambiguator field comment above. Recomputed whenever the
// connection changes (initializeDatabase, setDb, reloadDb) rather than once
// at import time, since a test or an admin DB reload can swap the database
// out from under a running process.
let hasDisambiguatorCol = false;

function checkDisambiguatorColumn(conn: Database.Database): void {
  const cols = conn.prepare("PRAGMA table_info('words')").all() as { name: string }[];
  hasDisambiguatorCol = cols.some(c => c.name === 'disambiguator');
}

/** Whether admin routes can read/write the `disambiguator` column on this
 *  database — false on a database built before the feature existed. */
export function supportsDisambiguator(): boolean {
  return hasDisambiguatorCol;
}

/**
 * The three optional-column flags, bundled in the shape buildWordSelectSql/
 * shapeWordRow expect — for any other reader (admin/words.ts, public.ts)
 * that wants the shared query/shaping functions instead of a second
 * hand-rolled query. Synchronous and already-cached, unlike
 * detectWordColumnFlags (src/shared/vocab/column-flags.ts), which exists for
 * readers that only have an async StorageAdapter, not this live connection.
 */
export function getWordColumnFlags(): { hasDisambiguator: boolean; hasIsFunctionWord: boolean; hasGrammaticalNumber: boolean } {
  return {
    hasDisambiguator:     hasDisambiguatorCol,
    hasIsFunctionWord:    hasIsFunctionWordCol,
    hasGrammaticalNumber: hasGrammaticalNumberCol,
  };
}

// Same pattern as hasDisambiguatorCol just above, for the same reason: a
// database built before schemaVersion 5 doesn't have this column, and that
// is still a completely valid database — every word on it just isn't a
// function word as far as this app can tell, which is also the correct
// answer for every language but Japanese even on a migrated database.
let hasIsFunctionWordCol = false;

function checkIsFunctionWordColumn(conn: Database.Database): void {
  const cols = conn.prepare("PRAGMA table_info('words')").all() as { name: string }[];
  hasIsFunctionWordCol = cols.some(c => c.name === 'is_function_word');
}

// Same pattern again, for schemaVersion 8's `grammatical_number`: a database
// built before it exists is still valid, every word on it just has no
// grammar hint to show — the correct answer for every word anyway, since the
// column is only ever set on a handful of curated article rows even on a
// current database.
let hasGrammaticalNumberCol = false;

function checkGrammaticalNumberColumn(conn: Database.Database): void {
  const cols = conn.prepare("PRAGMA table_info('words')").all() as { name: string }[];
  hasGrammaticalNumberCol = cols.some(c => c.name === 'grammatical_number');
}

// Per-language in-memory cache
const vocabCache = new Map<string, VocabData>();

// Running count of JSON parse failures since process start — incremented via
// shapeDeps.reportIssue below, since the parsing itself now happens in
// src/shared/vocab/shape-word.ts.
let parseErrorCount = 0;

/** svg_url/audio_url lookups, unchanged — just handed to shape-word.ts as an
 *  AssetResolver instead of being called inline in the row-mapping loop. */
const assetResolver: AssetResolver = { svgUrl: getSvgUrl, audioUrl: getAudioUrl };

/** Wires shape-word.ts's issue reporting back to this module's logger/counter,
 *  exactly matching what loadVocabFile used to do inline: a parse error logs
 *  and counts, a conjugation error only logs. Exported so any other reader
 *  using the shared shape-word.ts (admin/words.ts, public.ts) reports through
 *  the same counter getDbInfo() surfaces, rather than starting a second one
 *  nobody ever reads. */
export const shapeDeps: ShapeWordDeps = {
  assets: assetResolver,
  reportIssue(kind, message) {
    logger.warn(message);
    if (kind === 'parse-error') parseErrorCount++;
  },
};

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
    checkDisambiguatorColumn(db);
    checkIsFunctionWordColumn(db);
    checkGrammaticalNumberColumn(db);
    dbFileMtimeMs = newestDbMtimeMs(dbPath);
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

// checkForExternalDbChange does two fs.statSync calls (main file + -wal
// sidecar) — cheap individually, but ensureDb() runs at the top of every
// public API call including loadVocabFile's cache-hit path, so without a
// cooldown a busy /api/vocab endpoint paid that I/O on every single request
// instead of just the cache misses. An external edit is now noticed within
// this cooldown window rather than instantly, which is a fine trade: the
// admin routes that make such edits already clear the cache explicitly, so
// this path exists only to catch a write that came from *outside* this app.
let lastExternalCheckAt = 0;
const EXTERNAL_CHECK_COOLDOWN_MS = 2000;

/** Open the connection if needed, or reload it if vocabulary.db changed under us. */
function ensureDb(): Database.Database {
  if (db) {
    const now = Date.now();
    if (now - lastExternalCheckAt > EXTERNAL_CHECK_COOLDOWN_MS) {
      lastExternalCheckAt = now;
      checkForExternalDbChange(path.join(dataDir, 'vocabulary.db'));
    }
  }
  if (!db) initializeDatabase();
  return db as Database.Database;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/** Query the DB for languages that actually have data. */
export function getSupportedLanguages(): string[] {
  return ensureDb()
    .prepare('SELECT DISTINCT language FROM words ORDER BY language')
    .all()
    .map((r: unknown) => (r as { language: string }).language);
}

/**
 * Load vocabulary for a language from SQLite.
 */
export function loadVocabFile(language: string): VocabData & { cacheAge: number } {
  ensureDb();

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
    const conn = ensureDb();

    logger.info(`Loading vocabulary for: ${lang}`);

    const sql = `${buildWordSelectSql({
      hasDisambiguator:     hasDisambiguatorCol,
      hasIsFunctionWord:    hasIsFunctionWordCol,
      hasGrammaticalNumber: hasGrammaticalNumberCol,
    })}
      WHERE w.language = ?
      ORDER BY COALESCE(w.rank, 9999), w.word
    `;

    const rows  = conn.prepare(sql).all(lang) as WordSelectRow[];
    const words = rows.map((row): Word => shapeWordRow(row, lang, shapeDeps));

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
  dbFileMtimeMs = null;
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
  return ensureDb();
}

export function setDb(testDb: Database.Database): void {
  db = testDb;
  vocabCache.clear();
  checkDisambiguatorColumn(testDb);
  checkIsFunctionWordColumn(testDb);
  checkGrammaticalNumberColumn(testDb);
}

export function closeDatabase(): void {
  if (db) { db.close(); db = null; }
}

export default { loadVocabFile, getSupportedLanguages, clearCache, reloadDb, getDbInfo, getDb, setDb, preloadAll, closeDatabase };
