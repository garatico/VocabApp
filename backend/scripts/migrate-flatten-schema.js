#!/usr/bin/env node
/**
 * migrate-flatten-schema.js
 *
 * ONE-TIME migration: merges word_linguistic and word_frequency into the
 * words table, then drops the now-redundant tables.
 *
 * Run once on Windows from the repo root:
 *   node backend/scripts/migrate-flatten-schema.js
 *
 * A timestamped backup is created before any changes are made.
 * If the migration fails, the backup is automatically restored.
 */

import Database from 'better-sqlite3';
import fs       from 'fs';
import path     from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const dbPath     = path.join(__dirname, '../../data/vocabulary.db');
const backupPath = dbPath.replace('.db', `_pre_flatten_${Date.now()}.db`);

if (!fs.existsSync(dbPath)) {
  console.error(`✗ Database not found: ${dbPath}`);
  process.exit(1);
}

console.log(`Database : ${dbPath}`);
console.log(`Backup   : ${backupPath}`);

fs.copyFileSync(dbPath, backupPath);
console.log('✓ Backup created\n');

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// ── Helpers ────────────────────────────────────────────────────────────────
function addColumn(table, col, type) {
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
    console.log(`  + ${table}.${col}`);
  } catch (e) {
    if (e.message.includes('duplicate column')) {
      console.log(`  ~ ${table}.${col} (already exists, skipping)`);
    } else {
      throw e;
    }
  }
}

function tableExists(name) {
  return !!db.prepare(
    `SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`
  ).get(name);
}

// ── Migration transaction ──────────────────────────────────────────────────
const migrate = db.transaction(() => {

  // ── 1. Add linguistic columns to words ──────────────────────────────────
  if (tableExists('word_linguistic')) {
    console.log('Adding word_linguistic columns to words:');
    addColumn('words', 'infinitive',   'TEXT');
    addColumn('words', 'reflexive',    'INTEGER DEFAULT 0');
    addColumn('words', 'gender',       'TEXT');
    addColumn('words', 'plural',       'TEXT');
    addColumn('words', 'register',     'TEXT');
    addColumn('words', 'ipa',          'TEXT');
    addColumn('words', 'syllables',    'TEXT');
    addColumn('words', 'conjugations', 'TEXT');

    console.log('\nCopying word_linguistic data...');
    const r = db.prepare(`
      UPDATE words SET
        infinitive    = (SELECT infinitive    FROM word_linguistic WHERE word_id = words.id),
        reflexive     = (SELECT reflexive     FROM word_linguistic WHERE word_id = words.id),
        gender        = (SELECT gender        FROM word_linguistic WHERE word_id = words.id),
        plural        = (SELECT plural        FROM word_linguistic WHERE word_id = words.id),
        register      = (SELECT register      FROM word_linguistic WHERE word_id = words.id),
        ipa           = (SELECT ipa           FROM word_linguistic WHERE word_id = words.id),
        syllables     = (SELECT syllables     FROM word_linguistic WHERE word_id = words.id),
        conjugations  = (SELECT conjugations  FROM word_linguistic WHERE word_id = words.id)
      WHERE EXISTS (SELECT 1 FROM word_linguistic WHERE word_id = words.id)
    `).run();
    console.log(`  ✓ ${r.changes} rows updated`);

    db.exec('DROP TABLE word_linguistic');
    console.log('  ✓ word_linguistic dropped');
  } else {
    console.log('word_linguistic already merged (skipping)');
  }

  // ── 2. Add frequency columns to words ────────────────────────────────────
  if (tableExists('word_frequency')) {
    console.log('\nAdding word_frequency columns to words:');
    addColumn('words', 'band',             'TEXT');
    addColumn('words', 'rank',             'INTEGER');
    addColumn('words', 'corpus_frequency', 'REAL');

    console.log('\nCopying word_frequency data...');
    const r = db.prepare(`
      UPDATE words SET
        band             = (SELECT band             FROM word_frequency WHERE word_id = words.id),
        rank             = (SELECT rank             FROM word_frequency WHERE word_id = words.id),
        corpus_frequency = (SELECT corpus_frequency FROM word_frequency WHERE word_id = words.id)
      WHERE EXISTS (SELECT 1 FROM word_frequency WHERE word_id = words.id)
    `).run();
    console.log(`  ✓ ${r.changes} rows updated`);

    db.exec('DROP TABLE word_frequency');
    console.log('  ✓ word_frequency dropped');
  } else {
    console.log('word_frequency already merged (skipping)');
  }

  // ── 3. VACUUM to reclaim space ────────────────────────────────────────────
  // (must be outside a transaction — called after commit)
});

// ── Run ───────────────────────────────────────────────────────────────────
try {
  migrate();

  // VACUUM must run outside any transaction
  console.log('\nVACUUMing database...');
  db.exec('VACUUM');
  console.log('  ✓ done');

  // ── Sanity check ─────────────────────────────────────────────────────────
  console.log('\nPost-migration checks:');
  const total   = db.prepare('SELECT COUNT(*) AS n FROM words').get().n;
  const ranked  = db.prepare('SELECT COUNT(*) AS n FROM words WHERE rank IS NOT NULL').get().n;
  const withPos = db.prepare('SELECT COUNT(*) AS n FROM words WHERE pos  IS NOT NULL').get().n;
  console.log(`  Total words          : ${total}`);
  console.log(`  Words with rank      : ${ranked}`);
  console.log(`  Words with POS       : ${withPos}`);

  const tables = db.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`
  ).all().map(r => r.name);
  console.log(`  Remaining tables     : ${tables.join(', ')}`);

  console.log('\n✓ Migration complete');
  console.log(`\nTo roll back: copy "${backupPath}" back over "${dbPath}"`);
} catch (err) {
  console.error('\n✗ Migration failed:', err.message);
  console.error('Restoring backup...');
  db.close();
  fs.copyFileSync(backupPath, dbPath);
  console.error('✓ Backup restored — database unchanged.');
  process.exit(1);
} finally {
  try { db.close(); } catch (_) {}
}
