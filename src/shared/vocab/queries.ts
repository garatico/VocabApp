import type { StorageAdapter } from '../storage/types.js';
import type { Word } from '../types.js';
import { buildWordSelectSql, type WordSelectColumnFlags, type WordSelectRow } from './word-select.js';
import { shapeWordRow, type ShapeWordDeps } from './shape-word.js';
import { buildWordFilters, type WordFilterParams } from './filters.js';

/** Languages that actually have rows on `words`. */
export async function getSupportedLanguages(adapter: StorageAdapter): Promise<string[]> {
  const rows = await adapter.all<{ language: string }>(
    'SELECT DISTINCT language FROM words ORDER BY language'
  );
  return rows.map(r => r.language);
}

/**
 * Every word for one language, in the app's canonical order — the query
 * loadVocabFile has always run, just no longer inlined there. No pagination:
 * that's a separate, paginated sibling (getWordPage, added alongside the
 * public API's own pagination) for callers that want a page at a time
 * instead of the whole language.
 */
export async function loadAllWordsForLanguage(
  adapter: StorageAdapter,
  language: string,
  columnFlags: WordSelectColumnFlags,
  shapeDeps: ShapeWordDeps,
): Promise<Word[]> {
  const sql = `${buildWordSelectSql(columnFlags)}
    WHERE w.language = ?
    ORDER BY COALESCE(w.rank, 9999), w.word
  `;
  const rows = await adapter.all<WordSelectRow>(sql, [language]);
  return rows.map(row => shapeWordRow(row, language, shapeDeps));
}

export interface WordPageParams extends WordFilterParams {
  page?:  number;
  limit?: number;
}

export interface WordPageResult {
  total: number;
  page:  number;
  pages: number;
  limit: number;
  words: Word[];
}

/**
 * A filtered, paginated slice of one language's words — the same
 * search/pos/band/domain filters and page/limit clamping admin/words.ts's
 * `GET /vocab` already applies, so Tauri's local Word Editor (and later, the
 * paginated public API) get identical results from one implementation.
 */
export async function getWordPage(
  adapter: StorageAdapter,
  params: WordPageParams,
  columnFlags: WordSelectColumnFlags,
  shapeDeps: ShapeWordDeps,
): Promise<WordPageResult> {
  const page  = Math.max(1, params.page ?? 1);
  const limit = Math.min(200, Math.max(1, params.limit ?? 100));
  const offset = (page - 1) * limit;

  const { where, params: whereParams } = buildWordFilters(params);

  const countRow = await adapter.get<{ total: number }>(
    `SELECT COUNT(*) AS total FROM words w WHERE ${where}`, whereParams
  );
  const total = countRow?.total ?? 0;

  const sql = `${buildWordSelectSql(columnFlags)}
    WHERE ${where}
    ORDER BY COALESCE(w.rank, 9999), w.word
    LIMIT ? OFFSET ?
  `;
  const rows  = await adapter.all<WordSelectRow>(sql, [...whereParams, limit, offset]);
  const words = rows.map(row => shapeWordRow(row, params.language, shapeDeps));

  return { total, page, pages: Math.ceil(total / limit), limit, words };
}

/** A single word by its exact text, or undefined if no such word exists for the language. */
export async function getWord(
  adapter: StorageAdapter,
  language: string,
  word: string,
  columnFlags: WordSelectColumnFlags,
  shapeDeps: ShapeWordDeps,
): Promise<Word | undefined> {
  const sql = `${buildWordSelectSql(columnFlags)} WHERE w.word = ? AND w.language = ?`;
  const row = await adapter.get<WordSelectRow>(sql, [word, language]);
  return row ? shapeWordRow(row, language, shapeDeps) : undefined;
}
