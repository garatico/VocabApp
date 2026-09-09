/**
 * sync-data.ts — copy vocabulary.db from VocabApp-Data into this repo's own
 * data/ directory.
 *
 * The dev server reads DATA_DIR live (see .env), which is correct for
 * development — VocabApp-Data sits right next to this repo on a dev machine.
 * But export-static-vocab.ts (the step every native/static build runs)
 * deliberately never reads DATA_DIR — a portable build has to ship a
 * self-contained data/vocabulary.db, not a reference to a sibling folder that
 * won't exist wherever the build ends up. This script is the one explicit
 * bridge between the two: run it whenever VocabApp-Data has moved ahead, then
 * build.
 *
 *   npm run data:sync
 */

import 'dotenv/config';

import fs   from 'node:fs';
import path from 'node:path';

import { projectRoot, dataDir } from '../src/server/lib/paths.js';

const sourceDb = path.join(dataDir, 'vocabulary.db');
const destDb   = path.join(projectRoot, 'data', 'vocabulary.db');

if (sourceDb === destDb) {
  console.error(
    'DATA_DIR is not set to a separate VocabApp-Data checkout (check .env) '
    + '— nothing to sync from.',
  );
  process.exit(1);
}

if (!fs.existsSync(sourceDb)) {
  console.error(`No vocabulary.db at ${sourceDb}`);
  process.exit(1);
}

const before = fs.existsSync(destDb) ? fs.statSync(destDb) : null;
fs.copyFileSync(sourceDb, destDb);
const after = fs.statSync(destDb);

const fmt = (s: fs.Stats): string => `${(s.size / 1048576).toFixed(1)} MB, ${s.mtime.toISOString()}`;

console.log(`Synced vocabulary.db\n  from ${sourceDb}\n  to   ${destDb}`);
console.log(before ? `  ${fmt(before)}\n  -> ${fmt(after)}` : `  ${fmt(after)}`);
