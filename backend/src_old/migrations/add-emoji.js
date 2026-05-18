/**
 * Migration: Add emoji column to words table
 *
 * Adds a per-word emoji field used as a fallback visual in Picture Quiz
 * when no SVG has been generated yet.
 * Safe to run multiple times — checks if column exists first.
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const dbPath     = path.join(__dirname, '../../data/vocabulary.db');

try {
  const db = new Database(dbPath);

  const info     = db.pragma('table_info(words)');
  const hasEmoji = info.some(col => col.name === 'emoji');

  if (hasEmoji) {
    console.log('✓ emoji column already exists');
    db.close();
    process.exit(0);
  }

  db.exec('ALTER TABLE words ADD COLUMN emoji TEXT');
  console.log('✓ emoji column added to words table');

  db.close();
} catch (error) {
  console.error('Migration failed:', error.message);
  process.exit(1);
}
