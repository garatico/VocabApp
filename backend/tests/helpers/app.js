/**
 * tests/helpers/app.js
 *
 * Returns a configured Express app wired to an in-memory test DB.
 * Import this in every test file instead of src/server/app.js directly.
 */

import { createTestDb } from './db.js';
import { setDb, clearCache, reloadDb } from '../../src/server/lib/vocab-loader.js';
import { createApp } from '../../src/server/app.js';

export function buildTestApp() {
  process.env.NODE_ENV = 'development';

  clearCache();          // wipe stale vocab cache (and close any prior DB) before injecting
  const db = createTestDb();
  setDb(db);             // must come AFTER clearCache — clearCache nulls db, setDb sets it

  const app = createApp({ nodeEnv: 'test' });
  return { app, db };
}

export function teardownTestApp(db) {
  if (db && db.open) db.close();
  reloadDb();  // clear cache and null internal db ref so next buildTestApp starts clean
}
