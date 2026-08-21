/**
 * tests/flat-static.test.js
 *
 * `data/images/` and `data/emoji/` are partitioned by domain on disk but flat
 * in the URL space. This used to be a loop of `express.static` mounts on the
 * same prefix, which meant two domains holding the same filename resolved to
 * whichever `readdirSync` returned first — the other file was unreachable, with
 * nothing in the logs to say so. The domain list was also read once at boot, so
 * a pipeline run that created a new domain needed a restart.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Buffer } from 'node:buffer';
import fs from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';
import request from 'supertest';
import { buildFlatIndex, flatStatic } from '../src/server/lib/flat-static.js';

let root;

function write(rel, body) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body);
}

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'flat-static-'));
  write('animals/bee.jpg',   'BEE');
  write('food/apple.jpg',    'FOOD APPLE');
  write('nature/apple.jpg',  'NATURE APPLE');   // the collision
  write('nature/river.jpg',  'RIVER');
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('buildFlatIndex', () => {
  it('indexes every file across every domain', () => {
    const { index } = buildFlatIndex(root);
    expect([...index.keys()].sort()).toEqual(['apple.jpg', 'bee.jpg', 'river.jpg']);
  });

  it('reports a name that exists in two domains instead of silently dropping one', () => {
    const { collisions } = buildFlatIndex(root);
    expect(collisions).toHaveLength(1);
    expect(collisions[0].name).toBe('apple.jpg');
    expect(collisions[0].kept).toMatch(/food/);
    expect(collisions[0].ignored).toMatch(/nature/);
  });

  it('resolves a collision the same way every time', () => {
    // Domains are sorted, so the winner does not depend on filesystem order —
    // the old mounts left it to whatever readdirSync happened to return.
    const first  = buildFlatIndex(root).index.get('apple.jpg');
    const second = buildFlatIndex(root).index.get('apple.jpg');
    expect(first).toBe(second);
    expect(first).toMatch(/food/);
  });

  it('returns an empty index for a directory that does not exist', () => {
    const { index, collisions } = buildFlatIndex(path.join(root, 'nope'));
    expect(index.size).toBe(0);
    expect(collisions).toEqual([]);
  });
});

describe('flatStatic', () => {
  // The files are .jpg, so supertest gives us a Buffer rather than `.text`.
  function bodyText(res) {
    return Buffer.isBuffer(res.body) ? res.body.toString('utf8') : res.text;
  }

  function appFor(dir) {
    const app = express();
    app.use('/images', flatStatic(dir, { rescanCooldownMs: 0 }));
    app.use((_req, res) => res.status(404).json({ error: 'not found' }));
    return app;
  }

  it('serves a file addressed without its domain', async () => {
    const res = await request(appFor(root)).get('/images/bee.jpg');
    expect(res.status).toBe(200);
    expect(bodyText(res)).toBe('BEE');
  });

  it('falls through to the next handler for an unknown name', async () => {
    const res = await request(appFor(root)).get('/images/nothing-here.jpg');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('not found');
  });

  it('picks up a file written after startup, without a restart', async () => {
    const app = appFor(root);
    // Nothing here at boot; the pipeline writes it while the server is up.
    write('tools/hammer.jpg', 'HAMMER');
    const res = await request(app).get('/images/hammer.jpg');
    expect(res.status).toBe(200);
    expect(bodyText(res)).toBe('HAMMER');
  });

  it('picks up a whole new domain directory, not just a new file', async () => {
    const app = appFor(root);
    write('vehicles/train.jpg', 'TRAIN');
    const res = await request(app).get('/images/train.jpg');
    expect(res.status).toBe(200);
    expect(bodyText(res)).toBe('TRAIN');
  });

  it('cannot be walked out of the asset root', async () => {
    // Only basenames present in the index are ever served, so a traversal
    // attempt is just an unknown name.
    const res = await request(appFor(root)).get('/images/..%2F..%2Fetc%2Fpasswd');
    expect(res.status).toBe(404);
  });

  it('sets a cache header', async () => {
    const res = await request(appFor(root)).get('/images/bee.jpg');
    expect(res.headers['cache-control']).toMatch(/max-age=/);
  });
});
