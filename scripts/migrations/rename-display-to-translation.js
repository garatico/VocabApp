/**
 * Migration: Rename words.display → words.translation
 *
 * The "display" column held the primary English translation shown to the learner
 * (e.g. "shark" for "tiburón"). The name was misleading — it sounded like a CSS
 * property rather than a data field. Renamed to "translation" for clarity.
 *
 * Requires SQLite 3.25.0+ (released 2018-09-15).
 * Safe to run multiple times — checks column name before acting.
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const dbPath     = path.join(__dirname, '../../../data/vocabulary.db');

try {
  const db   = new Database(dbPath);
  const cols = new Set(db.pragma('table_info(words)').map(c => c.name));

  if (cols.has('translation')) {
    console.log('✓ column already named translation — nothing to do');
  } else if (cols.has('display')) {
    db.exec('ALTER TABLE words RENAME COLUMN display TO translation');
    console.log('✓ renamed display → translation');
  } else {
    console.error('Neither display nor translation column found — inspect schema manually');
    process.exit(1);
  }

  db.close();
} catch (error) {
  console.error('Migration failed:', error.message);
  process.exit(1);
}
