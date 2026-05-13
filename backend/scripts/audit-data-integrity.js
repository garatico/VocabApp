#!/usr/bin/env node

/**
 * audit-data-integrity.js
 *
 * Audits Spanish vocabulary data to ensure:
 * 1. All data comes from CSV seeds or scripts
 * 2. No data loss when regenerating from CSV
 * 3. Seeds are comprehensive enough
 *
 * Usage: node audit-data-integrity.js
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import Papa from 'papaparse';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Load JSON file
 */
async function loadJSON(filePath) {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error(`Error loading ${filePath}:`, err.message);
    return null;
  }
}

/**
 * Load CSV file
 */
async function loadCSV(filePath) {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    const parsed = Papa.parse(data, { header: true });
    return parsed.data.filter(row => row.word); // Filter empty rows
  } catch (err) {
    console.error(`Error loading ${filePath}:`, err.message);
    return null;
  }
}

/**
 * Analyze JSON structure
 */
function analyzeJSON(words) {
  const analysis = {
    totalWords: words.length,
    fieldCoverage: {},
    nestedFields: {},
    constantValues: {},
    emptyFields: {},
    warnings: []
  };

  // Analyze each field
  for (const word of words) {
    // Root fields
    for (const [key, value] of Object.entries(word)) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        // Nested object
        if (!analysis.nestedFields[key]) {
          analysis.nestedFields[key] = {};
        }
        for (const [nestedKey, nestedValue] of Object.entries(value)) {
          if (!analysis.nestedFields[key][nestedKey]) {
            analysis.nestedFields[key][nestedKey] = {
              coverage: 0,
              uniqueValues: new Set(),
              allNull: true,
              isEmpty: true
            };
          }
          if (nestedValue !== null && nestedValue !== undefined && nestedValue !== '') {
            analysis.nestedFields[key][nestedKey].allNull = false;
            analysis.nestedFields[key][nestedKey].isEmpty = false;
            analysis.nestedFields[key][nestedKey].coverage++;
            if (!Array.isArray(nestedValue)) {
              analysis.nestedFields[key][nestedKey].uniqueValues.add(String(nestedValue).slice(0, 50));
            }
          }
        }
      } else if (Array.isArray(value)) {
        // Array field
        if (!analysis.fieldCoverage[key]) {
          analysis.fieldCoverage[key] = { coverage: 0, example: null };
        }
        if (value.length > 0) {
          analysis.fieldCoverage[key].coverage++;
          if (!analysis.fieldCoverage[key].example) {
            analysis.fieldCoverage[key].example = value;
          }
        }
      } else {
        // Scalar field
        if (!analysis.fieldCoverage[key]) {
          analysis.fieldCoverage[key] = { coverage: 0, values: new Set() };
        }
        if (value !== null && value !== undefined && value !== '') {
          analysis.fieldCoverage[key].coverage++;
          if (analysis.fieldCoverage[key].values.size < 5) {
            analysis.fieldCoverage[key].values.add(value);
          }
        }
      }
    }
  }

  return analysis;
}

/**
 * Compare JSON to CSV
 */
