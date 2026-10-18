/**
 * tests/examples-api.test.js
 *
 * Example sentences through the server (schemaVersion 11): each example's English and source reach the client
 * index for index with the sentences, through the compact format too, and a database from before v11 still
 * serves its examples, untranslated.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { buildTestApp, teardownTestApp } from './helpers/app.js';
import { setDb, clearCache } from '../src/server/lib/vocab-loader.js';
import { expandWord } from '../src/shared/vocab/compact-word.js';

function addFrench(db, { v11 }) {
  if (v11) {
    db.exec('ALTER TABLE word_examples ADD COLUMN translation TEXT');
    db.exec('ALTER TABLE word_examples ADD COLUMN source TEXT');
  }
  const word = db.prepare("INSERT INTO words (word, translation, language, pos, rank) VALUES ('maison', 'house', 'french', 'noun', 1)").run();
  db.prepare("INSERT INTO word_glosses (word_id, gloss, position) VALUES (?, 'house', 0)").run(word.lastInsertRowid);
  const rows = [['La maison est grande.', 'The house is big.', null], ['Ma maison.', 'My house.', 'tatoeba:42']];
  rows.forEach(([ex, tr, src], i) => {
    if (v11) db.prepare('INSERT INTO word_examples (word_id, example, position, translation, source) VALUES (?,?,?,?,?)').run(word.lastInsertRowid, ex, i, tr, src);
    else db.prepare('INSERT INTO word_examples (word_id, example, position) VALUES (?,?,?)').run(word.lastInsertRowid, ex, i);
  });
  clearCache();
  setDb(db);
}

describe('a schemaVersion 11 database', () => {
  let app, db;
  beforeAll(() => { ({ app, db } = buildTestApp()); addFrench(db, { v11: true }); });
  afterAll(() => teardownTestApp(db));

  it('sends each example with its English and source, index for index', async () => {
    const res = await request(app).get('/api/vocab/french');
    const w = res.body.data.find(x => x.word === 'maison');
    expect(w.examples).toEqual(['La maison est grande.', 'Ma maison.']);
    expect(w.example_translations).toEqual(['The house is big.', 'My house.']);
    expect(w.example_sources).toEqual([null, 'tatoeba:42']);
  });

  it('keeps them through the compact format', async () => {
    const full    = await request(app).get('/api/vocab/french');
    const compact = await request(app).get('/api/vocab/french?compact=1');
    expect(compact.body.data.map(w => expandWord(w))).toEqual(full.body.data);
  });
});

describe('a database from before schemaVersion 11', () => {
  let app, db;
  beforeAll(() => { ({ app, db } = buildTestApp()); addFrench(db, { v11: false }); });
  afterAll(() => teardownTestApp(db));

  it('still serves the examples, with no translations or sources', async () => {
    const res = await request(app).get('/api/vocab/french');
    const w = res.body.data.find(x => x.word === 'maison');
    expect(w.examples).toEqual(['La maison est grande.', 'Ma maison.']);
    expect(w).not.toHaveProperty('example_translations');
    expect(w).not.toHaveProperty('example_sources');
  });
});
