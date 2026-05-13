#!/usr/bin/env node

/**
 * enrich-quick-wins.js
 *
 * Phase 1 Quick Wins: Rules-based vocabulary enrichment
 * Improves coverage by ~50% without API calls
 *
 * Enrichments:
 * 1. Generate synonyms/antonyms programmatically
 * 2. Expand IPA pronunciation with phonetic rules
 * 3. Add register variations (formal/informal)
 * 4. Create example templates
 *
 * Usage: node enrich-quick-wins.js [language] [output-file]
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// Import enrichment utilities
import { enrichWordRelations } from './utils/synonym-generator.js';
import { enrichWordIPA } from './utils/ipa-expander.js';
import { enrichWordWithRegister } from './utils/register-generator.js';
import { enrichWordComplete } from './utils/example-generator.js';
import { enrichWordWithDomain } from './utils/domain-generator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuration
const LANGUAGES = ['spanish', 'portuguese', 'italian', 'french'];
const DEFAULT_LANGUAGE = process.argv[2] || 'spanish';
const OUTPUT_SUFFIX = process.argv[3] || '.enriched';

// Statistics tracking
let stats = {
  totalWords: 0,
  wordsWithNewSynonyms: 0,
  wordsWithNewIPA: 0,
  wordsWithNewRegister: 0,
  wordsWithNewExamples: 0,
  fieldsCovered: {}
};

/**
 * Load vocabulary from JSON file
 */
