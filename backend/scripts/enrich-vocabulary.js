#!/usr/bin/env node

/**
 * enrich-vocabulary.js
 *
 * Wrapper script for vocabulary enrichment
 * Currently runs Phase 1 Quick Wins enrichment
 *
 * Usage: node enrich-vocabulary.js [language]
 */

import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_LANGUAGE = process.argv[2] || 'spanish';

/**
 * Run enrichment
 */
function enrichVocabulary(language) {
  console.log(`\n🚀 Running vocabulary enrichment for ${language}...\n`);

  try {
    const quickWinsPath = path.join(__dirname, 'enrich-quick-wins.js');

    const output = execSync(`node ${quickWinsPath} ${language}`, {
      cwd: __dirname,
      encoding: 'utf8',
      stdio: 'inherit'
    });

    console.log('\n✅ Enrichment complete!\n');
    return output;
  } catch (err) {
    console.error(`\n✗ Enrichment failed: ${err.message}\n`);
    throw err;
  }
}

/**
 * Main
 */
function main() {
  try {
    enrichVocabulary(DEFAULT_LANGUAGE);
  } catch (err) {
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { enrichVocabulary };
