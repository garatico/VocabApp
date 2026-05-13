#!/usr/bin/env node

/**
 * export-to-csv.js
 *
 * Export vocabulary JSON to CSV format for seed data
 * Creates editable source files that can be regenerated with generate-from-csv.js
 *
 * Usage: node export-to-csv.js [language]
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const LANGUAGES = ['spanish', 'portuguese', 'italian', 'french'];
const DEFAULT_LANGUAGE = process.argv[2] || 'spanish';

/**
 * Load vocabulary from JSON
 */
async function loadVocabulary(language) {
  const vocabPath = path.join(__dirname, '../data', `${language}.json`);

  try {
    const data = await fs.readFile(vocabPath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error(`✗ Failed to load ${language}.json:`, err.message);
    return [];
  }
}

/**
 * Convert array to CSV-safe string (escape quotes and handle commas)
 */
function escapeCsvValue(value) {
  if (value === null || value === undefined) {
    return '';
  }

  const str = String(value);

  // If contains comma, quote, or newline, wrap in quotes and escape internal quotes
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

/**
 * Join array values with pipe separator
 */
function joinArrayField(arr) {
  if (!Array.isArray(arr) || arr.length === 0) {
    return '';
  }
  return arr.join('|');
}

/**
 * Export vocabulary to CSV
 */
async function exportToCSV(language) {
  console.log(`\n📊 Exporting ${language} vocabulary to CSV...\n`);

  const words = await loadVocabulary(language);

  if (words.length === 0) {
    console.error(`✗ No words found for ${language}`);
    return;
  }

  // CSV Headers
  const headers = [
    'rank',
    'word',
    'display',
    'glosses',
    'pos',
    'tags',
    'notes',
    'examples',
    'synonyms',
    'antonyms',
    'ipa',
    'frequency_band',
    'domains',
    'gender',
    'plural',
    'infinitive',
    'reflexive'
  ];

  const rows = [headers];

  // Convert each word to CSV row
  for (const word of words) {
    const row = [
      escapeCsvValue(word.rank || ''),
      escapeCsvValue(word.word),
      escapeCsvValue(word.display || ''),
      escapeCsvValue(joinArrayField(word.glosses || [])),
      escapeCsvValue(word.pos || 'noun'),
      escapeCsvValue(joinArrayField(word.tags || [])),
      escapeCsvValue(word.notes || ''),
      escapeCsvValue(joinArrayField(word.examples || [])),
      escapeCsvValue(joinArrayField(word.relations?.synonyms || [])),
      escapeCsvValue(joinArrayField(word.relations?.antonyms || [])),
      escapeCsvValue(word.linguistic?.ipa || ''),
      escapeCsvValue(word.frequency?.band || 'A1'),
      escapeCsvValue(joinArrayField(word.domains || ['General'])),
      escapeCsvValue(word.linguistic?.gender || ''),
      escapeCsvValue(word.linguistic?.plural || ''),
      escapeCsvValue(word.linguistic?.infinitive || ''),
      escapeCsvValue(word.linguistic?.reflexive || '')
    ];

    rows.push(row);
  }

  // Create CSV content
  const csv = rows.map(row => row.join(',')).join('\n');

  // Write to file
  const outputDir = path.join(__dirname, '../data/sources');
  const outputFile = path.join(outputDir, `${language}.csv`);

  try {
    // Ensure directory exists
    await fs.mkdir(outputDir, { recursive: true });

    // Write CSV file
    await fs.writeFile(outputFile, csv, 'utf8');

    console.log(`✓ Exported ${words.length} words to ${outputFile}`);
    console.log(`\n📋 CSV Format:`);
    console.log(`   - Headers: ${headers.length} columns`);
    console.log(`   - Rows: ${words.length} words`);
    console.log(`   - Array fields (glosses, tags, examples, etc.) use pipe separator: value1|value2|value3`);
    console.log(`   - Text fields with commas/quotes automatically escaped\n`);
  } catch (err) {
    console.error(`✗ Failed to write CSV:`, err.message);
  }
}

/**
 * Export all languages
 */
async function exportAll() {
  for (const lang of LANGUAGES) {
    await exportToCSV(lang);
  }
}

/**
 * Main
 */
async function main() {
  if (DEFAULT_LANGUAGE === 'all') {
    await exportAll();
  } else if (!LANGUAGES.includes(DEFAULT_LANGUAGE)) {
    console.error(`\n✗ Invalid language: ${DEFAULT_LANGUAGE}`);
    console.error(`   Supported: ${LANGUAGES.join(', ')}, all\n`);
  } else {
    await exportToCSV(DEFAULT_LANGUAGE);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { exportToCSV };
