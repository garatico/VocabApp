/**
 * tests/admin.test.js
 *
 * Read-only tests (GET /vocab, stats, meta) run before mutating POST tests
 * so seed data stays intact for counts/coverage assertions.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { buildTestApp, teardownTestApp } from './helpers/app.js';

let app, db;

beforeAll(() => {
  ({ app, db } = buildTestApp());
});

afterAll(() => {
  teardownTestApp(db);
});

// GET /api/admin/vocab

describe('GET /api/admin/vocab', () => {
  it('returns Spanish words with default pagination', async () => {
    const res = await request(app).get('/api/admin/vocab?lang=spanish');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.language).toBe('spanish');
    expect(res.body.total).toBe(3);
    expect(res.body.words).toHaveLength(3);
  });

  it('word objects have glosses and examples as arrays', async () => {
    const res  = await request(app).get('/api/admin/vocab?lang=spanish');
    const word = res.body.words.find(w => w.word === 'hablar');
    expect(word).toBeDefined();
    expect(Array.isArray(word.glosses)).toBe(true);
    expect(word.glosses).toContain('to speak');
    expect(Array.isArray(word.examples)).toBe(true);
    expect(word.linguistic).toBeDefined();
    expect(word.frequency).toBeDefined();
  });

  it('filters by search term', async () => {
    const res = await request(app).get('/api/admin/vocab?lang=spanish&search=casa');
    expect(res.body.total).toBe(1);
    expect(res.body.words[0].word).toBe('casa');
  });

  it('search matches glosses', async () => {
    const res = await request(app).get('/api/admin/vocab?lang=spanish&search=pretty');
    expect(res.body.total).toBe(1);
    expect(res.body.words[0].word).toBe('bonito');
  });

  it('returns empty list for no match', async () => {
    const res = await request(app).get('/api/admin/vocab?lang=spanish&search=zzznomatch');
    expect(res.body.total).toBe(0);
    expect(res.body.words).toHaveLength(0);
  });

  it('defaults to spanish when lang is omitted', async () => {
    const res = await request(app).get('/api/admin/vocab');
    expect(res.status).toBe(200);
    expect(res.body.language).toBe('spanish');
  });
});

// GET /api/admin/vocab/:word

describe('GET /api/admin/vocab/:word', () => {
  it('returns a single word by exact match', async () => {
    const res = await request(app).get('/api/admin/vocab/hablar?lang=spanish');
    expect(res.status).toBe(200);
    expect(res.body.word.word).toBe('hablar');
    expect(res.body.word.pos).toBe('verb');
  });

  it('returns 404 for unknown word', async () => {
    const res = await request(app).get('/api/admin/vocab/zzznope?lang=spanish');
    expect(res.status).toBe(404);
  });

  it('returns 404 when word exists in a different language', async () => {
    const res = await request(app).get('/api/admin/vocab/falar?lang=spanish');
    expect(res.status).toBe(404);
  });
});

// GET /api/admin/stats  (read-only -- runs before POST tests mutate the data)

describe('GET /api/admin/stats', () => {
  it('returns stats object for seeded languages', async () => {
    const res = await request(app).get('/api/admin/stats');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Stats reflects languages present in the DB (DB-driven, not hardcoded)
    expect(Object.keys(res.body.stats)).toEqual(
      expect.arrayContaining(['spanish', 'portuguese'])
    );
  });

  it('spanish stats match seed data', async () => {
    const res = await request(app).get('/api/admin/stats');
    const s   = res.body.stats.spanish;
    expect(s.total).toBe(3);
    expect(s.posBreakdown.verb).toBe(1);
    expect(s.posBreakdown.noun).toBe(1);
    expect(s.posBreakdown.adjective).toBe(1);
    expect(typeof s.coverage.examples).toBe('number');
    expect(typeof s.coverage.ipa).toBe('number');
  });

  it('portuguese stats reflect seed data', async () => {
    const res = await request(app).get('/api/admin/stats');
    const s   = res.body.stats.portuguese;
    expect(s.total).toBe(1);
    expect(s.posBreakdown.verb).toBe(1);
  });

  it('unseeded languages are absent from stats (DB-driven language list)', async () => {
    const res = await request(app).get('/api/admin/stats');
    expect(res.body.stats.italian).toBeUndefined();
    expect(res.body.stats.french).toBeUndefined();
  });
});

// GET /api/admin/meta  (read-only -- runs before POST tests mutate the data)

describe('GET /api/admin/meta', () => {
  it('returns pos and domains arrays', async () => {
    const res = await request(app).get('/api/admin/meta');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.pos)).toBe(true);
    expect(Array.isArray(res.body.domains)).toBe(true);
  });

  it('pos includes the seeded parts of speech', async () => {
    const res = await request(app).get('/api/admin/meta');
    expect(res.body.pos).toEqual(expect.arrayContaining(['adjective', 'noun', 'verb']));
  });

  it('domains includes seeded domain values', async () => {
    const res = await request(app).get('/api/admin/meta');
    expect(res.body.domains).toEqual(expect.arrayContaining(['general', 'home']));
  });
});

// POST /api/admin/vocab/:word

describe('POST /api/admin/vocab/:word', () => {
  it('updates word fields and returns updated word', async () => {
    const res = await request(app)
      .post('/api/admin/vocab/bonito?lang=spanish')
      .send({ pos: 'adjective', notes: 'updated note', glosses: ['pretty', 'lovely'], examples: [] });
    expect(res.status).toBe(200);
    expect(res.body.word.notes).toBe('updated note');
    expect(res.body.word.glosses).toEqual(['pretty', 'lovely']);
    expect(res.body.word.examples).toHaveLength(0);
  });

  it('persists changes -- subsequent GET reflects the update', async () => {
    await request(app)
      .post('/api/admin/vocab/casa?lang=spanish')
      .send({ pos: 'noun', notes: 'mi casa', glosses: ['house'], examples: ['La casa es bonita.'] });
    const res = await request(app).get('/api/admin/vocab/casa?lang=spanish');
    expect(res.body.word.notes).toBe('mi casa');
    expect(res.body.word.glosses).toEqual(['house']);
    expect(res.body.word.examples).toEqual(['La casa es bonita.']);
  });

  it('updates IPA via linguistic wrapper', async () => {
    const res = await request(app)
      .post('/api/admin/vocab/hablar?lang=spanish')
      .send({ pos: 'verb', linguistic: { ipa: 'aBlahr-updated' } });
    expect(res.status).toBe(200);
    expect(res.body.word.linguistic.ipa).toBe('aBlahr-updated');
  });

  it('updates frequency band', async () => {
    const res = await request(app)
      .post('/api/admin/vocab/hablar?lang=spanish')
      .send({ pos: 'verb', frequency: { rank: 2000 } });
    expect(res.status).toBe(200);
    expect(res.body.word.frequency.band).toBe('B1');
  });

  it('returns 400 when glosses is not an array', async () => {
    const res = await request(app)
      .post('/api/admin/vocab/hablar?lang=spanish')
      .send({ glosses: 'not an array' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when examples is not an array', async () => {
    const res = await request(app)
      .post('/api/admin/vocab/hablar?lang=spanish')
      .send({ examples: 'not an array' });
    expect(res.status).toBe(400);
  });

  it('returns 404 for unknown word', async () => {
    const res = await request(app)
      .post('/api/admin/vocab/noexiste?lang=spanish')
      .send({ notes: 'test' });
    expect(res.status).toBe(404);
  });

  /**
   * Regression test for the StorageAdapter's manual BEGIN/COMMIT transaction
   * wrapper (src/server/lib/storage/better-sqlite3-adapter.ts). That wrapper
   * is only safe because every get/all/run resolves within the same
   * microtask cascade as the surrounding BEGIN/COMMIT — never real async
   * I/O — so two concurrent requests (two separate macrotasks) can't
   * interleave their transactions on the shared connection. If a future
   * change ever put real async I/O inside applyWordUpdate or the adapter,
   * SQLite would either throw ("cannot start a transaction within a
   * transaction") or these two updates would corrupt each other — this test
   * exists to catch that regression, not because either failure mode is
   * expected today.
   */
  it('two concurrent updates on different words both fully commit, with no interleaving', async () => {
    const [resA, resB] = await Promise.all([
      request(app)
        .post('/api/admin/vocab/hablar?lang=spanish')
        .send({ notes: 'concurrent-A', glosses: ['speak-A', 'talk-A'] }),
      request(app)
        .post('/api/admin/vocab/casa?lang=spanish')
        .send({ notes: 'concurrent-B', glosses: ['house-B'] }),
    ]);

    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);

    const [getA, getB] = await Promise.all([
      request(app).get('/api/admin/vocab/hablar?lang=spanish'),
      request(app).get('/api/admin/vocab/casa?lang=spanish'),
    ]);

    expect(getA.body.word.notes).toBe('concurrent-A');
    expect(getA.body.word.glosses).toEqual(['speak-A', 'talk-A']);
    expect(getB.body.word.notes).toBe('concurrent-B');
    expect(getB.body.word.glosses).toEqual(['house-B']);
  });
});

