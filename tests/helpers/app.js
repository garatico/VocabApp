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
  clearCache();          // wipe stale vocab cache (and close any prior DB) before injecting
  const db = createTestDb();
  setDb(db);             // must come AFTER clearCache — clearCache nulls db, setDb sets it

  // A development app that doesn't serve the SPA. This used to be
  // `createApp({ nodeEnv: 'test' })` plus a `process.env.NODE_ENV =
  // 'development'` above it, because the admin gate read the env var while the
  // static-file branch read the option — the app had to be told it was in two
  // environments at once for the suite to pass.
  const app = createApp({ nodeEnv: 'development', serveStatic: false });
  return { app, db };
}

export function teardownTestApp(db) {
  if (db && db.open) db.close();
  reloadDb();  // clear cache and null internal db ref so next buildTestApp starts clean
}
