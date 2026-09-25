/**
 * vocab-response.ts — the whole-language vocabulary response, built once.
 *
 * GET /api/vocab/:lang is the app's biggest download (Spanish is ~10 MB of JSON,
 * ~1.1 MB after the `compression` middleware's quick brotli). It was rebuilt and
 * recompressed on every request, and its body carried a fresh timestamp, so the
 * ETag changed every time and no client could ever get a 304.
 *
 * Now the body is serialised once per loaded copy of the vocabulary, given a
 * content-hash ETag, and compressed *hard* (brotli 11, ~30% smaller than the
 * on-the-fly default) in the background. Until that finishes the first request
 * falls through to the normal middleware path, so nobody waits on it.
 *
 * Entries are keyed by the vocabulary's `words` array. vocab-loader replaces
 * that array whenever it reloads (an admin edit, a database re-sync), so a stale
 * response can never outlive the data it describes, and the WeakMap lets the old
 * one be collected.
 */

import zlib from 'zlib';
import crypto from 'crypto';
import type { Request, Response } from 'express';

interface Encoded {
  etag: string;
  raw:  Buffer;
  gzip: Buffer | null;
  br:   Buffer | null;
}

const entries = new WeakMap<object, Encoded>();

interface VocabLike {
  language: string;
  words:    unknown[];
  loadedAt: number;
}

function build(vocab: VocabLike): Encoded {
  // metadata is deliberately stable (no "now"): anything that changes per
  // request defeats the ETag. `cacheAge` stays as a field for existing
  // consumers and is the age at build time, i.e. 0.
  const raw = Buffer.from(JSON.stringify({
    success:  true,
    language: vocab.language,
    count:    vocab.words.length,
    metadata: { timestamp: new Date(vocab.loadedAt).toISOString(), cacheAge: 0 },
    data:     vocab.words,
  }));
  const etag = `"${crypto.createHash('sha1').update(raw).digest('base64url')}"`;
  const entry: Encoded = { etag, raw, gzip: null, br: null };

  // Off the event loop (libuv threadpool); best-effort — on failure the
  // request path simply keeps using the middleware's own compression.
  zlib.gzip(raw, { level: 9 }, (err, out) => { if (!err) entry.gzip = out; });
  zlib.brotliCompress(raw, {
    params: {
      [zlib.constants.BROTLI_PARAM_QUALITY]:   11,
      [zlib.constants.BROTLI_PARAM_SIZE_HINT]: raw.length,
    },
  }, (err, out) => { if (!err) entry.br = out; });

  return entry;
}

function entryFor(vocab: VocabLike): Encoded {
  let e = entries.get(vocab.words);
  if (!e) { e = build(vocab); entries.set(vocab.words, e); }
  return e;
}

/**
 * Send the whole-language response. Handles conditional requests (304) and
 * serves the best precompressed form the client accepts, when ready.
 */
export function sendVocab(req: Request, res: Response, vocab: VocabLike, maxAgeSeconds: number): void {
  const e = entryFor(vocab);

  res.set({
    'Cache-Control': `public, max-age=${maxAgeSeconds}`,
    'ETag':          e.etag,
    'Vary':          'Accept-Encoding',
  });

  if (req.headers['if-none-match'] === e.etag) {
    res.status(304).end();
    return;
  }

  res.type('application/json');
  const accepted = req.acceptsEncodings(['br', 'gzip']);
  if (accepted === 'br' && e.br) {
    res.set('Content-Encoding', 'br');
    res.send(e.br);
  } else if (accepted === 'gzip' && e.gzip) {
    res.set('Content-Encoding', 'gzip');
    res.send(e.gzip);
  } else {
    // Not compressed yet (first request after a load) or a client that takes
    // neither — the compression middleware handles this one.
    res.send(e.raw);
  }
}
