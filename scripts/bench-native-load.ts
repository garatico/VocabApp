/**
 * bench-native-load.ts — what loading one language costs in each packaged app, measured in Node as a proxy.
 *
 *   npx tsx scripts/bench-native-load.ts [language]
 *
 * Android reads a bundled file: the whole-language JSON (`vocab-<lang>.json`) or the compact JSONL. The
 * Windows app reads data/vocabulary.db over Tauri's IPC, which sends every row as JSON: as an object per row
 * (tauri-plugin-sql's select) or as one array per row (columns sent once). The sizes are what crosses that
 * boundary; the parse times are V8's, so a phone is several times slower than this machine.
 */
import path from 'node:path';
import Database from 'better-sqlite3';
import { buildLanguagePayload, buildJsonl } from './export-static-vocab.js';
import { buildWordSelectSql } from '../src/shared/vocab/word-select.js';
import { expandWord } from '../src/shared/vocab/compact-word.js';

const lang = process.argv[2] ?? 'spanish';
const mb = (n: number): string => `${(n / 1048576).toFixed(1)} MB`;
function time<T>(fn: () => T): [T, number] {
  const t = performance.now();
  const out = fn();
  return [out, performance.now() - t];
}

const whole = JSON.stringify(buildLanguagePayload(lang));
const [, wholeMs] = time(() => JSON.parse(whole));
const { jsonl } = buildJsonl(lang);
const [, jsonlMs] = time(() => jsonl.split('\n').filter(Boolean).map(l => expandWord(JSON.parse(l))));
const firstLines = jsonl.split('\n').slice(0, 200).join('\n');
console.log(`Android  whole JSON  ${mb(whole.length).padStart(8)}  parse ${wholeMs.toFixed(0)} ms (nothing shows until all of it is in)`);
console.log(`Android  JSONL       ${mb(jsonl.length).padStart(8)}  parse ${jsonlMs.toFixed(0)} ms (first 200 words after ${mb(firstLines.length)})`);

const db = new Database(path.resolve(import.meta.dirname, '..', 'data', 'vocabulary.db'), { readonly: true });
const sql = `${buildWordSelectSql({ hasDisambiguator: true, hasIsFunctionWord: true, hasGrammaticalNumber: true })}
  WHERE w.language = ? ORDER BY COALESCE(w.rank, 9999), w.word`;
const [rows, queryMs] = time(() => db.prepare(sql).all(lang) as Record<string, unknown>[]);
const objects = JSON.stringify(rows);
const columns = Object.keys(rows[0] ?? {});
const arrays = JSON.stringify({ columns, rows: rows.map(r => columns.map(c => r[c])) });
const [, objMs] = time(() => JSON.parse(objects));
const [, arrMs] = time(() => JSON.parse(arrays));
console.log(`Windows  query ${rows.length} rows in ${queryMs.toFixed(0)} ms (SQLite alone)`);
console.log(`Windows  rows as objects ${mb(objects.length).padStart(8)}  parse ${objMs.toFixed(0)} ms`);
console.log(`Windows  rows as arrays  ${mb(arrays.length).padStart(8)}  parse ${arrMs.toFixed(0)} ms`);
