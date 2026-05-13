#!/usr/bin/env node

/**
 * generate-from-csv.js
 *
 * Converts CSV seed files into JSON vocabulary files
 * Used by build system to regenerate vocabulary from source CSVs
 *
 * Usage: node generate-from-csv.js [language]
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LANGUAGES = ['spanish', 'portuguese', 'italian', 'french'];
const DEFAULT_LANGUAGE = process.argv[2] || 'spanish';

/**
 * Simple CSV parser
 */
function parseCSV(csvContent) {
  const lines = csvContent.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim());
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    // Simple CSV parsing (handles quoted fields)
    const row = {};
    let current = '';
    let inQuotes = false;
    let colIndex = 0;

    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      const nextChar = line[j + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          current += '"';
          j++; // Skip next quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        row[headers[colIndex]?.trim()] = current.trim();
        current = '';
        colIndex++;
      } else {
        current += char;
      }
    }
    row[headers[colIndex]?.trim()] = current.trim();
    rows.push(row);
  }

  return rows;
}

/**
 * Convert CSV row to word object
 */
function csvRowToWord(row) {
  const word = {
    rank: parseInt(row.rank) || 0,
    word: row.word || '',
    display: row.display || row.word || '',
    pos: row.pos || 'noun',
    difficulty: parseInt(row.difficulty) || 1,
    tags: row.tags ? row.tags.split('|').map(t => t.trim()).filter(t => t) : [],
    notes: row.notes || '',
    glosses: row.glosses ? row.glosses.split('|').map(g => g.trim()).filter(g => g) : [],
    examples: row.examples ? row.examples.split('|').map(e => e.trim()).filter(e => e) : [],

    linguistic: {
      infinitive: row.infinitive || null,
      reflexive: row.reflexive ? row.reflexive.toLowerCase() === 'true' : null,
      gender: row.gender || null,
      plural: row.plural || null,
      register: 'neutral',
      ipa: row.ipa || '',
      syllables: [],
      conjugations: null
    },

    relations: {
      commonly_confused_with: [],
      related: [],
      synonyms: row.synonyms ? row.synonyms.split('|').map(s => s.trim()).filter(s => s) : [],
      antonyms: row.antonyms ? row.antonyms.split('|').map(a => a.trim()).filter(a => a) : []
    },

    frequency: {
      band: row.frequency_band || 'A1',
      rank: parseInt(row.rank) || 0,
      corpus_frequency: null
    },

    domains: row.domains
      ? row.domains.split('|').map(d => d.trim()).filter(d => d)
      : ['General']
  };

  return word;
}

/**
 * Generate vocabulary from CSV
 */
async function generateFromCSV(language) {
  const csvPath = path.join(__dirname, '../data/sources', `${language}.csv`);
  const jsonPath = path.join(__dirname, '../data', `${language}.json`);

  try {
    console.log(`\n📖 Generating ${language} vocabulary from CSV...\n`);

    // Read CSV
    const csvContent = await fs.readFile(csvPath, 'utf8');
    const rows = parseCSV(csvContent);

    if (rows.length === 0) {
      console.error(`✗ No data found in CSV`);
      return;
    }

    // Convert to words
    const words = rows
      .filter(row => row.word && row.word.trim())
      .map(csvRowToWord)
      .sort((a, b) => a.rank - b.rank);

    // Write JSON
    await fs.writeFile(jsonPath, JSON.stringify(words, null, 2), 'utf8');

    console.log(`✓ Generated ${words.length} words`);
    console.log(`✓ Saved to ${language}.json\n`);

    return words;
  } catch (err) {
    console.error(`✗ Error: ${err.message}\n`);
    throw err;
  }
}

/**
 * Main
 */
async function main() {
  if (!LANGUAGES.includes(DEFAULT_LANGUAGE)) {
    console.error(`\n✗ Invalid language: ${DEFAULT_LANGUAGE}`);
    console.error(`   Supported: ${LANGUAGES.join(', ')}\n`);
    process.exit(1);
  }

  try {
    await generateFromCSV(DEFAULT_LANGUAGE);
  } catch (err) {
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { generateFromCSV };
