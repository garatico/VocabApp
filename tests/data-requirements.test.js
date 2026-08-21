/**
 * tests/data-requirements.test.js
 *
 * This app does not build its own data. It is handed a SQLite file by a
 * separate project and has to decide, once, whether that file is usable.
 *
 * The awkward part is that a bad database looks exactly like a good one. A
 * database built by the current pipeline and one built by the version whose
 * conjugation parser stored 'wurde ich ward' as a verb form are both valid
 * SQLite with plausible rows in every column. Nothing about opening the file
 * tells them apart — only the stamp the pipeline writes does.
 *
 * These cover both halves of that: the structural check, which decides whether
 * the app can serve at all, and the version check, which decides what it says.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database, { initShim } from 'better-sqlite3';

import {
  checkDatabase, REQUIRED_WORD_COLUMNS, REQUIRED_TABLES,
  MINIMUM_SCHEMA_VERSION, BAND_CUTOFFS, REBUILD_INSTRUCTION,
} from '../src/server/lib/data-requirements.js';
import { bandFromRank, BAND_CUTOFFS as LOADER_BANDS } from '../src/server/lib/vocab-loader.js';
import { createTestDb } from './helpers/db.js';

await initShim?.();

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function stamp(db, values) {
  for (const [key, value] of Object.entries(values)) {
    db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)')
      .run(key, String(value));
  }
}

// ── The structural check ──────────────────────────────────────────────────────

describe('a database that satisfies what the app asks for', () => {
  it('passes', () => {
    const report = checkDatabase(createTestDb());
    expect(report.fatal).toEqual([]);
  });

  it('is the test database, which is generated from the same list', () => {
    // If these ever come apart, every other test in the suite is running
    // against something the app does not actually claim to need.
    const columns = new Set(
      createTestDb().prepare('PRAGMA table_info(words)').all().map(r => r.name));
    for (const required of REQUIRED_WORD_COLUMNS) {
      expect(columns.has(required), `test db has no '${required}'`).toBe(true);
    }
  });
});

describe('a database the app cannot serve from', () => {
  function bare(wordsColumns) {
    const db = new Database(':memory:');
    db.exec(`CREATE TABLE words (${wordsColumns});
             CREATE TABLE word_glosses (id INTEGER PRIMARY KEY);
             CREATE TABLE word_examples (id INTEGER PRIMARY KEY);
             CREATE TABLE word_tags (id INTEGER PRIMARY KEY);`);
    return db;
  }

  it('is fatal when a column the SELECT names is gone', () => {
    const report = checkDatabase(bare('id INTEGER PRIMARY KEY, word TEXT, language TEXT'));
    expect(report.fatal.length).toBeGreaterThan(0);
    expect(report.fatal.join(' ')).toContain('conjugations');
  });

  it('names every missing column rather than only the first', () => {
    const fatal = checkDatabase(bare('id INTEGER PRIMARY KEY, word TEXT')).fatal.join(' ');
    expect(fatal).toContain('language');
    expect(fatal).toContain('rank');
  });

  it('is fatal when a whole table is gone', () => {
    const db = createTestDb();
    db.exec('DROP TABLE word_tags');
    expect(checkDatabase(db).fatal.join(' ')).toContain("missing table 'word_tags'");
  });

  it('checks every table the app queries', () => {
    for (const table of REQUIRED_TABLES) {
      const db = createTestDb();
      db.exec(`DROP TABLE ${table}`);
      expect(checkDatabase(db).fatal.length, `dropping ${table} went unnoticed`)
        .toBeGreaterThan(0);
    }
  });
});

// ── The version check ─────────────────────────────────────────────────────────

describe('what the app makes of the stamp', () => {
  it('reads a full stamp back', () => {
    const db = createTestDb();
    stamp(db, {
      schema_version: 2, pipeline_version: 1, built_at: '2026-08-20T09:00:00+00:00',
    });
    const report = checkDatabase(db);

    expect(report.schemaVersion).toBe(2);
    expect(report.pipelineVersion).toBe(1);
    expect(report.builtAt).toBe('2026-08-20T09:00:00+00:00');
    expect(report.warnings).toEqual([]);
  });

  it('warns rather than refusing when there is no stamp at all', () => {
    // Every database built before the pipeline started stamping is this case,
    // and refusing to start over it would be worse than the problem.
    const report = checkDatabase(createTestDb());
    expect(report.fatal).toEqual([]);
    expect(report.schemaVersion).toBeNull();
    expect(report.warnings.join(' ')).toContain('no version stamp');
  });

  it('warns when the schema predates what the app expects', () => {
    const db = createTestDb();
    stamp(db, { schema_version: MINIMUM_SCHEMA_VERSION - 1 });
    const report = checkDatabase(db);
    expect(report.fatal).toEqual([]);
    expect(report.warnings.join(' ')).toContain('expects at least');
  });

  it('accepts a schema newer than the minimum without comment', () => {
    // The two projects release separately. A database one version ahead is the
    // normal state of affairs, not a fault.
    const db = createTestDb();
    stamp(db, { schema_version: MINIMUM_SCHEMA_VERSION + 5 });
    expect(checkDatabase(db).warnings).toEqual([]);
  });
});

// ── The boundary itself ───────────────────────────────────────────────────────

describe('the app owns no data-producing code', () => {
  it('has no pipeline left in it', () => {
    expect(fs.existsSync(path.join(repoRoot, 'scripts/data'))).toBe(false);
    expect(fs.existsSync(path.join(repoRoot, 'contract'))).toBe(false);
  });

  it('reads no file out of the data project', () => {
    // The app must build and run with VocabApp-Data absent. A *path* into it
    // would work here, where the two happen to sit side by side, and break the
    // moment the folder is moved — which is the entire point of the split.
    //
    // Naming the project in prose is fine and expected: REBUILD_INSTRUCTION
    // has to tell someone where their data comes from. What is banned is a
    // path segment — the name followed by a separator and something to read.
    const PATH_INTO_IT = /VocabApp-Data[/\\]\w/;
    const offenders = [];
    const walk = dir => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { walk(full); continue; }
        if (!/\.(ts|js|mjs)$/.test(entry.name)) continue;
        const code = fs.readFileSync(full, 'utf8').replace(/^\s*(\/\/|\*|\/\*).*$/gm, '');
        if (PATH_INTO_IT.test(code)) offenders.push(path.relative(repoRoot, full));
      }
    };
    walk(path.join(repoRoot, 'src'));
    walk(path.join(repoRoot, 'tests'));

    expect(offenders, 'these read a file out of the data project').toEqual([]);
  });

  it('says where data comes from when it has to reject a database', () => {
    expect(REBUILD_INSTRUCTION).toMatch(/VocabApp-Data/);
  });
});

describe('the band is computed here and nowhere else', () => {
  it('is not a column the app requires', () => {
    // It used to be written by the pipeline and never read, which made it a
    // second copy of a derived value maintained across a project boundary.
    expect(REQUIRED_WORD_COLUMNS).not.toContain('band');
  });

  it('is not in the database the app is given', () => {
    const columns = createTestDb().prepare('PRAGMA table_info(words)').all()
      .map(r => r.name);
    expect(columns).not.toContain('band');
  });

  it('still comes out of rank the way it always did', () => {
    expect(bandFromRank(500)).toBe('A1');
    expect(bandFromRank(501)).toBe('A2');
    expect(bandFromRank(3000)).toBe('B1');
    expect(bandFromRank(7001)).toBe('C2');
    expect(bandFromRank(null)).toBeNull();
  });

  it('is the same list vocab-loader re-exports', () => {
    expect(LOADER_BANDS).toBe(BAND_CUTOFFS);
  });
});
