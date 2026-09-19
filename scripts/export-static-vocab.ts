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
 *
 * Loads .env before touching vocab-loader.js, the same as sync-data.ts and
 * index.ts — without it, DATA_DIR is never read and this silently exports
 * whatever is in the local data/ copy instead of the pipeline's live one.
 */

import 'dotenv/config';

import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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

/**
 * The exact envelope written to public/data/vocab-<language>.json — pulled
 * out of main() below so a test can call it directly against an injected
 * test DB (see tests/export-static-vocab.test.js) without main()'s file
 * writes, process.exit, or its dependence on the real DATA_DIR. This is the
 * one function whose output Tauri/Capacitor's packaged builds serve in
 * place of a live /api/vocab/:language — a bug here is invisible to every
 * test that only exercises the Express route, since a packaged build never
 * calls it.
 */
export function buildLanguagePayload(language: string): {
  language: string; count: number;
  metadata: { generatedAt: string; source: string };
  data: ReturnType<typeof loadVocabFile>['words'];
} {
  const vocab = loadVocabFile(language);
  // Same envelope the API sends (routes/public.ts), so the client can treat
  // a static file and a live response identically — see vocab-source.ts.
  return {
    language,
    count:    vocab.words.length,
    metadata: { generatedAt: new Date().toISOString(), source: 'static-export' },
    data:     vocab.words,
  };
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
    const payload = buildLanguagePayload(language);

    const file = `vocab-${language}.json`;
    const json = JSON.stringify(payload);
    fs.writeFileSync(path.join(outDir, file), json, 'utf8');

    const bytes = Buffer.byteLength(json);
    totalBytes += bytes;
    index.push({ language, words: payload.count, file, bytes });

    console.log(
      `  ${language.padEnd(12)} ${String(payload.count).padStart(6)} words  `
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

// Only run when invoked directly (`npm run export:vocab` / `tsx
// scripts/export-static-vocab.ts`), not when a test imports this module for
// buildLanguagePayload — importing used to always run main() too, which
// meant any test touching this file would mkdir/write real files under
// public/data/, query whatever DATA_DIR happens to point at, and
// process.exit(1) if that database had no languages yet. pathToFileURL
// (rather than a manual `file://` + process.argv[1] string) handles
// Windows drive-letter paths and separators the same way Node derived
// import.meta.url itself, so the comparison is exact on every platform.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
