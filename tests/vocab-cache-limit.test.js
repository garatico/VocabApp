/**
 * VOCAB_CACHE_MAX_LANGUAGES — the loader keeps at most that many languages in memory.
 * Without a limit all of them stay loaded (~230 MB for the full database), which a 512 MB host
 * can't give Node: it exits 134, "JavaScript heap out of memory". With one, the least recently
 * used language is dropped and simply re-read from SQLite when it is asked for again.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { createTestDb } from './helpers/db.js';
import { setDb, clearCache, reloadDb, loadVocabFile, getDbInfo } from '../src/server/lib/vocab-loader.js';

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