async function loadVocabulary(language) {
  const vocabPath = path.join(__dirname, '../data', `${language}.json`);

  try {
    const data = await fs.readFile(vocabPath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error(`✗ Failed to load ${language}.json:`, err.message);
    process.exit(1);
  }
}

/**
 * Save enriched vocabulary
 */
async function saveVocabulary(language, words) {
  const vocabPath = path.join(__dirname, '../data', `${language}.json`);

  try {
    await fs.writeFile(vocabPath, JSON.stringify(words, null, 2), 'utf8');
    console.log(`✓ Saved enriched ${language}.json (${words.length} words)`);
  } catch (err) {
    console.error(`✗ Failed to save ${language}.json:`, err.message);
    throw err;
  }
}

/**
 * Count coverage metrics
 */
function countCoverageMetrics(word) {
  const metrics = {
    examples: word.examples?.length > 0,
    synonyms: word.relations?.synonyms?.length > 0,
    antonyms: word.relations?.antonyms?.length > 0,
    ipa: word.linguistic?.ipa && word.linguistic.ipa !== '',
    notes: word.notes && word.notes !== '',
    registers: word.linguistic?.registers ? Object.keys(word.linguistic.registers).length > 0 : false
  };

  return metrics;
}

/**
 * Generate before/after comparison
 */
function compareMetrics(before, after) {
  const comparison = {};

  for (const key in before) {
    const wasPresent = before[key];
    const isPresent = after[key];
    comparison[key] = {
      before: wasPresent ? 'yes' : 'no',
      after: isPresent ? 'yes' : 'no',
      improved: isPresent && !wasPresent
    };
  }

  return comparison;
}

/**
 * Main enrichment function
 */
async function enrichVocabulary(language) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Phase 1 Quick Wins Enrichment: ${language.toUpperCase()}`);
  console.log(`${'='.repeat(60)}\n`);

  // Load vocabulary
  console.log('📚 Loading vocabulary...');
  const words = await loadVocabulary(language);
  stats.totalWords = words.length;

  console.log(`✓ Loaded ${words.length} words\n`);

  // Process each word
  console.log('⚙️  Applying enrichment rules...');
  const enrichedWords = words.map((word, index) => {
    // Show progress every 100 words
    if ((index + 1) % 100 === 0) {
      process.stdout.write(`  Processing: ${index + 1}/${words.length} words\r`);
    }

    const before = countCoverageMetrics(word);
    let enriched = { ...word };

    // Apply enrichments in order
    enriched = enrichWordRelations(enriched);
    enriched = enrichWordIPA(enriched);
    enriched = enrichWordWithRegister(enriched);
    enriched = enrichWordComplete(enriched);
    enriched = enrichWordWithDomain(enriched);

    const after = countCoverageMetrics(enriched);
    const comparison = compareMetrics(before, after);

    // Track improvements
    if (comparison.synonyms.improved) stats.wordsWithNewSynonyms++;
    if (comparison.ipa.improved) stats.wordsWithNewIPA++;
    if (comparison.registers.improved) stats.wordsWithNewRegister++;
    if (comparison.examples.improved) stats.wordsWithNewExamples++;

    return enriched;
  });

  console.log(`\n✓ Enrichment complete\n`);

  // Save enriched vocabulary
  console.log('💾 Saving enriched vocabulary...');
  await saveVocabulary(language, enrichedWords);

  // Generate report
  console.log(`\n${'─'.repeat(60)}`);
  console.log('📊 ENRICHMENT REPORT');
  console.log(`${'─'.repeat(60)}\n`);

  const coverage = {
    synonyms: Math.round((enrichedWords.filter(w => w.relations?.synonyms?.length > 0).length / enrichedWords.length) * 100),
    examples: Math.round((enrichedWords.filter(w => w.examples?.length > 0).length / enrichedWords.length) * 100),
    ipa: Math.round((enrichedWords.filter(w => w.linguistic?.ipa && w.linguistic.ipa !== '').length / enrichedWords.length) * 100),
    registers: Math.round((enrichedWords.filter(w => w.linguistic?.registers).length / enrichedWords.length) * 100),
  };

  console.log(`📈 Coverage Improvements:`);
  console.log(`   Synonyms:      ${coverage.synonyms}% of words`);
  console.log(`   Examples:      ${coverage.examples}% of words`);
  console.log(`   IPA:           ${coverage.ipa}% of words`);
  console.log(`   Registers:     ${coverage.registers}% of words`);

  console.log(`\n📌 Words Improved:`);
  console.log(`   New synonyms:  ${stats.wordsWithNewSynonyms} words`);
  console.log(`   New IPA:       ${stats.wordsWithNewIPA} words`);
  console.log(`   New registers: ${stats.wordsWithNewRegister} words`);
  console.log(`   New examples:  ${stats.wordsWithNewExamples} words`);

  const totalImproved = stats.wordsWithNewSynonyms + stats.wordsWithNewIPA + stats.wordsWithNewRegister + stats.wordsWithNewExamples;
  console.log(`\n✅ Total improvements: ${totalImproved} word enrichments\n`);

  console.log(`${'─'.repeat(60)}\n`);

  return {
    language,
    wordsEnriched: words.length,
    coverage,
    improvements: stats
  };
}

/**
 * Process multiple languages
 */
async function enrichAllLanguages() {
  const results = [];

  for (const lang of LANGUAGES) {
    try {
      const result = await enrichVocabulary(lang);
      results.push(result);
    } catch (err) {
      console.error(`\n✗ Error enriching ${lang}:`, err.message);
    }
  }

  return results;
}

/**
 * Main execution
 */
async function main() {
  try {
    const startTime = Date.now();

    if (DEFAULT_LANGUAGE === 'all') {
      // Enrich all languages
      await enrichAllLanguages();
    } else if (!LANGUAGES.includes(DEFAULT_LANGUAGE)) {
      console.error(`\n✗ Invalid language: ${DEFAULT_LANGUAGE}`);
      console.error(`   Supported: ${LANGUAGES.join(', ')}, all`);
      process.exit(1);
    } else {
      // Enrich single language
      await enrichVocabulary(DEFAULT_LANGUAGE);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`⏱️  Total time: ${elapsed}s\n`);

  } catch (err) {
    console.error('\n✗ Fatal error:', err.message);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { enrichVocabulary, enrichAllLanguages }; (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { enrichVocabulary, enrichAllLanguages };
 (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { enrichVocabulary, enrichAllLanguages };
