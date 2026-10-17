/**
 * tests/russian-api.test.js
 *
 * Russian through the server: the optional `stressed` column (schemaVersion 10) reaches the client as
 * linguistic.stressed, survives the compact wire format, and a database built before the column existed
 * still serves Russian, just without stress marks.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { buildTestApp, teardownTestApp } from './helpers/app.js';
import { setDb, clearCache } from '../src/server/lib/vocab-loader.js';
import { expandWord } from '../src/shared/vocab/compact-word.js';

function addRussian(db, { withStressed }) {
  if (withStressed) db.exec('ALTER TABLE words ADD COLUMN stressed TEXT');
  const cols = withStressed ? 'word, translation, language, pos, rank, stressed' : 'word, translation, language, pos, rank';
  const vals = withStressed ? '?, ?, ?, ?, ?, ?' : '?, ?, ?, ?, ?';
  const insert = db.prepare(`INSERT INTO words (${cols}) VALUES (${vals})`);
  const gloss = db.prepare('INSERT INTO word_glosses (word_id, gloss, position) VALUES (?, ?, 0)');
  const rows = [
    ['говорить', 'speak', 'russian', 'verb', 1, 'говори́ть'],
    ['дом', 'house', 'russian', 'noun', 2, null],
    ['замок', 'lock', 'russian', 'noun', 3, 'замо́к'],
  ];
  for (const r of rows) {
    const info = insert.run(...(withStressed ? r : r.slice(0, 5)));
    gloss.run(info.lastInsertRowid, r[1]);
  }
  clearCache();
  setDb(db);     // re-runs the column checks, which is how a real database is read at startup
}

describe('a database with the stressed column', () => {
  let app, db;
  beforeAll(() => {
    ({ app, db } = buildTestApp());
    addRussian(db, { withStressed: true });
  });
  afterAll(() => teardownTestApp(db));

  it('sends the stressed form, and none for a word without one', async () => {
    const res = await request(app).get('/api/vocab/russian');
    expect(res.status).toBe(200);
    const by = Object.fromEntries(res.body.data.map(w => [w.word, w]));
    expect(by['говорить'].linguistic.stressed).toBe('говори́ть');
    expect(by['замок'].linguistic.stressed).toBe('замо́к');
    expect(by['дом'].linguistic).not.toHaveProperty('stressed');
  });

  it('keeps the plain word as the word: stress is display only', async () => {
    const res = await request(app).get('/api/vocab/russian');
    expect(res.body.data.map(w => w.word)).toEqual(['говорить', 'дом', 'замок']);
  });

  it('keeps the stressed form through the compact wire format', async () => {
    const full    = await request(app).get('/api/vocab/russian');
    const compact = await request(app).get('/api/vocab/russian?compact=1');
    expect(compact.body.data.map(w => expandWord(w))).toEqual(full.body.data);
  });

  it('lists Russian among the languages the database has', async () => {
    const res = await request(app).get('/api/languages');
    expect(res.body.languages).toContain('russian');
  });
});

describe('a database from before schemaVersion 10', () => {
  let app, db;
  beforeAll(() => {
    ({ app, db } = buildTestApp());
    addRussian(db, { withStressed: false });
  });
  afterAll(() => teardownTestApp(db));

  it('still serves Russian, with no stressed forms', async () => {
    const res = await request(app).get('/api/vocab/russian');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(3);
    for (const w of res.body.data) expect(w.linguistic).not.toHaveProperty('stressed');
  });
});
