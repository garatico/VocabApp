/**
 * tests/compact-api.test.js
 *
 * GET /api/vocab/:language?compact=1 sends words without the fields the client
 * can restore (shared/vocab/compact-word.ts). It is opt-in so a client cached
 * from before the option existed — which cannot expand — keeps getting the full
 * shape it knows. These pin that default, the equivalence after expansion, and
 * that the two variants are cached and ETagged separately.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { buildTestApp, teardownTestApp } from './helpers/app.js';
import { expandWord } from '../src/shared/vocab/compact-word.js';

let app, db;

beforeAll(() => {
  ({ app, db } = buildTestApp());
});

afterAll(() => {
  teardownTestApp(db);
});

describe('GET /api/vocab/:language?compact=1', () => {
  it('without the option, still sends every word in its full shape', async () => {
    const res = await request(app).get('/api/vocab/spanish');
    expect(res.body).not.toHaveProperty('compact');
    for (const w of res.body.data) {
      expect(w).toHaveProperty('is_function_word');
      expect(w).toHaveProperty('glosses');
      expect(w.frequency).toHaveProperty('rank');
    }
  });

  it('flags itself compact and is smaller', async () => {
    const full    = await request(app).get('/api/vocab/spanish');
    const compact = await request(app).get('/api/vocab/spanish?compact=1');
    expect(compact.body.compact).toBe(true);
    expect(JSON.stringify(compact.body.data).length).toBeLessThan(JSON.stringify(full.body.data).length);
  });

  it('expands back to exactly the full words, in the same order', async () => {
    const full    = await request(app).get('/api/vocab/spanish');
    const compact = await request(app).get('/api/vocab/spanish?compact=1');
    expect(compact.body.count).toBe(full.body.count);
    expect(compact.body.data.map(w => expandWord(w))).toEqual(full.body.data);
  });

  it('has its own ETag, and a 304 only for the matching variant', async () => {
    const full    = await request(app).get('/api/vocab/spanish');
    const compact = await request(app).get('/api/vocab/spanish?compact=1');
    expect(compact.headers.etag).not.toBe(full.headers.etag);

    const hit  = await request(app).get('/api/vocab/spanish?compact=1').set('If-None-Match', compact.headers.etag);
    const miss = await request(app).get('/api/vocab/spanish?compact=1').set('If-None-Match', full.headers.etag);
    expect(hit.status).toBe(304);
    expect(miss.status).toBe(200);
  });

  it('compacts a paged response too, and expands to the same words as the full page', async () => {
    const full    = await request(app).get('/api/vocab/spanish?page=1&limit=5');
    const compact = await request(app).get('/api/vocab/spanish?page=1&limit=5&compact=1');
    expect(full.body).not.toHaveProperty('compact');
    expect(compact.body.compact).toBe(true);
    expect(compact.body.data.map(w => expandWord(w))).toEqual(full.body.data);
  });

  it('only "1" turns it on', async () => {
    const res = await request(app).get('/api/vocab/spanish?compact=true');
    expect(res.body).not.toHaveProperty('compact');
  });
});
