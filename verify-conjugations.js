#!/usr/bin/env node

/**
 * Verify that conjugations and all data from JSON files are in SQLite database
 */

import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function verifyData() {
  try {
    // Initialize sql.js
    const SQL = await initSqlJs();

    // Load database
    const dbPath = path.join(__dirname, 'VocabApp-App', 'data', 'vocabulary.source.db');
    if (!fs.existsSync(dbPath)) {
      console.error(`❌ Database not found at: ${dbPath}`);
      process.exit(1);
    }

    const fileBuffer = fs.readFileSync(dbPath);
    const db = new SQL.Database(fileBuffer);

    // Load JSON file
    const jsonPath = path.join(__dirname, 'VocabApp-DataPipeline', 'data', 'spanish.json');
    if (!fs.existsSync(jsonPath)) {
      console.error(`❌ JSON file not found at: ${jsonPath}`);
      process.exit(1);
    }

    const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║         JSON vs SQLite Data Verification                  ║');
    console.log('║         Spanish Vocabulary (1000 words)                   ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    // Count verbs with conjugations in JSON
    const jsonVerbsWithConjugations = jsonData.filter(
      w => w.linguistic?.conjugations && Object.keys(w.linguistic.conjugations).length > 0
    );

    console.log(`📊 JSON Data:`);
    console.log(`   Total words: ${jsonData.length}`);
    console.log(`   Verbs with conjugations: ${jsonVerbsWithConjugations.length}`);
    console.log(`   Percentage: ${(jsonVerbsWithConjugations.length / jsonData.length * 100).toFixed(1)}%`);

    // Count words in SQLite
    const countResult = db.exec('SELECT COUNT(*) as c FROM words WHERE language = "spanish"');
    const sqliteCount = countResult[0]?.values[0]?.[0] || 0;

    // Count verbs with conjugations in SQLite
    const conjResult = db.exec(`
      SELECT COUNT(*) as c FROM word_linguistic
      WHERE conjugations IS NOT NULL AND conjugations != '{}'
    `);
    const sqliteConjugations = conjResult[0]?.values[0]?.[0] || 0;

    console.log(`\n📊 SQLite Data:`);
    console.log(`   Total words: ${sqliteCount}`);
    console.log(`   Words with conjugations: ${sqliteConjugations}`);
    console.log(`   Percentage: ${(sqliteConjugations / sqliteCount * 100).toFixed(1)}%`);

    // Check data coverage
    console.log(`\n📋 Data Coverage Comparison:`);

    const coverageChecks = [
      ['Glosses', 'word_glosses'],
      ['Examples', 'word_examples'],
      ['Domains', 'word_domains'],
      ['Tags', 'word_tags'],
      ['Frequency Band', 'word_frequency (band NOT NULL)']
    ];

    for (const [name, table] of coverageChecks) {
      let whereClause = 'WHERE language = "spanish"';
      let query;

      if (table === 'word_frequency (band NOT NULL)') {
        query = `SELECT COUNT(DISTINCT w.id) as c FROM words w
                 LEFT JOIN word_frequency wf ON w.id = wf.word_id
                 ${whereClause} AND wf.band IS NOT NULL`;
      } else {
        query = `SELECT COUNT(DISTINCT w.id) as c FROM words w
                 LEFT JOIN ${table} t ON w.id = t.word_id
                 ${whereClause}`;
      }

      const result = db.exec(query);
      const count = result[0]?.values[0]?.[0] || 0;
      const pct = (count / sqliteCount * 100).toFixed(1);
      console.log(`   ${name}: ${count}/${sqliteCount} (${pct}%)`);
    }

    // Sample specific verbs and compare
    console.log(`\n🔍 Sample Verb Comparison:`);
    console.log(`   (First 3 verbs with conjugations)\n`);

    const sampleVerbs = jsonVerbsWithConjugations.slice(0, 3);

    for (const jsonVerb of sampleVerbs) {
      console.log(`   ${jsonVerb.word.toUpperCase()}`);

      // Find in SQLite
      const stmt = db.prepare(`
        SELECT wl.conjugations, wl.infinitive, wl.reflexive
        FROM words w
        LEFT JOIN word_linguistic wl ON w.id = wl.word_id
        WHERE w.word = ? AND w.language = 'spanish'
      `);
      stmt.bind([jsonVerb.word]);

      if (stmt.step()) {
        const sqlRow = stmt.getAsObject();
        const sqlConjugations = sqlRow.conjugations ? JSON.parse(sqlRow.conjugations) : null;
        const jsonConjugations = jsonVerb.linguistic.conjugations;

        // Check if conjugations match
        const sqlHasConj = sqlConjugations && Object.keys(sqlConjugations).length > 0;
        const jsonHasConj = jsonConjugations && Object.keys(jsonConjugations).length > 0;

        console.log(`     JSON: ${jsonHasConj ? '✓ Has conjugations' : '✗ No conjugations'}`);
        console.log(`     SQL:  ${sqlHasConj ? '✓ Has conjugations' : '✗ No conjugations'}`);

        if (jsonHasConj && sqlHasConj) {
          // Compare conjugation tenses
          const jsonTenses = Object.keys(jsonConjugations).sort();
          const sqlTenses = Object.keys(sqlConjugations).sort();

          console.log(`     JSON tenses: ${jsonTenses.join(', ')}`);
          console.log(`     SQL tenses:  ${sqlTenses.join(', ')}`);

          // Check if they match
          if (JSON.stringify(jsonTenses) === JSON.stringify(sqlTenses)) {
            console.log(`     ✓ Tenses match`);
          } else {
            console.log(`     ✗ Tenses differ!`);
          }
        } else if (jsonHasConj !== sqlHasConj) {
          console.log(`     ⚠️  Mismatch: JSON has conjugations but SQL doesn't (or vice versa)`);
        }
      } else {
        console.log(`     ✗ Word not found in SQLite`);
      }
      stmt.free();
      console.log();
    }

    // Check for any words in JSON that aren't in SQLite
    console.log(`\n🔎 Data Integrity Checks:\n`);

    const missingWords = [];
    for (const jsonWord of jsonData) {
      const result = db.exec(
        'SELECT id FROM words WHERE word = ? AND language = "spanish"',
        [jsonWord.word]
      );
      if (!result[0] || result[0].values.length === 0) {
        missingWords.push(jsonWord.word);
      }
    }

    if (missingWords.length === 0) {
      console.log(`   ✓ All ${jsonData.length} JSON words are in SQLite`);
    } else {
      console.log(`   ✗ ${missingWords.length} words from JSON missing in SQLite:`);
      missingWords.slice(0, 10).forEach(w => console.log(`     - ${w}`));
      if (missingWords.length > 10) {
        console.log(`     ... and ${missingWords.length - 10} more`);
      }
    }

    // Overall status
    console.log(`\n${'='.repeat(60)}`);
    if (sqliteConjugations === jsonVerbsWithConjugations.length && missingWords.length === 0) {
      console.log('✅ All data successfully migrated to SQLite!');
    } else {
      console.log('⚠️  Data migration issues detected:');
      if (sqliteConjugations !== jsonVerbsWithConjugations.length) {
        console.log(`   - Conjugation count mismatch: JSON=${jsonVerbsWithConjugations.length}, SQL=${sqliteConjugations}`);
      }
      if (missingWords.length > 0) {
        console.log(`   - ${missingWords.length} words missing from SQLite`);
      }
    }
    console.log('='.repeat(60) + '\n');

    db.close();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

verifyData();
