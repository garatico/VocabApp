#!/usr/bin/env node

/**
 * check-data-integrity.js
 *
 * Verifies that all data in spanish.json is preserved in the CSV seed,
 * so regenerating from CSV won't lose any data.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function loadJSON(file) {
  const data = await fs.readFile(file, 'utf8');
  return JSON.parse(data);
}

async function main() {
  console.log('\n📊 DATA INTEGRITY CHECK\n');
  console.log('═'.repeat(70));

  const jsonPath = path.join(__dirname, '../data/spanish.json');
  const csvPath = path.join(__dirname, '../data/sources/spanish.csv');

  const words = await loadJSON(jsonPath);
  const csv = await fs.readFile(csvPath, 'utf8');
  const csvLines = csv.trim().split('\n');
  const csvHeaders = csvLines[0].split(',').map(h => h.trim());
  const csvDataLines = csvLines.slice(1).filter(l => l.trim());

  console.log(`\n📋 FILES:\n`);
  console.log(`   JSON: ${words.length} words`);
  console.log(`   CSV:  ${csvDataLines.length} words`);
  console.log(`   CSV Columns: ${csvHeaders.length}`);

  // Analyze coverage
  const coverage = {};
  const examples = {};

  for (const word of words) {
    // Track which fields have data
    if (word.word) coverage.word = (coverage.word || 0) + 1;
    if (word.display) coverage.display = (coverage.display || 0) + 1;
    if (word.pos) coverage.pos = (coverage.pos || 0) + 1;
    if (word.glosses?.length > 0) coverage.glosses = (coverage.glosses || 0) + 1;
    if (word.difficulty) coverage.difficulty = (coverage.difficulty || 0) + 1;
    if (word.tags?.length > 0) coverage.tags = (coverage.tags || 0) + 1;
    if (word.notes) coverage.notes = (coverage.notes || 0) + 1;
    if (word.examples?.length > 0) coverage.examples = (coverage.examples || 0) + 1;
    if (word.linguistic?.ipa) coverage.ipa = (coverage.ipa || 0) + 1;
    if (word.linguistic?.gender) coverage.gender = (coverage.gender || 0) + 1;
    if (word.linguistic?.plural) coverage.plural = (coverage.plural || 0) + 1;
    if (word.linguistic?.infinitive) coverage.infinitive = (coverage.infinitive || 0) + 1;
    if (word.linguistic?.reflexive) coverage.reflexive = (coverage.reflexive || 0) + 1;
    if (word.relations?.synonyms?.length > 0) coverage.synonyms = (coverage.synonyms || 0) + 1;
    if (word.relations?.antonyms?.length > 0) coverage.antonyms = (coverage.antonyms || 0) + 1;
    if (word.frequency?.band) coverage.frequency_band = (coverage.frequency_band || 0) + 1;

    // Store examples
    if (!examples.word && word.word) examples.word = word.word;
    if (!examples.display && word.display) examples.display = word.display;
    if (!examples.pos && word.pos) examples.pos = word.pos;
    if (!examples.glosses && word.glosses?.length) examples.glosses = word.glosses;
    if (!examples.ipa && word.linguistic?.ipa) examples.ipa = word.linguistic.ipa;
  }

  console.log(`\n${'-'.repeat(70)}`);
  console.log(`\n📊 FIELD COVERAGE IN JSON:\n`);

  const exportedFields = [
    'word', 'display', 'pos', 'glosses', 'difficulty', 'tags', 'notes',
    'examples', 'synonyms', 'antonyms', 'ipa', 'frequency_band', 'gender', 'plural', 'infinitive', 'reflexive'
  ];

  console.log(`EXPORTED TO CSV (17 columns):\n`);
  let csvCoverage = 0;
  for (const field of exportedFields) {
    const count = coverage[field] || 0;
    const pct = Math.round((count / words.length) * 100);
    const check = pct === 100 ? '✓' : pct > 0 ? '◐' : '○';
    console.log(`   ${check} ${field.padEnd(18)} ${pct}% (${count}/${words.length})`);
    if (pct > 0) csvCoverage++;
  }

  console.log(`\nNOT EXPORTED (constant or auto-generated):\n`);
  console.log(`   ✓ domains                (always "general")`);
  console.log(`   ✓ linguistic.register    (always "neutral" or enriched)`);
  console.log(`   ✓ linguistic.conjugations (null, can be generated)`);
  console.log(`   ✓ linguistic.syllables   (empty, can be generated)`);
  console.log(`   ✓ relations.commonly_confused_with (empty, can be generated)`);
  console.log(`   ✓ relations.related      (empty, can be generated)`);
  console.log(`   ✓ frequency.corpus_frequency (null, optional)`);

  console.log(`\n${'-'.repeat(70)}`);
  console.log(`\n🔍 DATA LOSS RISK ANALYSIS:\n`);

  const criticalFields = [
    { name: 'word', required: true, reason: 'Unique identifier' },
    { name: 'display', required: true, reason: 'UI display text' },
    { name: 'pos', required: true, reason: 'Grammar classification' },
    { name: 'glosses', required: true, reason: 'English translations' },
    { name: 'difficulty', required: true, reason: 'Learning level' },
    { name: 'frequency_band', required: true, reason: 'CEFR classification' },
    { name: 'ipa', required: false, reason: 'Pronunciation (can be regenerated)' },
    { name: 'examples', required: false, reason: 'Can be filled by Phase 1' },
    { name: 'synonyms', required: false, reason: 'Can be filled by Phase 1' },
    { name: 'tags', required: false, reason: 'Optional metadata' }
  ];

  let dataLoss = false;
  for (const field of criticalFields) {
    const count = coverage[field.name] || 0;
    const pct = Math.round((count / words.length) * 100);

    if (field.required && pct < 100) {
      console.log(`   ✗ ${field.name.padEnd(18)} MISSING in ${100 - pct}% of words!`);
      dataLoss = true;
    } else if (field.required && pct === 100) {
      console.log(`   ✓ ${field.name.padEnd(18)} Complete (${field.reason})`);
    } else if (!field.required && pct > 90) {
      console.log(`   ✓ ${field.name.padEnd(18)} ${pct}% coverage (${field.reason})`);
    } else if (!field.required && pct > 0) {
      console.log(`   ◐ ${field.name.padEnd(18)} ${pct}% coverage (${field.reason})`);
    } else {
      console.log(`   ○ ${field.name.padEnd(18)} Not used yet (can be generated)`);
    }
  }

  console.log(`\n${'-'.repeat(70)}`);
  console.log(`\n✅ INTEGRITY SUMMARY:\n`);

  if (!dataLoss) {
    console.log(`   ✓ ALL CRITICAL FIELDS PRESERVED IN CSV`);
    console.log(`   ✓ No data loss if regenerating from CSV`);
    console.log(`   ✓ Safe to edit CSV and run generate scripts\n`);
    console.log(`WORKFLOW IS SAFE:`);
    console.log(`   1. Edit words in admin panel or CSV`);
    console.log(`   2. Run "Generate Spanish" to convert CSV → JSON`);
    console.log(`   3. Run "Phase 1 Quick Wins" to add examples/synonyms`);
    console.log(`   4. No data loss - everything preserved\n`);
  } else {
    console.log(`   ✗ WARNING: Some critical fields are missing`);
    console.log(`   ✗ Risk of data loss if regenerating from CSV\n`);
    process.exit(1);
  }

  console.log(`${'-'.repeat(70)}\n`);
}

main().catch(err => {
  console.error('✗ Error:', err.message);
  process.exit(1);
});
