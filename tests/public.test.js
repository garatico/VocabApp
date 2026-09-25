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
import { Buffer } from 'buffer';
import { setTimeout } from 'timers';
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
  it('lists only the languages the DB actually has rows for', async () => {
    const res = await request(app).get('/api/languages');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.languages)).toBe(true);
    expect(res.body.languages).toContain('spanish');
  });

  it('omits a language the app offers but has never imported', async () => {
    // This is the whole point of the endpoint: the client's language list is
    // fixed, but a language is only usable once the pipeline has synced it.
    // The dropdown greys out anything missing here rather than failing on
    // selection.
    const res = await request(app).get('/api/languages');
    expect(res.body.languages).not.toContain('german');
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

  // The whole-language response is built once per loaded copy with a
  // content-hash ETag (lib/vocab-response.ts). A per-request ETag meant no
  // client could ever revalidate — and made the service worker's "vocabulary
  // changed" check fire on every launch.
  describe('conditional and precompressed delivery', () => {
    it('has a stable ETag across requests', async () => {
      const a = await request(app).get('/api/vocab/spanish');
      const b = await request(app).get('/api/vocab/spanish');
      expect(a.headers.etag).toBeTruthy();
      expect(b.headers.etag).toBe(a.headers.etag);
      expect(a.body).toEqual(b.body);
    });

    it('answers 304 to a matching If-None-Match, with no body', async () => {
      const first = await request(app).get('/api/vocab/spanish');
      const res = await request(app).get('/api/vocab/spanish').set('If-None-Match', first.headers.etag);
      expect(res.status).toBe(304);
      expect(res.text ?? '').toBe('');
    });

    it('a different ETag gets the full body again', async () => {
      const res = await request(app).get('/api/vocab/spanish').set('If-None-Match', '"something-else"');
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('varies on Accept-Encoding', async () => {
      const res = await request(app).get('/api/vocab/spanish');
      expect(res.headers.vary).toMatch(/Accept-Encoding/i);
    });

    it('serves brotli once precompressed, and it decodes to the same JSON', async () => {
      const zlib = await import('zlib');
      const http = await import('http');
      const plain = await request(app).get('/api/vocab/spanish');

      // Raw http, so nothing decodes the body before the assertion sees it.
      const server = app.listen(0);
      const fetchBr = () => new Promise((resolve, reject) => {
        http.get({ port: server.address().port, path: '/api/vocab/spanish', headers: { 'Accept-Encoding': 'br' } }, r => {
          const chunks = [];
          r.on('data', c => chunks.push(c));
          r.on('end', () => resolve({ encoding: r.headers['content-encoding'], body: Buffer.concat(chunks) }));
        }).on('error', reject);
      });

      try {
        let got = null;
        // Background compression: poll briefly rather than assume a timing.
        for (let i = 0; i < 50 && !got; i++) {
          const r = await fetchBr();
          if (r.encoding === 'br' && r.body.length > 0) {
            // The middleware's fast path also says br, so this proves delivery
            // and round-tripping, not which compressor produced it — the real
            // size is checked against the running server, not here.
            got = r;
          } else await new Promise(res => setTimeout(res, 100));
        }
        expect(got, 'brotli form never became available').not.toBeNull();
        expect(JSON.parse(zlib.brotliDecompressSync(got.body).toString())).toEqual(plain.body);
      } finally {
        server.close();
      }
    });
  });

  // Payload-size fix: fields with no value are omitted entirely rather than
  // sent as `"key":null` — see vocab-loader.ts's ifSet(). This is the exact
  // behavior a client-side regression (something that started doing
  // `word.gender === null` instead of `word.linguistic?.gender`) would slip
  // past unless it's asserted at the wire level, not just "the field reads
  // as falsy" — an omitted key and an explicit null both read as falsy.
  describe('omits (rather than nulls) fields with no value', () => {
    it('a verb includes conjugations, infinitive and conjugation_class', async () => {
      const res  = await request(app).get('/api/vocab/spanish');
      const word = res.body.data.find(w => w.word === 'hablar');
      expect(word.linguistic).toHaveProperty('conjugations');
      expect(word.linguistic).toHaveProperty('conjugation_class', 'regular-ar');
      expect(word.linguistic).toHaveProperty('infinitive', 'hablar');
      // Never applicable to a verb — omitted, not null.
      expect(word.linguistic).not.toHaveProperty('gender');
      expect(word.linguistic).not.toHaveProperty('plural');
    });

    it('a noun includes gender/plural but omits verb-only fields', async () => {
      const res  = await request(app).get('/api/vocab/spanish');
      const word = res.body.data.find(w => w.word === 'casa');
      expect(word.linguistic).toHaveProperty('gender', 'feminine');
      expect(word.linguistic).toHaveProperty('plural', 'casas');
      expect(word.linguistic).not.toHaveProperty('conjugations');
      expect(word.linguistic).not.toHaveProperty('conjugation_class');
      expect(word.linguistic).not.toHaveProperty('infinitive');
    });

    it('a word with no linguistic metadata at all omits every optional field', async () => {
      const res  = await request(app).get('/api/vocab/spanish');
      const word = res.body.data.find(w => w.word === 'bonito');
      expect(word).not.toHaveProperty('svg_url');
      expect(word).not.toHaveProperty('emoji');
      expect(word).not.toHaveProperty('audio_url');
      expect(word).not.toHaveProperty('disambiguator');
      expect(word.linguistic).not.toHaveProperty('gender');
      expect(word.linguistic).not.toHaveProperty('plural');
      expect(word.linguistic).not.toHaveProperty('infinitive');
      expect(word.linguistic).not.toHaveProperty('conjugations');
      expect(word.linguistic).not.toHaveProperty('conjugation_class');
      // Present regardless: never null in practice, so never omitted.
      expect(word).toHaveProperty('pos', 'adjective');
      expect(word.linguistic).toHaveProperty('reflexive', false);
    });
  });

  // Pagination (B1): a `page` param switches to the same paginated query the
  // admin API's GET /vocab already used — same filters, same shared
  // implementation (src/shared/vocab/queries.ts's getWordPage). No `page`
  // param must keep behaving exactly as every test above already assumes.
  describe('pagination (?page=)', () => {
    it('omitting page returns the unchanged full-array shape, with no page/pages fields', async () => {
      const res = await request(app).get('/api/vocab/spanish');
      expect(res.body).not.toHaveProperty('page');
      expect(res.body).not.toHaveProperty('pages');
      expect(res.body.count).toBe(3);
      expect(res.body.data).toHaveLength(3);
    });

    it('page=1 returns a paginated envelope with page/pages/limit', async () => {
      const res = await request(app).get('/api/vocab/spanish?page=1&limit=2');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.language).toBe('spanish');
      expect(res.body.count).toBe(3);
      expect(res.body.page).toBe(1);
      expect(res.body.pages).toBe(2);
      expect(res.body.limit).toBe(2);
      expect(res.body.data).toHaveLength(2);
    });

    it('page=2 returns the remainder', async () => {
      const res = await request(app).get('/api/vocab/spanish?page=2&limit=2');
      expect(res.body.page).toBe(2);
      expect(res.body.data).toHaveLength(1);
    });

    it('search filters the same way the admin API does', async () => {
      const res = await request(app).get('/api/vocab/spanish?page=1&search=casa');
      expect(res.body.count).toBe(1);
      expect(res.body.data[0].word).toBe('casa');
    });

    it('band filter matches admin semantics (A1 = rank <= 500)', async () => {
      const res = await request(app).get('/api/vocab/spanish?page=1&band=A1');
      expect(res.body.data.every(w => w.frequency.band === 'A1')).toBe(true);
    });

    it('paginated word objects have the same shape as the unpaginated ones', async () => {
      const res  = await request(app).get('/api/vocab/spanish?page=1&limit=10');
      const word = res.body.data.find(w => w.word === 'hablar');
      expect(word).toBeDefined();
      expect(Array.isArray(word.glosses)).toBe(true);
      expect(word.glosses).toContain('to speak');
      expect(word.linguistic).toHaveProperty('conjugation_class', 'regular-ar');
    });
  });
});
