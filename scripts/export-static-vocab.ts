/**
 * export-static-vocab.ts — dump the vocabulary to static JSON.
 *
 * This is the prerequisite for running without a server: Tauri on Windows and
 * Capacitor on Android both ship static files and have no Node process to
 * answer /api/vocab/:lang.
 *
 * Deliberately written in Node rather than added to the Python pipeline. The
 * server computes Spanish conjugations at load time from verb-rules.ts, so
 * reusing loadVocabFile() is the only way to guarantee the static file is
 * byte-identical to what the API would have returned. A Python reimplementation
 * would be a second conjugation engine to keep in sync — the exact mistake
 * this codebase has already made twice.
 *
 *   npm run export:vocab
 *
 * Output: public/data/vocab-<language>.json plus an index.json manifest.
 * Vite copies public/ into dist/, so the files land at /data/ in every build.
 */

import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadVocabFile, getSupportedLanguages, closeDatabase }
  from '../src/server/lib/vocab-loader.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir      = path.join(projectRoot, 'public', 'data');

interface IndexEntry {
  language: string;
  words:    number;
  file:     string;
  bytes:    number;
}

function main(): void {
  fs.mkdirSync(outDir, { recursive: true });

  const languages = getSupportedLanguages();
  if (languages.length === 0) {
    console.error('No languages in the database. Run `npm run data:sync` first.');
    process.exit(1);
  }

  const index: IndexEntry[] = [];
  let totalBytes = 0;

  for (const language of languages) {
    const vocab = loadVocabFile(language);

    // Same envelope the API sends, so the client can treat a static file and
    // a live response identically.
    const payload = {
      language,
      count:    vocab.words.length,
      metadata: { generatedAt: new Date().toISOString(), source: 'static-export' },
      data:     vocab.words,
    };

    const file = `vocab-${language}.json`;
    const json = JSON.stringify(payload);
    fs.writeFileSync(path.join(outDir, file), json, 'utf8');

    const bytes = Buffer.byteLength(json);
    totalBytes += bytes;
    index.push({ language, words: vocab.words.length, file, bytes });

    console.log(
      `  ${language.padEnd(12)} ${String(vocab.words.length).padStart(6)} words  `
      + `${(bytes / 1048576).toFixed(2)} MB  -> public/data/${file}`,
    );
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    languages:   index,
  };
  fs.writeFileSync(
    path.join(outDir, 'index.json'), JSON.stringify(manifest, null, 2), 'utf8',
  );

  console.log(
    `\n  ${index.length} languages, `
    + `${index.reduce((n, e) => n + e.words, 0).toLocaleString()} words, `
    + `${(totalBytes / 1048576).toFixed(2)} MB total`,
  );
  console.log('  Manifest: public/data/index.json');

  closeDatabase();
}

main();