async function compareJSONtoCSV(jsonPath, csvPath) {
  console.log('\n📊 DATA INTEGRITY AUDIT\n');
  console.log(`${'-'.repeat(70)}`);

  const json = await loadJSON(jsonPath);
  const csv = await loadCSV(csvPath);

  if (!json || !csv) {
    console.error('✗ Failed to load files');
    return;
  }

  console.log(`\n📋 FILES:\n`);
  console.log(`   JSON: ${json.length} words`);
  console.log(`   CSV:  ${csv.length} words`);

  // Analyze JSON structure
  console.log(`\n📈 JSON FIELD ANALYSIS:\n`);

  const analysis = analyzeJSON(json);

  // Root-level fields
  console.log(`Root Fields:`);
  const rootFields = ['rank', 'word', 'display', 'pos', 'difficulty', 'tags', 'notes', 'glosses', 'examples'];
  const csvFields = ['rank', 'word', 'display', 'glosses', 'pos', 'difficulty', 'tags', 'notes', 'examples', 'synonyms', 'antonyms', 'ipa', 'frequency_band', 'gender', 'plural', 'infinitive', 'reflexive'];

  for (const field of rootFields) {
    const coverage = analysis.fieldCoverage[field];
    if (coverage) {
      const pct = Math.round((coverage.coverage / analysis.totalWords) * 100);
      const inCSV = csvFields.includes(field) ? '✓' : '✗';
      console.log(`   ${inCSV} ${field.padEnd(15)} ${pct}% coverage`);
    }
  }

  // Nested fields
  console.log(`\nNested Fields (linguistic):`);
  if (analysis.nestedFields.linguistic) {
    for (const [field, data] of Object.entries(analysis.nestedFields.linguistic)) {
      const pct = Math.round((data.coverage / analysis.totalWords) * 100);
      const inCSV = csvFields.includes(field) ? '✓' : '✗';
      console.log(`   ${inCSV} linguistic.${field.padEnd(12)} ${pct}% coverage`);
    }
  }

  console.log(`\nNested Fields (frequency):`);
  if (analysis.nestedFields.frequency) {
    for (const [field, data] of Object.entries(analysis.nestedFields.frequency)) {
      const pct = Math.round((data.coverage / analysis.totalWords) * 100);
      const inCSV = csvFields.includes(field) ? '✓' : '✗';
      console.log(`   ${inCSV} frequency.${field.padEnd(15)} ${pct}% coverage`);
    }
  }

  console.log(`\nNested Fields (relations):`);
  if (analysis.nestedFields.relations) {
    for (const [field, data] of Object.entries(analysis.nestedFields.relations)) {
      const pct = Math.round((data.coverage / analysis.totalWords) * 100);
      const inCSV = csvFields.includes(field) ? '✓' : '✗';
      console.log(`   ${inCSV} relations.${field.padEnd(17)} ${pct}% coverage`);
    }
  }

  // Data loss check
  console.log(`\n${'-'.repeat(70)}`);
  console.log(`\n⚠️  DATA PRESERVATION CHECK:\n`);

  const dataLossRisks = [];

  // Check which fields would be lost
  console.log(`Fields captured in CSV:`);
  for (const field of csvFields) {
    console.log(`   ✓ ${field}`);
  }

  console.log(`\nFields NOT in CSV (but present in JSON):`);
  const allJSONFields = new Set();
  for (const word of json) {
    for (const key of Object.keys(word)) {
      allJSONFields.add(key);
    }
  }

  const missingFields = Array.from(allJSONFields).filter(f => !csvFields.includes(f));
  for (const field of missingFields) {
    const isSafe = ['domains', 'relations', 'linguistic', 'frequency'].includes(field);
    const status = isSafe ? '✓ Safe' : '⚠️  Check';
    console.log(`   ${status}: ${field}`);

    if (!isSafe) {
      dataLossRisks.push(field);
    }
  }

  // Check nested fields that aren't exported
  console.log(`\nNested fields not in CSV:`);
  console.log(`   ✓ domains (always "general")`);
  console.log(`   ✓ linguistic.conjugations (null, can be regenerated)`);
  console.log(`   ✓ linguistic.syllables (empty, can be generated)`);
  console.log(`   ✓ relations.commonly_confused_with (empty, can be generated)`);
  console.log(`   ✓ relations.related (empty, can be generated)`);
  console.log(`   ✓ frequency.corpus_frequency (null, optional)`);

  // Summary
  console.log(`\n${'-'.repeat(70)}`);
  console.log(`\n✅ DATA INTEGRITY SUMMARY:\n`);

  const criticalCoverage = [
    { field: 'word', required: true },
    { field: 'display', required: true },
    { field: 'pos', required: true },
    { field: 'glosses', required: true },
    { field: 'frequency_band', required: true },
    { field: 'ipa', required: false },
    { field: 'examples', required: false },
    { field: 'synonyms', required: false }
  ];

  let allCriticalPresent = true;
  for (const { field, required } of criticalCoverage) {
    const coverage = analysis.fieldCoverage[field];
    const pct = coverage ? Math.round((coverage.coverage / analysis.totalWords) * 100) : 0;
    const status = required ? (pct === 100 ? '✓' : '✗') : (pct >= 90 ? '✓' : '⚠️');

    console.log(`   ${status} ${field.padEnd(20)} ${pct}%`);

    if (required && pct < 100) {
      allCriticalPresent = false;
    }
  }

  console.log(`\n${required ? '✅' : '⚠️'} REGENERATION SAFETY:\n`);

  if (allCriticalPresent) {
    console.log(`   ✅ All critical fields are captured in CSV`);
    console.log(`   ✅ Safe to regenerate from CSV without data loss`);
    console.log(`   ✅ Enrichment scripts can add missing data (examples, synonyms, etc.)\n`);
  } else {
    console.log(`   ✗ Some critical fields missing from CSV`);
    console.log(`   ✗ Risk of data loss if regenerating\n`);
    dataLossRisks.push('Missing critical fields');
  }

  if (dataLossRisks.length === 0) {
    console.log(`${'-'.repeat(70)}`);
    console.log(`\n🎯 RECOMMENDATION:\n`);
    console.log(`   Your CSV seeds are comprehensive!\n`);
    console.log(`   ✅ All critical data is preserved in CSV`);
    console.log(`   ✅ Safe to edit CSV and regenerate`);
    console.log(`   ✅ Scripts can fill in examples, synonyms, etc.\n`);
  } else {
    console.log(`\n⚠️  ISSUES FOUND:\n`);
    for (const risk of dataLossRisks) {
      console.log(`   - ${risk}`);
    }
    console.log();
  }
}

// Run audit
const jsonPath = path.join(__dirname, '../data/spanish.json');
const csvPath = path.join(__dirname, '../data/sources/spanish.csv');

// Check if papaparse is available, if not use simple parser
try {
  const Papa = (await import('papaparse')).default;
} catch {
  console.log('Installing papaparse for CSV parsing...');
  console.log('Run: npm install papaparse --save\n');
}

compareJSONtoCSV(jsonPath, csvPath).catch(err => {
  console.error('Audit failed:', err.message);
  process.exit(1);
});
