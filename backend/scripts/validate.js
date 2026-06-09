#!/usr/bin/env node
/**
 * validate.js
 *
 * Pre-flight check run before the server starts (or manually via npm run validate).
 * Catches the two failure modes we've seen in this project:
 *   1. Truncated files (file ends mid-token, no closing brace, etc.)
 *   2. Null-byte corruption (file padded with \x00 after real content)
 *
 * JS files also get a Node syntax check.
 * TS files rely on `npm run typecheck` (tsc --noEmit) for syntax validation.
 *
 * Exits with code 1 and a clear message if anything is wrong.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = join(fileURLToPath(import.meta.url), '..');
const root = join(__dirname, '..');

const CHECK_DIRS = [
  join(root, 'src', 'server'),
  join(root, 'scripts'),
];

const MIN_BYTES = 50; // any source file under this is almost certainly truncated

let errors = 0;

function walkSource(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) { walkSource(full); continue; }

    const isJs = entry.endsWith('.js');
    const isTs = entry.endsWith('.ts');
    if (!isJs && !isTs) continue;

    const rel = relative(root, full);
    const buf = readFileSync(full);

    // 1. Null bytes
    const nullCount = [...buf].filter(b => b === 0).length;
    if (nullCount > 0) {
      console.error(`✗ NULL BYTES (${nullCount}): ${rel}`);
      errors++;
    }

    // 2. Suspiciously small
    if (buf.length < MIN_BYTES) {
      console.error(`✗ TOO SMALL (${buf.length} bytes — likely truncated): ${rel}`);
      errors++;
    }

    // 3. Syntax check (JS only — TS is covered by npm run typecheck)
    if (isJs) {
      try {
        execSync(`node --input-type=module --check < "${full}"`, { stdio: 'pipe' });
      } catch (e) {
        const msg = e.stderr?.toString().split('\n')[0] ?? e.message;
        console.error(`✗ SYNTAX ERROR: ${rel}\n     ${msg}`);
        errors++;
      }
    }
  }
}

console.log('Running pre-flight validation...\n');
for (const dir of CHECK_DIRS) walkSource(dir);

if (errors === 0) {
  console.log('✓ All files passed validation.');
  process.exit(0);
} else {
  console.error(`\n${errors} problem(s) found. Fix them before starting the server.`);
  process.exit(1);
}
