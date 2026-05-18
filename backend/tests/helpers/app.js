/**
 * tests/helpers/app.js
 *
 * Returns a configured Express app wired to an in-memory test DB.
 * Import this in every test file instead of src/server/app.js directly.
 */

import { createTestDb } from './db.js';
import { setDb, clearCache } from '../../src/server/lib/vocab-loader.js';
import { createApp } from '../../src/server/app.js';

export function buildTestApp() {
  process.env.NODE_ENV = 'development';

  const db = createTestDb();
  setDb(db);
  clearCache();

  const app = createApp({ nodeEnv: 'test' });
  return { app, db };
}

export function teardownTestApp(db) {
  if (db && db.open) db.close();
  clearCache();
}
