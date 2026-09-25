/**
 * image-optimizer.ts — smaller copies of the photos, made on demand.
 *
 * data/images/ holds the originals straight from Wikipedia: 95 files, 27 MB,
 * the biggest 2.4 MB, to be shown at roughly 350–500 px. `data/` is what the
 * app is *given* (see CLAUDE.md) so it is never rewritten here; instead the
 * first request that accepts WebP gets a resized WebP made from the original
 * and kept in a cache directory, and every later one is a plain file read.
 *
 * `sharp` is an optionalDependency. If it isn't installed (or fails to load on
 * some platform) this quietly does nothing and the originals are served, so the
 * feature can only ever make things faster, never break image delivery.
 */

import fs   from 'fs';
import os   from 'os';
import path from 'path';
import { logger } from './logger.js';

export interface ImageOptimizerOptions {
  /** Where generated files live. Defaults to a folder under the OS temp dir. */
  cacheDir?: string;
  /** Longest edge, px. 800 covers a ~400 px card at 2x. */
  maxWidth?: number;
  quality?:  number;
}

/** Given an original and the request's Accept header, the path to serve instead — or null. */
export type ImageOptimizer = (file: string, accept: string | undefined) => Promise<string | null>;

const CONVERTIBLE = /\.(jpe?g|png)$/i;

type SharpFn = (input: string) => {
  rotate(): { resize(o: object): { webp(o: object): { toFile(p: string): Promise<unknown> } } };
};

let sharpPromise: Promise<SharpFn | null> | null = null;

/** Loaded lazily and once; null when unavailable. */
function loadSharp(): Promise<SharpFn | null> {
  sharpPromise ??= import('sharp')
    .then(m => m.default as unknown as SharpFn)
    .catch(() => {
      logger.info('image-optimizer: sharp not available — serving original images');
      return null;
    });
  return sharpPromise;
}

export function makeImageOptimizer(options: ImageOptimizerOptions = {}): ImageOptimizer {
  const cacheDir = options.cacheDir ?? path.join(os.tmpdir(), 'vocabapp-image-cache');
  const maxWidth = options.maxWidth ?? 800;
  const quality  = options.quality  ?? 78;

  const inFlight = new Map<string, Promise<string | null>>();
  /** Originals that turned out smaller than their WebP — serve them as they are. */
  const keepOriginal = new Set<string>();

  async function build(file: string, out: string): Promise<string | null> {
    const sharp = await loadSharp();
    if (!sharp) return null;
    try {
      fs.mkdirSync(cacheDir, { recursive: true });
      // Written to a temp name and renamed, so a concurrent reader (or a crash)
      // can never see a half-written file.
      const tmp = `${out}.${process.pid}.tmp`;
      await sharp(file).rotate().resize({ width: maxWidth, height: maxWidth, fit: 'inside', withoutEnlargement: true })
        .webp({ quality }).toFile(tmp);
      if (fs.statSync(tmp).size >= fs.statSync(file).size) {
        fs.rmSync(tmp, { force: true });
        keepOriginal.add(file);
        return null;
      }
      fs.renameSync(tmp, out);
      return out;
    } catch (err) {
      logger.warn(`image-optimizer: could not convert ${path.basename(file)}: ${(err as Error).message}`);
      keepOriginal.add(file);
      return null;
    }
  }

  return async function optimize(file, accept) {
    if (!CONVERTIBLE.test(file) || !accept || !/image\/webp/i.test(accept)) return null;
    if (keepOriginal.has(file)) return null;

    let st: fs.Stats;
    try { st = fs.statSync(file); } catch { return null; }
    // Name carries the source's size+mtime, so an updated original is never
    // shadowed by a stale conversion, and the settings, so a change re-derives.
    const name = `${path.basename(file)}.${st.size}.${Math.round(st.mtimeMs)}.w${maxWidth}q${quality}.webp`;
    const out  = path.join(cacheDir, name);

    if (fs.existsSync(out)) return out;

    let pending = inFlight.get(out);
    if (!pending) {
      pending = build(file, out).finally(() => inFlight.delete(out));
      inFlight.set(out, pending);
    }
    return pending;
  };
}