// PUT /api/admin/vocab/:word

describe('PUT /api/admin/vocab/:word', () => {
  // Words created here would otherwise permanently grow the Spanish dataset
  // for the rest of this file — POST /api/admin/export's own test counts
  // rows and runs after this describe block, so a created-but-never-cleaned
  // word here would silently break an assertion nothing about this block
  // looks like it should affect.
  afterAll(() => {
    db.prepare("DELETE FROM words WHERE language = 'spanish' AND word IN ('nuevo', 'reciente')").run();
  });

  it('creates a new word and returns it with 201', async () => {
    const res = await request(app)
      .put('/api/admin/vocab/nuevo?lang=spanish')
      .send({ translation: 'new', pos: 'adjective', glosses: ['new', 'fresh'] });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.word.word).toBe('nuevo');
    expect(res.body.word.translation).toBe('new');
    expect(res.body.word.glosses).toEqual(['new', 'fresh']);
  });

  it('persists the new word -- subsequent GET finds it', async () => {
    await request(app)
      .put('/api/admin/vocab/reciente?lang=spanish')
      .send({ translation: 'recent' });
    const res = await request(app).get('/api/admin/vocab/reciente?lang=spanish');
    expect(res.status).toBe(200);
    expect(res.body.word.translation).toBe('recent');
  });

  it('returns 409 for a word that already exists in this language', async () => {
    const res = await request(app)
      .put('/api/admin/vocab/hablar?lang=spanish')
      .send({ translation: 'to speak' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already exists/);
  });

  it('returns 400 when glosses is not an array', async () => {
    const res = await request(app)
      .put('/api/admin/vocab/otropalabra?lang=spanish')
      .send({ glosses: 'not an array' });
    expect(res.status).toBe(400);
  });
});

