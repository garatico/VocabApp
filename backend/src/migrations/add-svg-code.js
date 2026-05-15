/**
 * Migration: Add svg_code column to words table
 *
 * Adds support for storing SVG pictures for vocabulary words.
 * Safe to run multiple times - checks if column exists first.
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, '../../data/vocabulary.db');

try {
  const db = new Database(dbPath);

  // Check if svg_code column already exists
  const info = db.pragma('table_info(words)');
  const hasSvgCode = info.some(col => col.name === 'svg_code');

  if (hasSvgCode) {
    console.log('✓ svg_code column already exists');
    db.close();
    process.exit(0);
  }

  // Add the column
  db.exec('ALTER TABLE words ADD COLUMN svg_code TEXT');
  console.log('✓ svg_code column added to words table');

  db.close();
} catch (error) {
  console.error('Migration failed:', error.message);
  process.exit(1);
}
