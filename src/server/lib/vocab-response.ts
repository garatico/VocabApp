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
import v8 from 'node:v8';
import crypto from 'crypto';
import type { Request, Response } from 'express';
import { compactWord } from '../../shared/vocab/compact-word.js';

interface Encoded {
  etag: string;
  raw:  Buffer;
  gzip: Buffer | null;
  br:   Buffer | null;
}

/**
 * Two variants per loaded vocabulary: the full words, and `?compact=1` (see
 * shared/vocab/compact-word.ts — ~10% less on the wire, expanded by the client).
 * Compact is opt-in per request so a client cached from before it existed, which
 * cannot expand, keeps receiving the shape it knows.
 */
const entries        = new WeakMap<object, Encoded>();
const compactEntries = new WeakMap<object, Encoded>();

/** Tail of the compression queue — see build(). */
let compressionQueue: Promise<void> = Promise.resolve();

interface VocabLike {
  language: string;
  words:    unknown[];
  loadedAt: number;
}

/**
 * Tags the pipeline stamps on every row to record where it came from
 * (`kaikki`, `corpus`, `rare`, `backfilled` …). They are admin bookkeeping: the
 * learner app reads exactly one tag (`function_word`), and these were ~1 MB of
 * the ~10 MB Spanish response. Admin routes read the database directly and
 * still see them. Stripped by allow-list inversion — anything not named here
 * (including `function_word` and user-visible tags) is kept.
 */
const PROVENANCE_TAGS = new Set([
  'kaikki', 'corpus', 'rare', 'backfilled', 'pos-fixed', 'form-homograph',
  'curated', 'handcurated', 'hardcoded', 'inflected-form', 'name-homograph',
]);

/** Public-facing copy of a word's tags, without the provenance ones. */
export function publicTags<T extends { tags?: string[] }>(words: T[]): T[] {
  return words.map(stripProvenance);
}

function stripProvenance<T extends { tags?: string[] }>(w: T): T {
  return w.tags && w.tags.some(t => PROVENANCE_TAGS.has(t))
    ? { ...w, tags: w.tags.filter(t => !PROVENANCE_TAGS.has(t)) }
    : w;
}

/** `words` run through compactWord when `compact`, otherwise untouched. */
export function compactIf<T extends object>(compact: boolean, words: T[]): T[] {
  return compact ? words.map(w => compactWord(w as Parameters<typeof compactWord>[0]) as T) : words;
}

/** Words per piece when serialising: small enough that no copy of the whole language ever exists at once. */
const SERIALIZE_BATCH = 500;

/**
 * The response body, byte-for-byte what JSON.stringify of the whole envelope would give, but built a
 * few hundred words at a time. Stringifying one object holding a tag-stripped (and, for compact,
 * compacted) copy of all 45,000 Spanish words kept that copy plus a ~25 MB string alive together —
 * over 100 MB of extra peak on a host whose Node heap is ~256 MB. Here each word's copy is garbage
 * as soon as its piece is encoded, and the only large allocation is the final Buffer.
 */
export function serializeVocab(vocab: VocabLike, compact: boolean): Buffer {
  // metadata is deliberately stable (no "now"): anything that changes per
  // request defeats the ETag. `cacheAge` stays as a field for existing
  // consumers and is the age at build time, i.e. 0.
  const head = JSON.stringify({
    success:  true,
    language: vocab.language,
    count:    vocab.words.length,
    metadata: { timestamp: new Date(vocab.loadedAt).toISOString(), cacheAge: 0 },
    ...(compact ? { compact: true } : {}),
  });
  const words = vocab.words as { tags?: string[] }[];
  const chunks: Buffer[] = [Buffer.from(head.slice(0, -1) + ',"data":[')];
  for (let i = 0; i < words.length; i += SERIALIZE_BATCH) {
    const pieces: string[] = [];
    for (let j = i; j < Math.min(i + SERIALIZE_BATCH, words.length); j++) {
      const word = stripProvenance(words[j]);
      pieces.push(JSON.stringify(compact ? compactWord(word as Parameters<typeof compactWord>[0]) : word));
    }
    chunks.push(Buffer.from((i ? ',' : '') + pieces.join(',')));
  }
  chunks.push(Buffer.from(']}'));
  return Buffer.concat(chunks);
}

/**
 * Brotli settings for the precompressed copy. Quality 10 with a 16 MB window is the smallest (Spanish
 * ~2.0 MB) but takes ~15 s of CPU and, measured on a 256 MB-heap host, ~130 MB of native memory on top
 * of the process — enough to push a 512 MB host over its limit. Quality 8 with a 4 MB window is 22%
 * bigger (~2.5 MB, still smaller than gzip-9's 2.9 MB), takes well under a second, and needs a
 * fraction of the memory. So: the heavy setting only where there is room (a heap limit over 1.5 GB,
 * i.e. not a small host); the light one everywhere else.
 */
function brotliParams(inputSize: number): zlib.BrotliOptions['params'] {
  const roomy = v8.getHeapStatistics().heap_size_limit > 1.5 * 1024 ** 3;
  return {
    [zlib.constants.BROTLI_PARAM_QUALITY]:   roomy ? 10 : 8,
    [zlib.constants.BROTLI_PARAM_LGWIN]:     roomy ? 24 : 22,
    [zlib.constants.BROTLI_PARAM_SIZE_HINT]: inputSize,
  };
}

function build(vocab: VocabLike, compact: boolean): Encoded {
  const raw = serializeVocab(vocab, compact);
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
        params: brotliParams(raw.length),
      }, (brErr, br) => {
        if (!brErr) entry.br = br;
        resolve();
      });
    });
  }));

  return entry;
}

function entryFor(vocab: VocabLike, compact: boolean): Encoded {
  const cache = compact ? compactEntries : entries;
  let e = cache.get(vocab.words);
  if (!e) { e = build(vocab, compact); cache.set(vocab.words, e); }
  return e;
}

/**
 * Send the whole-language response. Handles conditional requests (304) and
 * serves the best precompressed form the client accepts, when ready.
 */
export function sendVocab(req: Request, res: Response, vocab: VocabLike, maxAgeSeconds: number, compact = false): void {
  const e = entryFor(vocab, compact);

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
