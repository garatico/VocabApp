/**
 * tests/app-env.test.js
 *
 * `createApp({ nodeEnv })` is authoritative.
 *
 * It used not to be: CORS, rate limiting, error detail, cache lifetimes and the
 * admin gate each read `process.env.NODE_ENV` for themselves, so the option
 * described only whichever parts happened to be listening. The suite passed
 * because the test helper set the env var *and* passed a different value to
 * `createApp` — an app told it was in two environments at once.
 *
 * These tests set `process.env.NODE_ENV` to the wrong thing on purpose. If any
 * collaborator starts reading it again, one of them fails.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/server/app.js';
import { createTestDb } from './helpers/db.js';
import { setDb, clearCache, reloadDb } from '../src/server/lib/vocab-loader.js';
import { makeErrorHandler } from '../src/server/middleware/error-handler.js';

/** Minimal Express req/res stand-ins for driving the error handler directly. */
function fakeReq() {
  return { path: '/api/boom', method: 'GET' };
}
function fakeRes() {
  const res = { statusCode: 0, body: undefined };
  res.status = code => { res.statusCode = code; return res; };
  res.json   = payload => { res.body = payload; return res; };
  return res;
}

let db;
const REAL_NODE_ENV = process.env.NODE_ENV;

beforeAll(() => {
  clearCache();
  db = createTestDb();
  setDb(db);
});

afterAll(() => {
  if (db && db.open) db.close();
  reloadDb();
});

beforeEach(() => {
  // Deliberately hostile: the opposite of what every app below is built with.
  process.env.NODE_ENV = 'production';
});

afterEach(() => {
  if (REAL_NODE_ENV === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = REAL_NODE_ENV;
});

function devApp() {
  return createApp({ nodeEnv: 'development', serveStatic: false });
}
function prodApp() {
  return createApp({ nodeEnv: 'production', serveStatic: false });
}

describe('admin gate reads the app environment, not the ambient one', () => {
  it('a development app serves admin routes even when NODE_ENV says production', async () => {
    const res = await request(devApp()).get('/api/admin/stats');
    expect(res.status).toBe(200);
  });

  it('a production app refuses them even when NODE_ENV says development', async () => {
    process.env.NODE_ENV = 'development';
    const res = await request(prodApp()).get('/api/admin/stats');
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/development mode/i);
  });
});

describe('CORS reads the app environment', () => {
  it('a development app echoes a localhost origin on any port', async () => {
    const res = await request(devApp())
      .get('/api/health')
      .set('Origin', 'http://localhost:5173');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('a production app does not — 5173 is not in the allow-list', async () => {
    process.env.NODE_ENV = 'development';
    const res = await request(prodApp())
      .get('/api/health')
      .set('Origin', 'http://localhost:5173');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('never matches a look-alike host by substring', async () => {
    const res = await request(devApp())
      .get('/api/health')
      .set('Origin', 'http://localhost.evil.com');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('cache lifetime reads the app environment', () => {
  it('is short in development', async () => {
    const res = await request(devApp()).get('/api/vocab/spanish');
    expect(res.headers['cache-control']).toBe('public, max-age=300');
  });

  it('is long in production', async () => {
    process.env.NODE_ENV = 'development';
    const res = await request(prodApp()).get('/api/vocab/spanish');
    expect(res.headers['cache-control']).toBe('public, max-age=3600');
  });
});

describe('error responses do not leak internals outside development', () => {
  it('a development app explains a 404 and includes details', async () => {
    const res = await request(devApp()).get('/api/vocab/klingon');
    expect(res.status).toBe(404);
    // A deliberate 4xx keeps its message — this is the useful half.
    expect(res.body.error).toMatch(/klingon/i);
    expect(res.body.details).toBeDefined();
  });

  it('a production app still explains a 4xx but sends no details block', async () => {
    process.env.NODE_ENV = 'development';
    const res = await request(prodApp()).get('/api/vocab/klingon');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/klingon/i);
    expect(res.body.details).toBeUndefined();
  });

  // The 5xx cases go straight at the middleware. `createApp` registers the
  // error handler last, as Express requires, so a route appended to a built app
  // sits *after* it and never reaches it — testing through one would only prove
  // that Express's own default handler still works.
  it('a production handler replaces a 5xx message with a generic one', () => {
    const handler = makeErrorHandler('production');
    const err = Object.assign(
      new Error('SQLite database not found at: /srv/secret/data/vocabulary.db'),
      { statusCode: 500 },
    );
    const res = fakeRes();
    handler(err, fakeReq(), res, () => {});

    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe('Internal Server Error');
    expect(JSON.stringify(res.body)).not.toMatch(/secret/);
    expect(res.body.details).toBeUndefined();
  });

  it('a development handler keeps the 5xx message, because that is what dev is for', () => {
    const handler = makeErrorHandler('development');
    const err = Object.assign(
      new Error('SQLite database not found at: /srv/data/vocabulary.db'),
      { statusCode: 500 },
    );
    const res = fakeRes();
    handler(err, fakeReq(), res, () => {});

    expect(res.body.error).toMatch(/vocabulary\.db/);
    expect(res.body.details).toBeDefined();
  });

  it('a deliberate 4xx keeps its message in production — that is the useful half', () => {
    const handler = makeErrorHandler('production');
    const err = Object.assign(new Error('Language not found: klingon'), { statusCode: 404 });
    const res = fakeRes();
    handler(err, fakeReq(), res, () => {});

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('Language not found: klingon');
  });
});
