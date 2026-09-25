/**
 * vocab-response.ts — the whole-language vocabulary response, built once.
 *
 * GET /api/vocab/:lang is the app's biggest download (Spanish is ~10 MB of JSON,
 * ~1.1 MB after the `compression` middleware's quick brotli). It was rebuilt and
 * recompressed on every request, and its body carried a fresh timestamp, so the
 * ETag changed every time and no client could ever get a 304.
 *
 * Now the body is serialised once per loaded copy of the vocabulary, given a
 * content-hash ETag, and compressed *hard* (brotli 10, ~27% smaller than the
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

/** Tail of the compression queue — see build(). */
let compressionQueue: Promise<void> = Promise.resolve();

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

  // Off the event loop (libuv threadpool), one job at a time. Brotli-10 on
  // ~10 MB takes several seconds of a pool thread, and the pool is shared with
  // file reads (static assets, images): several languages compressing at once
  // — easy when a page load asks for more than one — starved those and made
  // unrelated requests time out. Best-effort: on failure the request path
  // simply keeps using the middleware's own compression.
  compressionQueue = compressionQueue.then(() => new Promise<void>(resolve => {
    zlib.gzip(raw, { level: 9 }, (gzErr, gz) => {
      if (!gzErr) entry.gzip = gz;
      zlib.brotliCompress(raw, {
        params: {
          // 10, not 11: on Spanish (~10 MB) q11 is 748 kB for ~18 s of CPU, q10 is
          // 800 kB for ~6 s. That extra 7% was not worth a core for three times
          // as long on a server that also has requests to answer.
          [zlib.constants.BROTLI_PARAM_QUALITY]:   10,
          [zlib.constants.BROTLI_PARAM_LGWIN]:     24,
          [zlib.constants.BROTLI_PARAM_SIZE_HINT]: raw.length,
        },
      }, (brErr, br) => {
        if (!brErr) entry.br = br;
        resolve();
      });
    });
  }));

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
