/**
 * sql-adapter.ts — StorageAdapter backed by @tauri-apps/plugin-sql, so the
 * shared vocab query/write modules (src/shared/vocab/*) can run unmodified
 * against the Tauri desktop app's local SQLite copy.
 *
 * Only ever imported via dynamic import() behind isTauriApp() — see
 * src/client/tauri/bootstrap.ts — so the plain web bundle never pulls in
 * @tauri-apps/plugin-sql.
 *
 * transaction() does NOT send BEGIN/COMMIT as separate execute() calls —
 * tauri-plugin-sql has no transaction() method of its own because each
 * execute()/select() call checks out a (possibly different) connection from
 * its internal pool, discovered empirically when a real word edit failed
 * with "cannot start a transaction within a transaction". Instead, run()
 * calls made during the callback are collected into a queue and sent as one
 * atomic batch to the run_sql_transaction Rust command (main.rs) after the
 * callback returns — which is why get()/all() aren't supported inside a
 * transaction here: nothing in this app's write path (src/shared/vocab/
 * write.ts) ever needs to read back a value mid-transaction, only to fire a
 * sequence of independent writes, so this is enough for what's actually
 * needed rather than trying to fully replicate synchronous same-connection
 * semantics.
 *
 * Reads go to the select_rows Rust command (main.rs), not plugin-sql's select(): it sends the column
 * names once and each row as an array, about 40% of the bytes, and skips building and re-serializing
 * a JSON value per row. Spanish's whole-language read was 26 MB and ~3 s through select().
 */
import Database from '@tauri-apps/plugin-sql';
import { invoke } from '@tauri-apps/api/core';
import type { StorageAdapter, StorageRow, RunResult } from '../../shared/storage/types.js';
import { toDollarPlaceholders } from './placeholder-syntax.js';
import { logger } from '../utils/logger.js';

interface QueuedStatement {
  sql:    string;
  params: unknown[];
}

/** get()/all() would need real reads inside a transaction, which nothing here does — see file header. */
function unsupportedInTransaction(method: string): never {
  throw new Error(
    `StorageAdapter.${method}() is not supported inside a Tauri transaction() — ` +
    'writes are batched and sent atomically after the callback returns, so a read here ' +
    "wouldn't see this transaction's own not-yet-applied writes."
  );
}

/** What select_rows sends: the column names once, then one array of values per row. */
export interface ColumnarRows {
  columns: string[];
  rows:    unknown[][];
}

/** Back to one object per row, the shape every reader in src/shared/vocab/* expects. */
export function rowsToObjects<T>({ columns, rows }: ColumnarRows): T[] {
  return rows.map(values => {
    const row: Record<string, unknown> = {};
    columns.forEach((column, i) => { row[column] = values[i]; });
    return row as T;
  });
}

/** Copies kept of the database as it was before a session's first edit (`snapshot_db`, main.rs). */
export const EDIT_SNAPSHOT_PREFIX = 'vocabulary.before-edits-';
const EDIT_SNAPSHOTS_KEPT = 3;

/** `vocabulary.before-edits-2026-10-16T09-30-05.db`: sorts oldest first, and is a safe file name. */
export function editSnapshotName(now: Date): string {
  return `${EDIT_SNAPSHOT_PREFIX}${now.toISOString().slice(0, 19).replace(/:/g, '-')}.db`;
}

export function createTauriSqlAdapter(db: InstanceType<typeof Database>, dbPath: string): StorageAdapter {
  /**
   * The Word Editor writes straight into this database, so before the first write of each session a
   * copy of it is saved next to it (the last three are kept). A failed copy is logged, not fatal: a
   * full disk would fail the edit too, and refusing every edit over it would lock the editor.
   */
  let snapshot: Promise<void> | null = null;
  function beforeFirstWrite(): Promise<void> {
    snapshot ??= invoke<string>('snapshot_db', {
      dbPath, name: editSnapshotName(new Date()), prefix: EDIT_SNAPSHOT_PREFIX, keep: EDIT_SNAPSHOTS_KEPT,
    }).then(path => logger.info(`Saved a copy of the database before editing: ${path}`))
      .catch((err: unknown) => logger.warn('Could not save a copy of the database before editing:', err));
    return snapshot;
  }

  /** select_rows, or plugin-sql's select() if the command is missing or fails. */
  async function select<T>(sql: string, params: unknown[]): Promise<T[]> {
    try {
      // Native `?` placeholders, like run_sql_transaction. The answer is raw JSON bytes (an ArrayBuffer).
      const bytes = await invoke<ArrayBuffer>('select_rows', { dbPath, sql, params });
      return rowsToObjects<T>(JSON.parse(new TextDecoder().decode(bytes)) as ColumnarRows);
    } catch {
      return db.select<T[]>(toDollarPlaceholders(sql), params);
    }
  }

  const adapter: StorageAdapter = {
    async get<T = StorageRow>(sql: string, params: unknown[] = []): Promise<T | undefined> {
      return (await select<T>(sql, params))[0];
    },

    async all<T = StorageRow>(sql: string, params: unknown[] = []): Promise<T[]> {
      return select<T>(sql, params);
    },

    async run(sql: string, params: unknown[] = []): Promise<RunResult> {
      await beforeFirstWrite();
      const result = await db.execute(toDollarPlaceholders(sql), params);
      return { changes: result.rowsAffected, lastInsertRowid: result.lastInsertId ?? null };
    },

    async transaction<T>(fn: (tx: StorageAdapter) => Promise<T>): Promise<T> {
      const queued: QueuedStatement[] = [];
      const collector: StorageAdapter = {
        get: () => unsupportedInTransaction('get'),
        all: () => unsupportedInTransaction('all'),
        async run(sql: string, params: unknown[] = []): Promise<RunResult> {
          queued.push({ sql, params });
          // Not the real result — the statement hasn't run yet, only been
          // queued. Fine because src/shared/vocab/write.ts never reads a
          // run() result to decide what to do next.
          return { changes: 0, lastInsertRowid: null };
        },
        transaction: () => { throw new Error('Nested transactions are not supported'); },
      };

      const result = await fn(collector);
      await beforeFirstWrite();
      // Native `?` placeholders — this goes straight to rusqlite, not
      // through sqlx, so no toDollarPlaceholders translation here.
      await invoke('run_sql_transaction', { dbPath, statements: queued });
      return result;
    },
  };
  return adapter;
}