// POST /api/admin/cache/clear

describe('POST /api/admin/cache/clear', () => {
  it('clears all caches and returns success message', async () => {
    const res = await request(app).post('/api/admin/cache/clear').send({});
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/cleared/i);
  });

  it('clears a specific language cache', async () => {
    const res = await request(app).post('/api/admin/cache/clear').send({ lang: 'spanish' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/spanish/i);
  });
});

// POST /api/admin/export

describe('POST /api/admin/export', () => {
  it('returns CSV text for a valid language', async () => {
    const res = await request(app).post('/api/admin/export').send({ lang: 'spanish' });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    const lines = res.text.split('\n');
    expect(lines[0]).toContain('word');
    expect(lines[0]).toContain('pos');
    expect(lines[0]).toContain('glosses');
    expect(lines.filter(l => l.trim())).toHaveLength(4);
  });

  it('CSV contains expected word values', async () => {
    const res = await request(app).post('/api/admin/export').send({ lang: 'spanish' });
    expect(res.text).toContain('hablar');
    expect(res.text).toContain('casa');
    expect(res.text).toContain('bonito');
  });

  it('returns 400 for invalid language', async () => {
    const res = await request(app).post('/api/admin/export').send({ lang: 'klingon' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when lang is missing', async () => {
    const res = await request(app).post('/api/admin/export').send({});
    expect(res.status).toBe(400);
  });
});
