/**
 * Migration: Add verb conjugation columns to words table
 *
 * Adds columns introduced after the initial schema:
 *   conjugations, updated_at, past_participle, gerund,
 *   conjugation_class, future_stem, conjugation_overrides, emoji
 *
 * Safe to run multiple times — checks for each column before adding.
 * These columns are now part of the baseline schema in sync_db.py so
 * this script is only needed for databases created before they were added.
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const dbPath     = path.join(__dirname, '../../../data/vocabulary.db');

const COLUMNS = [
  ['emoji',                 'TEXT'],
  ['conjugations',          'TEXT'],
  ['updated_at',            'TEXT DEFAULT CURRENT_TIMESTAMP'],
  ['past_participle',       'TEXT'],
  ['gerund',                'TEXT'],
  ['conjugation_class',     'TEXT'],
  ['future_stem',           'TEXT'],
  ['conjugation_overrides', 'TEXT'],
];

try {
  const db   = new Database(dbPath);
  const info = db.pragma('table_info(words)');
  const cols = new Set(info.map(c => c.name));
  let added  = 0;

  for (const [col, type] of COLUMNS) {
    if (!cols.has(col)) {
      db.exec(`ALTER TABLE words ADD COLUMN ${col} ${type}`);
      console.log(`  ✓ added ${col}`);
      added++;
    } else {
      console.log(`  · ${col} already exists`);
    }
  }

  console.log(added ? `\nAdded ${added} column(s).` : '\nNothing to do.');
  db.close();
} catch (error) {
  console.error('Migration failed:', error.message);
  process.exit(1);
}
