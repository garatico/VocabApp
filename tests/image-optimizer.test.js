/**
 * tests/image-optimizer.test.js
 *
 * Photos are resized to WebP on first request and cached; originals in data/
 * are never touched, and anything that goes wrong falls back to the original.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Buffer } from 'node:buffer';
import fs from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';
import request from 'supertest';
import sharp from 'sharp';
import { flatStatic } from '../src/server/lib/flat-static.js';
import { makeImageOptimizer } from '../src/server/lib/image-optimizer.js';

let root, cache, originalBytes;

/** Raw response bytes — supertest only buffers non-text types when told to. */
function bytes(res) { return Buffer.from(res.body); }

beforeAll(async () => {
  root  = fs.mkdtempSync(path.join(os.tmpdir(), 'imgopt-src-'));
  cache = fs.mkdtempSync(path.join(os.tmpdir(), 'imgopt-cache-'));
  fs.mkdirSync(path.join(root, 'animals'));

  // A big, noisy photo-like JPEG: 2400px wide, so resizing has real work to do.
  const noise = Buffer.alloc(2400 * 1600 * 3);
  for (let i = 0; i < noise.length; i++) noise[i] = (i * 2654435761 >>> 24) & 255;
  originalBytes = await sharp(noise, { raw: { width: 2400, height: 1600, channels: 3 } }).jpeg({ quality: 92 }).toBuffer();
  fs.writeFileSync(path.join(root, 'animals', 'big.jpg'), originalBytes);

  // Not an image at all, but named like one — conversion must fail soft.
  fs.writeFileSync(path.join(root, 'animals', 'broken.jpg'), 'this is not a jpeg');
  fs.writeFileSync(path.join(root, 'animals', 'notes.txt'), 'plain text');
});

afterAll(() => {
  fs.rmSync(root,  { recursive: true, force: true });
  fs.rmSync(cache, { recursive: true, force: true });
});

function appFor(optimizer = makeImageOptimizer({ cacheDir: cache })) {
  const app = express();
  app.use('/images', flatStatic(root, { optimize: optimizer }));
  app.use((_req, res) => res.status(404).end());
  return app;
}

describe('image optimizer', () => {
  it('serves a resized WebP to a client that accepts it', async () => {
    const res = await request(appFor()).get('/images/big.jpg').set('Accept', 'image/avif,image/webp,*/*').buffer(true).parse((r, cb) => {
      const chunks = []; r.on('data', c => chunks.push(c)); r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/image\/webp/);
    const meta = await sharp(bytes(res)).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width).toBeLessThanOrEqual(800);
    expect(bytes(res).length).toBeLessThan(originalBytes.length / 3);
  });

  it('serves the untouched original when WebP is not accepted', async () => {
    const res = await request(appFor()).get('/images/big.jpg').set('Accept', 'image/jpeg').buffer(true).parse((r, cb) => {
      const chunks = []; r.on('data', c => chunks.push(c)); r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(res.headers['content-type']).toMatch(/image\/jpeg/);
    expect(bytes(res).equals(originalBytes)).toBe(true);
  });

  it('tells caches the response depends on Accept', async () => {
    const res = await request(appFor()).get('/images/big.jpg').set('Accept', 'image/webp');
    expect(res.headers.vary).toMatch(/Accept/i);
  });

  it('caches the conversion: a second request does not re-encode', async () => {
    const before = fs.readdirSync(cache).filter(f => f.startsWith('big.jpg'));
    expect(before.length).toBe(1);   // written by the first test
    const mtime = fs.statSync(path.join(cache, before[0])).mtimeMs;
    await request(appFor()).get('/images/big.jpg').set('Accept', 'image/webp');
    const after = fs.readdirSync(cache).filter(f => f.startsWith('big.jpg'));
    expect(after).toEqual(before);
    expect(fs.statSync(path.join(cache, after[0])).mtimeMs).toBe(mtime);
  });

  it('never modifies the original file', () => {
    expect(fs.readFileSync(path.join(root, 'animals', 'big.jpg')).equals(originalBytes)).toBe(true);
  });

  it('a file that cannot be converted is served as it is, not as an error', async () => {
    const res = await request(appFor()).get('/images/broken.jpg').set('Accept', 'image/webp');
    expect(res.status).toBe(200);
    expect(res.text ?? Buffer.from(res.body).toString()).toBe('this is not a jpeg');
  });

  it('leaves non-image files alone', async () => {
    const res = await request(appFor()).get('/images/notes.txt').set('Accept', 'image/webp');
    expect(res.status).toBe(200);
    expect(res.text).toBe('plain text');
  });

  it('a failing optimizer still yields the original', async () => {
    const res = await request(appFor(async () => { throw new Error('boom'); }))
      .get('/images/broken.jpg').set('Accept', 'image/webp');
    expect(res.status).toBe(200);
  });

  it('concurrent first requests share one conversion', async () => {
    const fresh = fs.mkdtempSync(path.join(os.tmpdir(), 'imgopt-c2-'));
    try {
      const app = appFor(makeImageOptimizer({ cacheDir: fresh }));
      const rs = await Promise.all([1, 2, 3, 4].map(() => request(app).get('/images/big.jpg').set('Accept', 'image/webp')));
      rs.forEach(r => expect(r.status).toBe(200));
      expect(fs.readdirSync(fresh).filter(f => f.endsWith('.webp'))).toHaveLength(1);
      expect(fs.readdirSync(fresh).filter(f => f.endsWith('.tmp'))).toHaveLength(0);
    } finally {
      fs.rmSync(fresh, { recursive: true, force: true });
    }
  });
});
