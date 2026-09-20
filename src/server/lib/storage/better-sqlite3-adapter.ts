import type Database from 'better-sqlite3';
import type { StorageAdapter, StorageRow, RunResult } from '../../../shared/storage/types.js';

/**
 * better-sqlite3-adapter.ts — StorageAdapter backed by the server's existing
 * synchronous better-sqlite3 connection, so the shared vocab query/write
 * modules (src/shared/vocab/*) can run unmodified here too.
 *
 * better-sqlite3 is fully synchronous — get/all/run below wrap an
 * already-computed result in an already-resolved promise, never a deferred
 * operation. transaction() deliberately does NOT use better-sqlite3's own
 * `.transaction()` helper: that helper requires a synchronous callback and
 * would COMMIT before an async `fn` actually finished its work. Manual
 * BEGIN/COMMIT/ROLLBACK is safe here specifically because every get/all/run
 * resolves within the same microtask cascade — never real async I/O — so two
 * concurrent Express request handlers (each its own macrotask) can't
 * interleave their BEGIN/COMMIT pairs. That invariant only holds as long as
 * nothing inside a transaction body ever awaits real I/O (timers, fetch,
 * fs.promises) — see tests/server/storage-adapter.test.js's concurrent-write
 * regression test, which exists specifically to catch a future violation.
 */
export function createBetterSqlite3Adapter(db: Database.Database): StorageAdapter {
  const adapter: StorageAdapter = {
    async get<T = StorageRow>(sql: string, params: unknown[] = []): Promise<T | undefined> {
      return db.prepare(sql).get(...params) as T | undefined;
    },

    async all<T = StorageRow>(sql: string, params: unknown[] = []): Promise<T[]> {
      return db.prepare(sql).all(...params) as T[];
    },

    async run(sql: string, params: unknown[] = []): Promise<RunResult> {
      const result = db.prepare(sql).run(...params);
      return { changes: result.changes, lastInsertRowid: Number(result.lastInsertRowid) };
    },

    async transaction<T>(fn: (tx: StorageAdapter) => Promise<T>): Promise<T> {
      db.exec('BEGIN');
      try {
        const result = await fn(adapter);
        db.exec('COMMIT');
        return result;
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },
  };
  return adapter;
}
