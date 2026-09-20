import type { StorageAdapter } from '../storage/types.js';
import type { WordSelectColumnFlags } from './word-select.js';

/**
 * column-flags.ts — the adapter-based equivalent of vocab-loader.ts's
 * checkDisambiguatorColumn/checkIsFunctionWordColumn/checkGrammaticalNumberColumn,
 * for callers (Tauri) that only have a StorageAdapter, not a live
 * better-sqlite3 connection to run a synchronous PRAGMA against directly.
 *
 * The server keeps its own synchronous version — this exists for readers
 * that need the same "does this database have column X yet" check without
 * assuming a specific driver.
 */
export async function detectWordColumnFlags(adapter: StorageAdapter): Promise<WordSelectColumnFlags> {
  const cols  = await adapter.all<{ name: string }>("PRAGMA table_info('words')");
  const names = new Set(cols.map(c => c.name));
  return {
    hasDisambiguator:     names.has('disambiguator'),
    hasIsFunctionWord:    names.has('is_function_word'),
    hasGrammaticalNumber: names.has('grammatical_number'),
  };
}
