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
  it('returns stats object with all four languages', async () => {
    const res = await request(app).get('/api/admin/stats');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Object.keys(res.body.stats)).toEqual(
      expect.arrayContaining(['spanish', 'portuguese', 'italian', 'french'])
    );
  });

  it('spanish stats match seed data', async () => {
    const res = await request(app).get('/api/admin/stats');
    const s   = res.body.stats.spanish;
    expect(s.total).toBe(3);
    expect(s.verbs).toBe(1);
    expect(s.nouns).toBe(1);
    expect(s.adjectives).toBe(1);
    expect(typeof s.coverage.examples).toBe('number');
    expect(typeof s.coverage.ipa).toBe('number');
  });

  it('portuguese stats reflect seed data', async () => {
    const res = await request(app).get('/api/admin/stats');
    const s   = res.body.stats.portuguese;
    expect(s.total).toBe(1);
    expect(s.verbs).toBe(1);
  });

  it('italian and french show zero totals (not seeded)', async () => {
    const res = await request(app).get('/api/admin/stats');
    expect(res.body.stats.italian.total).toBe(0);
    expect(res.body.stats.french.total).toBe(0);
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
      .send({ pos: 'verb', frequency: { band: 'B1' } });
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
