/**
 * VOCAB_CACHE_MAX_LANGUAGES — the loader keeps at most that many languages in memory.
 * Without a limit all of them stay loaded (~230 MB for the full database), which a 512 MB host
 * can't give Node: it exits 134, "JavaScript heap out of memory". With one, the least recently
 * used language is dropped and simply re-read from SQLite when it is asked for again.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { createTestDb } from './helpers/db.js';
import { setDb, clearCache, reloadDb, loadVocabFile, getDbInfo, preloadAll } from '../src/server/lib/vocab-loader.js';

let db;
beforeEach(() => {
  clearCache();
  db = createTestDb();
  for (const lang of ['french', 'german']) {
    db.prepare('INSERT INTO words (word, translation, language, pos, rank) VALUES (?, ?, ?, ?, ?)')
      .run(`${lang}-w`, `${lang}-w`, lang, 'noun', 1);
  }
  setDb(db);
});
afterEach(() => {
  delete process.env.VOCAB_CACHE_MAX_LANGUAGES;
  delete process.env.VOCAB_CACHE_MAX_WORDS;
  if (db?.open) db.close();
  reloadDb();
});

const cached = () => getDbInfo().cachedLanguages;

describe('vocab cache limit', () => {
  it('keeps every language loaded when no limit is set', () => {
    ['spanish', 'portuguese', 'french', 'german'].forEach(l => loadVocabFile(l));
    expect(cached()).toBe(4);
  });

  it('drops the least recently used language past the limit', () => {
    process.env.VOCAB_CACHE_MAX_LANGUAGES = '2';
    loadVocabFile('spanish');
    loadVocabFile('french');
    loadVocabFile('spanish');          // spanish is now the most recently used
    loadVocabFile('german');           // evicts french, not spanish
    expect(cached()).toBe(2);
    const loaded = getDbInfo().languages ?? [];
    const names = JSON.stringify(loaded);
    expect(names).toContain('spanish');
    expect(names).toContain('german');
    expect(names).not.toContain('french');
  });

  it('serves an evicted language again by re-reading it', () => {
    process.env.VOCAB_CACHE_MAX_LANGUAGES = '1';
    expect(loadVocabFile('french').words.length).toBe(1);
    loadVocabFile('german');
    expect(loadVocabFile('french').words.length).toBe(1);
    expect(cached()).toBe(1);
  });
});

/**
 * Without VOCAB_CACHE_MAX_LANGUAGES set (a host created by hand ignores render.yaml, and the server then
 * preloaded all eight languages and died with exit 134), the cache sizes itself from Node's heap limit.
 * VOCAB_CACHE_MAX_WORDS overrides that number, which is what these use.
 */
describe('vocab cache word budget', () => {
  const spanishWords = () => { const n = loadVocabFile('spanish').words.length; clearCache(); return n; };

  it('evicts the least recently used language when the words no longer fit', () => {
    const n = spanishWords();
    process.env.VOCAB_CACHE_MAX_WORDS = String(n);          // room for spanish alone
    loadVocabFile('spanish');
    loadVocabFile('french');                                // n + 1 words > n
    const names = JSON.stringify(getDbInfo().languages ?? []);
    expect(cached()).toBe(1);
    expect(names).toContain('french');
    expect(names).not.toContain('spanish');
  });

  it('still serves a language bigger than the whole budget — it just stays alone', () => {
    process.env.VOCAB_CACHE_MAX_WORDS = '1';
    expect(loadVocabFile('spanish').words.length).toBeGreaterThan(1);
    expect(cached()).toBe(1);
    loadVocabFile('french');
    expect(cached()).toBe(1);
  });

  it('preloads Spanish first and only what fits, leaving the rest for the first request', async () => {
    const n = spanishWords();
    process.env.VOCAB_CACHE_MAX_WORDS = String(n + 1);      // spanish + one single-word language
    const results = await preloadAll();
    expect(results.map(r => r.language)).toEqual(['spanish', 'french']);   // german (n + 2) does not fit
    expect(cached()).toBe(2);
    expect(loadVocabFile('german').words.length).toBe(1);   // ...and is still served on demand
  });

  it('with a roomy budget (or none configured on a big machine) preloads everything, as before', async () => {
    process.env.VOCAB_CACHE_MAX_WORDS = '1000000';
    const results = await preloadAll();
    expect(results.length).toBe(4);                         // spanish, portuguese, french, german in the test DB
    expect(cached()).toBe(4);
  });
});
