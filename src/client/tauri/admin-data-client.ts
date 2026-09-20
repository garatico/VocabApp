/**
 * admin-data-client.ts (Tauri) — the AdminDataClient implementation backed
 * by the app's own local SQLite copy instead of a live Express API. Built
 * entirely on src/shared/vocab/* — the same query/write logic the server
 * uses, just driven by the Tauri sql-adapter instead of better-sqlite3.
 *
 * Reuses bootstrap.ts's adapter/column-flags/shape-deps (already set up by
 * admin.ts's call to initTauriVocabSource() before this is constructed)
 * rather than recomputing them — one PRAGMA check and one asset-manifest
 * fetch per page load, not one per consumer.
 *
 * clearCache/reloadDb are no-ops here: there's no separate in-memory vocab
 * cache on this path the way vocab-loader.ts has server-side — every read
 * queries SQLite directly, so there's nothing to invalidate or reopen.
 */
import { getTauriStorageAdapter, getTauriColumnFlags, getTauriShapeDeps } from './bootstrap.js';
import { getWordPage, getWord, getSupportedLanguages, loadAllWordsForLanguage } from '../../shared/vocab/queries.js';
import { applyWordUpdate } from '../../shared/vocab/write.js';
import { computeStats } from '../../shared/vocab/stats.js';
import { buildCsv } from '../../shared/vocab/csv.js';
import type { AdminDataClient } from '../admin/admin-data-client.js';
import { logger } from '../utils/logger.js';

export async function createTauriAdminDataClient(): Promise<AdminDataClient> {
  const adapter     = getTauriStorageAdapter();
  const columnFlags = getTauriColumnFlags();
  const shapeDeps   = getTauriShapeDeps();

  const updateDeps = {
    supportsDisambiguator: columnFlags.hasDisambiguator,
    onWarning: (msg: string) => logger.warn(`[admin/sqlite] ${msg}`),
  };

  return {
    async getMeta() {
      const [posRows, domainRows, languages] = await Promise.all([
        adapter.all<{ pos: string }>('SELECT DISTINCT pos FROM words WHERE pos IS NOT NULL ORDER BY pos'),
        adapter.all<{ domains: string }>(
          "SELECT DISTINCT domains FROM words WHERE domains IS NOT NULL AND domains != '[]' AND domains != ''"
        ),
        getSupportedLanguages(adapter),
      ]);

      const domainSet = new Set<string>();
      for (const row of domainRows) {
        try {
          (JSON.parse(row.domains) as string[]).forEach(d => domainSet.add(d));
        } catch {
          logger.warn('[admin/sqlite] malformed domains JSON:', row.domains?.slice(0, 80));
        }
      }

      return {
        pos: posRows.map(r => r.pos),
        domains: [...domainSet].sort(),
        languages,
        disambiguatorSupported: columnFlags.hasDisambiguator,
      };
    },

    async getVocabPage(params) {
      const result = await getWordPage(
        adapter,
        {
          language: params.lang,
          search:   params.search,
          pos:      params.pos,
          band:     params.band,
          domain:   params.domain,
          limit:    params.limit,
          page:     params.page,
        },
        columnFlags,
        shapeDeps,
      );
      return { words: result.words, total: result.total, page: result.page, pages: result.pages };
    },

    async updateWord(word, lang, data) {
      const row = await adapter.get<{ id: number }>(
        'SELECT id FROM words WHERE word = ? AND language = ?', [word, lang]
      );
      if (!row) throw new Error('Word not found');

      await adapter.transaction(tx => applyWordUpdate(tx, row.id, word, data, updateDeps));

      const updated = await getWord(adapter, lang, word, columnFlags, shapeDeps);
      if (!updated) throw new Error('Word not found after update');
      return { word: updated };
    },

    async batchUpdate(lang, updates) {
      let updated = 0;
      await adapter.transaction(async tx => {
        for (const { word, data } of updates) {
          if (!word || !data) continue;
          const row = await adapter.get<{ id: number }>(
            'SELECT id FROM words WHERE word = ? AND language = ?', [word, lang]
          );
          if (!row) continue;
          await applyWordUpdate(tx, row.id, word, data, updateDeps);
          updated++;
        }
      });
      return { updated };
    },

    async getStats() {
      const languages = await getSupportedLanguages(adapter);
      return computeStats(adapter, languages);
    },

    async clearCache() {
      return 'Nothing to clear — this build reads SQLite directly on every request.';
    },

    async reloadDb() {
      return 'Nothing to reload — this build reads SQLite directly on every request.';
    },

    async exportCsv(lang) {
      const words = await loadAllWordsForLanguage(adapter, lang, columnFlags, shapeDeps);
      return buildCsv(words);
    },
  };
}
