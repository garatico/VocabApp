/**
 * tests/public.test.js
 *
 * Integration tests for the public API routes:
 *   GET /api/health
 *   GET /api/languages
 *   GET /api/vocab/:language
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

describe('GET /api/health', () => {
  it('returns 200 with status ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.timestamp).toBe('string');
    expect(typeof res.body.uptime).toBe('number');
  });
});

describe('GET /api/languages', () => {
  it('returns the four supported languages', async () => {
    const res = await request(app).get('/api/languages');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.languages).toHaveLength(4);
    const codes = res.body.languages.map(l => l.code);
    expect(codes).toEqual(expect.arrayContaining(['es', 'pt', 'it', 'fr']));
  });

  it('each language entry has code, name, nativeName, flag', async () => {
    const res = await request(app).get('/api/languages');
    for (const lang of res.body.languages) {
      expect(lang).toHaveProperty('code');
      expect(lang).toHaveProperty('name');
      expect(lang).toHaveProperty('nativeName');
      expect(lang).toHaveProperty('flag');
    }
  });
});

describe('GET /api/vocab/:language', () => {
  it('returns Spanish words from the test DB', async () => {
    const res = await request(app).get('/api/vocab/spanish');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.language).toBe('spanish');
    expect(res.body.count).toBe(3);
    expect(res.body.data).toHaveLength(3);
  });

  it('word objects have the expected shape', async () => {
    const res  = await request(app).get('/api/vocab/spanish');
    const word = res.body.data.find(w => w.word === 'hablar');
    expect(word).toBeDefined();
    expect(word.pos).toBe('verb');
    expect(Array.isArray(word.glosses)).toBe(true);
    expect(word.glosses).toContain('to speak');
    expect(Array.isArray(word.examples)).toBe(true);
    expect(word.examples[0]).toBe('Yo hablo espanol.');
    expect(word.linguistic).toBeDefined();
    expect(word.frequency).toBeDefined();
    expect(word.frequency.band).toBe('A1');
  });

  it('is case-insensitive (Spanish vs spanish)', async () => {
    const res = await request(app).get('/api/vocab/Spanish');
    expect(res.status).toBe(200);
    expect(res.body.language).toBe('spanish');
  });

  it('returns Portuguese words independently', async () => {
    const res = await request(app).get('/api/vocab/portuguese');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.data[0].word).toBe('falar');
  });

  it('returns 404 for an unknown language', async () => {
    const res = await request(app).get('/api/vocab/klingon');
    expect(res.status).toBe(404);
  });

  it('includes metadata.cacheAge on first load', async () => {
    const res = await request(app).get('/api/vocab/spanish');
    expect(res.status).toBe(200);
    expect(res.body.metadata).toBeDefined();
    expect(typeof res.body.metadata.cacheAge).toBe('number');
  });
});
