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
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { compactWord } from '../src/shared/vocab/compact-word.js';
import { loadVocabFile, getSupportedLanguages, closeDatabase, clearCache }
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

/**
 * One language as JSONL: a word per line, in rank order (loadVocabFile's own:
 * rank, then word), so a client can start parsing while the file is still
 * downloading and show the most frequent words first. No envelope — the count
 * lives in the manifest next to it. Each word is compacted (see compact-word.ts);
 * the client's parser expands it back.
 */
export function buildJsonl(language: string): { jsonl: string; count: number } {
  const { data, count } = buildLanguagePayload(language);
  const NL = String.fromCharCode(10);
  return { jsonl: data.map(w => JSON.stringify(compactWord(w))).join(NL) + (data.length ? NL : ''), count };
}

/** What a previous export (or a stale `public/data` that vite copied in) leaves in `<dir>/data`. */
export const OWNED_FILE = /^(?:[a-z-]+\.jsonl|index\.json|vocab-[a-z-]+\.json|asset-manifest\.json)$/;

/**
 * `--static <dir> [language …]` — writes `<dir>/data/<language>.jsonl` plus the
 * same `index.json` manifest the full export writes, for the static-only web
 * build (`npm run build:static`, which points <dir> at dist/ *after* vite has
 * emptied it). Nothing lands in public/ or anywhere else in the repo tree, so
 * a stale export can never be copied into a later build.
 *
 * It only ever deletes plain files whose names it or the full export produce
 * (OWNED_FILE), never the directory, so pointing it at the wrong place (`.`, the
 * repo root) cannot take a database or an images folder with it. The languages
 * are checked before anything on disk is touched.
 */
function mainStatic(dir: string, only: string[]): void {
  const dataDir = path.join(path.resolve(dir), 'data');

  const available = getSupportedLanguages();
  const languages = only.length ? only : available;
  const unknown   = languages.filter(l => !available.includes(l));
  if (languages.length === 0 || unknown.length) {
    console.error(languages.length === 0
      ? 'No languages in the database. Run `npm run data:sync` first.'
      : `Not in the database: ${unknown.join(', ')}`);
    process.exit(1);
  }

  fs.mkdirSync(dataDir, { recursive: true });
  for (const entry of fs.readdirSync(dataDir, { withFileTypes: true })) {
    if (entry.isFile() && OWNED_FILE.test(entry.name)) fs.rmSync(path.join(dataDir, entry.name));
  }

  const index: IndexEntry[] = [];
  const dataHash = crypto.createHash('sha256');
  for (const language of languages) {
    const { jsonl, count } = buildJsonl(language);
    const file = `${language}.jsonl`;
    fs.writeFileSync(path.join(dataDir, file), jsonl, 'utf8');
    dataHash.update(jsonl);
    const bytes = Buffer.byteLength(jsonl);
    index.push({ language, words: count, file, bytes });
    console.log(`  ${language.padEnd(12)} ${String(count).padStart(6)} words  ${(bytes / 1048576).toFixed(2)} MB  -> ${path.join(dir, 'data', file)}`);
  }
  fs.writeFileSync(
    path.join(dataDir, 'index.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), languages: index }, null, 2),
    'utf8',
  );
  stampServiceWorker(path.resolve(dir), dataHash.digest('hex').slice(0, 10));
  closeDatabase();
}

/**
 * The service worker serves /data/ stale-while-revalidate and names its caches
 * after CACHE_VERSION, which vite derives from the *code* it bundled. A deploy
 * that changes only the vocabulary would keep the same version, so returning
 * visitors would keep the old words. This runs after vite, so it appends a hash
 * of the data to the version already stamped into dist/sw.js (replacing a
 * suffix from an earlier run rather than stacking another one).
 */
export function stampServiceWorker(distDir: string, dataId: string): void {
  const swPath = path.join(distDir, 'sw.js');
  if (!fs.existsSync(swPath)) return;
  const sw = fs.readFileSync(swPath, 'utf8');
  const re = /(const CACHE_VERSION = ')([^']*?)(?:-d[0-9a-f]{10})?(';)/;
  if (!re.test(sw)) return;
  fs.writeFileSync(swPath, sw.replace(re, (_m, a: string, id: string, z: string) => `${a}${id}-d${dataId}${z}`), 'utf8');
}

function main(): void {
  const staticAt = process.argv.indexOf('--static');
  if (staticAt !== -1) {
    const [dir, ...only] = process.argv.slice(staticAt + 1);
    if (!dir) { console.error('--static needs an output directory, e.g. --static dist'); process.exit(1); }
    return mainStatic(dir, only);
  }

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

    // This language is on disk now. loadVocabFile() keeps every language it has
    // loaded, so without this the whole database sits in memory by the last one —
    // over 256 MB for 180,000 words, which is more heap than a small host's build
    // step gets (Node exits 134, "JavaScript heap out of memory").
    clearCache(language);
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
