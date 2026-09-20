/**
 * sql-adapter.ts — StorageAdapter backed by @tauri-apps/plugin-sql, so the
 * shared vocab query/write modules (src/shared/vocab/*) can run unmodified
 * against the Tauri desktop app's local SQLite copy.
 *
 * Only ever imported via dynamic import() behind isPackagedApp() — see
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
 */
import Database from '@tauri-apps/plugin-sql';
import { invoke } from '@tauri-apps/api/core';
import type { StorageAdapter, StorageRow, RunResult } from '../../shared/storage/types.js';
import { toDollarPlaceholders } from './placeholder-syntax.js';

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

export function createTauriSqlAdapter(db: InstanceType<typeof Database>, dbPath: string): StorageAdapter {
  const adapter: StorageAdapter = {
    async get<T = StorageRow>(sql: string, params: unknown[] = []): Promise<T | undefined> {
      const rows = await db.select<T[]>(toDollarPlaceholders(sql), params);
      return rows[0];
    },

    async all<T = StorageRow>(sql: string, params: unknown[] = []): Promise<T[]> {
      return db.select<T[]>(toDollarPlaceholders(sql), params);
    },

    async run(sql: string, params: unknown[] = []): Promise<RunResult> {
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
      // Native `?` placeholders — this goes straight to rusqlite, not
      // through sqlx, so no toDollarPlaceholders translation here.
      await invoke('run_sql_transaction', { dbPath, statements: queued });
      return result;
    },
  };
  return adapter;
}
