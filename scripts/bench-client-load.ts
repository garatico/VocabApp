/**
 * bench-client-load.ts — how long the client spends turning a whole language's
 * vocabulary response into the in-memory Word[] (parse, expandWord, derived
 * tenses), measured in Node against the running dev API.
 *
 *   npx tsx scripts/bench-client-load.ts [language ...]
 *
 * Not part of any build or test: a measuring stick for load-time work.
 */
import { expandWord } from '../src/shared/vocab/compact-word.ts';
import { enrichDerivedTenses } from '../src/client/data/derived-tenses.ts';
import type { Word } from '../src/client/types.ts';

const API = process.env['API'] ?? 'http://localhost:3000';
const langs = process.argv.slice(2).length ? process.argv.slice(2) : ['spanish', 'italian', 'german'];

for (const lang of langs) {
  const body = await (await fetch(`${API}/api/vocab/${lang}?compact=1`)).text();
  const t0 = performance.now();
  const json = JSON.parse(body) as { data: Word[] };
  const t1 = performance.now();
  const words = json.data.map(w => expandWord(w));
  const t2 = performance.now();
  enrichDerivedTenses(lang, words);
  const t3 = performance.now();
  console.log(`${lang.padEnd(11)} ${String(words.length).padStart(6)} words  ${(body.length / 1e6).toFixed(1)} MB  `
    + `parse ${(t1 - t0).toFixed(0)} ms  expand ${(t2 - t1).toFixed(0)} ms  derived tenses ${(t3 - t2).toFixed(0)} ms`);
}
