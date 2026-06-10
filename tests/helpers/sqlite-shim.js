/**
 * tests/helpers/sqlite-shim.js
 *
 * A synchronous better-sqlite3-compatible shim backed by sql.js (pure WASM).
 * Used only during tests so we don't need a platform-native .node binary.
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const initSqlJs = require('sql.js');

let SQL = null;

async function getSql() {
  if (!SQL) SQL = await initSqlJs();
  return SQL;
}

class Statement {
  constructor(db, sql) {
    this._db  = db;
    this._sql = sql;
  }

  _rowToObj(columns, values) {
    const obj = {};
    columns.forEach((col, i) => { obj[col] = values[i] ?? null; });
    return obj;
  }

  _normaliseParams(args) {
    if (args.length === 0) return [];
    if (args.length === 1 && Array.isArray(args[0])) return args[0];
    if (args.length === 1 && args[0] !== null && typeof args[0] === 'object') {
      const named = {};
      for (const [k, v] of Object.entries(args[0])) {
        named[k.startsWith(':') || k.startsWith('$') || k.startsWith('@') ? k : `:${k}`] = v;
      }
      return named;
    }
    return args;
  }

  get(...args) {
    const params = this._normaliseParams(args);
    const stmt = this._db.prepare(this._sql);
    try {
      stmt.bind(params);
      if (stmt.step()) {
        return this._rowToObj(stmt.getColumnNames(), stmt.get());
      }
      return undefined;
    } finally {
      stmt.free();
    }
  }

  all(...args) {
    const params  = this._normaliseParams(args);
    const results = [];
    const stmt    = this._db.prepare(this._sql);
    try {
      stmt.bind(params);
      while (stmt.step()) {
        results.push(this._rowToObj(stmt.getColumnNames(), stmt.get()));
      }
    } finally {
      stmt.free();
    }
    return results;
  }

  run(...args) {
    const params = this._normaliseParams(args);
    const stmt   = this._db.prepare(this._sql);
    try {
      stmt.bind(params);
      stmt.step();
      const lastId  = this._db.exec('SELECT last_insert_rowid()')[0]?.values[0][0] ?? null;
      const changes = this._db.exec('SELECT changes()')[0]?.values[0][0] ?? 0;
      return { lastInsertRowid: lastId, changes };
    } finally {
      stmt.free();
    }
  }
}

export class Database {
  constructor(_path) {
    if (!SQL) throw new Error('Call initShim() before creating a Database');
    this._db  = new SQL.Database();
    this.open = true;
  }

  pragma(_str) { /* no-op */ }

  exec(sql) {
    this._db.run(sql);
    return this;
  }

  prepare(sql) {
    return new Statement(this._db, sql);
  }

  transaction(fn) {
    return (...args) => {
      this._db.run('BEGIN');
      try {
        const result = fn(...args);
        this._db.run('COMMIT');
        return result;
      } catch (err) {
        this._db.run('ROLLBACK');
        throw err;
      }
    };
  }

  close() {
    if (this.open) { this._db.close(); this.open = false; }
  }
}

export async function initShim() {
  SQL = await getSql();
}

export default Database;
