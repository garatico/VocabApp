/**
 * bootstrap.ts — wires up the Tauri desktop app's local SQLite access:
 * provisions the db, builds the adapter/column-flags/shape-deps every reader
 * needs, and registers the main app's vocab source. Called once per page
 * (app.ts for the main quiz app, admin.ts for the admin panel — separate
 * HTML documents, separate JS module instances, so each needs its own call;
 * a second call from the same page is cheap and safe, just redundant).
 *
 * Only ever imported via dynamic import() behind isPackagedApp(), so the
 * plain web bundle never pulls in @tauri-apps/plugin-sql.
 */
import Database from '@tauri-apps/plugin-sql';
import type { StorageAdapter } from '../../shared/storage/types.js';
import type { WordSelectColumnFlags } from '../../shared/vocab/word-select.js';
import type { ShapeWordDeps } from '../../shared/vocab/shape-word.js';
import { ensureLocalDb } from './db-provision.js';
import { createTauriSqlAdapter } from './sql-adapter.js';
import { detectWordColumnFlags } from '../../shared/vocab/column-flags.js';
import { getSupportedLanguages, loadAllWordsForLanguage, getWordPage } from '../../shared/vocab/queries.js';
import { initTauriAssetResolver } from './asset-resolver.js';
import { registerSqliteVocabSource } from '../data/vocab-source.js';
import type { Word as ClientWord } from '../types.js';
import { logger } from '../utils/logger.js';

let adapter:     StorageAdapter | null = null;
let columnFlags: WordSelectColumnFlags | null = null;
let shapeDeps:   ShapeWordDeps | null = null;

export async function initTauriVocabSource(): Promise<void> {
  const dbPath = await ensureLocalDb();
  const db = await Database.load(`sqlite:${dbPath}`);
  adapter = createTauriSqlAdapter(db, dbPath);

  const [flags, assets] = await Promise.all([
    detectWordColumnFlags(adapter),
    initTauriAssetResolver(),
  ]);
  columnFlags = flags;
  shapeDeps = {
    assets,
    reportIssue: (kind, message) => logger.warn(`[sqlite] ${kind}: ${message}`),
  };

  registerSqliteVocabSource({
    loadVocab: async (lang) => {
      const words = await loadAllWordsForLanguage(getTauriStorageAdapter(), lang, getTauriColumnFlags(), getTauriShapeDeps());
      // src/shared/types.ts's Word (what the server has always actually sent)
      // vs src/client/types.ts's Word (a client-only superset) disagree on
      // one field's declared type: difficulty is `string | null` server-side
      // (the DB column is TEXT) but `number | null` client-side — an
      // already-documented pre-existing inaccuracy in the client type, not a
      // real behavioral difference (see my-content-mode.ts's own comment on
      // "the wider number|null lie in the Word type"). Every value crossing
      // this boundary is exactly what /api/vocab/:lang already sends today;
      // fetch-based loading never caught this because JSON.parse results are
      // asserted to Word, not structurally checked, the same way this is.
      return { count: words.length, data: words as unknown as ClientWord[] };
    },
    loadLanguages: () => getSupportedLanguages(getTauriStorageAdapter()),

    loadVocabPage: async (lang, params) => {
      const result = await getWordPage(
        getTauriStorageAdapter(),
        { language: lang, ...params },
        getTauriColumnFlags(),
        getTauriShapeDeps(),
      );
      // Same pre-existing client/shared Word.difficulty type mismatch as
      // loadVocab above — see its comment for the full explanation.
      return { ...result, words: result.words as unknown as ClientWord[] };
    },
  });
}

export function isTauriSqlReady(): boolean {
  return adapter !== null;
}

export function getTauriStorageAdapter(): StorageAdapter {
  if (!adapter) throw new Error('initTauriVocabSource() has not completed yet');
  return adapter;
}

export function getTauriColumnFlags(): WordSelectColumnFlags {
  if (!columnFlags) throw new Error('initTauriVocabSource() has not completed yet');
  return columnFlags;
}

export function getTauriShapeDeps(): ShapeWordDeps {
  if (!shapeDeps) throw new Error('initTauriVocabSource() has not completed yet');
  return shapeDeps;
}
