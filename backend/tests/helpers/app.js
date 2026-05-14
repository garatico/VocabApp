/**
 * tests/helpers/app.js
 *
 * Returns a configured Express app wired to an in-memory test DB.
 * Import this in every test file instead of src/app.js directly.
 */

import { createTestDb } from './db.js';
import { setDb, clearCache } from '../../src/lib/vocab-loader.js';
import { createApp } from '../../src/app.js';

/**
 * Call once per test file (in beforeAll / beforeEach as needed).
 * Returns { app, db } — db lets tests inspect/mutate state directly.
 */
export function buildTestApp() {
  // Ensure admin routes are accessible
  process.env.NODE_ENV = 'development';

  const db  = createTestDb();
  setDb(db);               // inject into vocab-loader singleton
  clearCache();            // wipe any cached language data

  const app = createApp({ nodeEnv: 'test' });
  return { app, db };
}

/**
 * Tear down after tests. Pass the db returned by buildTestApp().
 */
export function teardownTestApp(db) {
  if (db && db.open) db.close();
  clearCache();
}
