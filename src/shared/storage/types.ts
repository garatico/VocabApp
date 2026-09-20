/**
 * storage/types.ts — the one abstraction the shared vocab query/write layer
 * depends on, so it can be written once and run against either the server's
 * better-sqlite3 connection or Tauri's plugin-sql connection.
 *
 * better-sqlite3 (server) is fully synchronous; tauri-plugin-sql's JS API is
 * Promise-based. Every method here is async so a synchronous adapter can
 * just wrap its result in an already-resolved promise — see
 * src/server/lib/storage/better-sqlite3-adapter.ts and
 * src/client/tauri/sql-adapter.ts for the two concrete implementations.
 *
 * SQL strings passed to an adapter always use `?` positional placeholders
 * (better-sqlite3's native style) — tauri-plugin-sql's sqlite driver actually
 * wants sqlx's `$1`/`$2` syntax, but that's a Tauri-adapter-only concern
 * (see sql-adapter.ts's toPositionalDollarParams); nothing above this
 * interface should ever need to know or care.
 */

export interface StorageRow {
  [column: string]: unknown;
}

export interface RunResult {
  changes: number;
  lastInsertRowid: number | null;
}

export interface StorageAdapter {
  // T is intentionally unconstrained (not `T extends StorageRow`): a plain
  // named row interface without an index signature — every WordSelectRow-
  // style type in this codebase — doesn't structurally satisfy an index
  // signature for generic-constraint purposes even though every field is
  // compatible, so requiring `extends StorageRow` here would force every
  // caller to add a pointless index signature to its own row type.
  get<T = StorageRow>(sql: string, params?: unknown[]): Promise<T | undefined>;
  all<T = StorageRow>(sql: string, params?: unknown[]): Promise<T[]>;
  run(sql: string, params?: unknown[]): Promise<RunResult>;
  /** BEGIN before fn runs, COMMIT on success, ROLLBACK on throw. fn is handed this same adapter. */
  transaction<T>(fn: (tx: StorageAdapter) => Promise<T>): Promise<T>;
}
