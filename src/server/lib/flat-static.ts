/**
 * flat-static.ts — serve a two-level asset tree under a flat URL space.
 *
 * `data/images/` and `data/emoji/` are organised by domain on disk
 * (`images/animals/bee.jpg`, `images/food/apple.jpg`) but the app addresses
 * them flatly, as `/images/bee.jpg` — the domain is a filing decision, not part
 * of the word's identity, and `visual-map.ts` has always built URLs that way.
 *
 * This used to be a loop mounting one `express.static` per domain onto the same
 * prefix. Two problems with that:
 *
 *   1. Two domains holding the same filename — `nature/apple.jpg` alongside
 *      `food/apple.jpg` — resolved to whichever `readdirSync` happened to
 *      return first, and the other file became permanently unreachable with no
 *      indication that anything was wrong.
 *   2. The domain list was read once at boot, so a pipeline run that created a
 *      new domain directory needed a server restart before the images appeared.
 *
 * So the index is explicit: one filename → one path, collisions reported by
 * name at build time, and a miss triggers at most one rebuild per
 * `rescanCooldownMs` so newly-written files show up on their own.
 *
 * Path traversal is impossible by construction — a request is only ever
 * answered from a value already in the index, never from a path derived from
 * the URL.
 */

import fs   from 'fs';
import path from 'path';
import type { Request, Response, NextFunction } from 'express';
import { logger } from './logger.js';

export interface FlatStaticOptions {
  /** Seconds for the Cache-Control max-age header. Default 3600. */
  maxAgeSeconds?: number;
  /** Minimum gap between index rebuilds triggered by a miss. Default 5000. */
  rescanCooldownMs?: number;
}

/** filename → absolute path, plus the collisions found while building it. */
export function buildFlatIndex(root: string): {
  index: Map<string, string>;
  collisions: { name: string; kept: string; ignored: string }[];
} {
  const index = new Map<string, string>();
  const collisions: { name: string; kept: string; ignored: string }[] = [];

  let domains: fs.Dirent[];
  try {
    domains = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return { index, collisions };   // directory absent — nothing to serve
  }

  // Sorted so the winner of a collision is stable across machines rather than
  // whatever order the filesystem happened to hand back.
  for (const domain of domains.filter(d => d.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const domainDir = path.join(root, domain.name);
    let files: fs.Dirent[];
    try {
      files = fs.readdirSync(domainDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const file of files.filter(f => f.isFile()).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(domainDir, file.name);
      const seen = index.get(file.name);
      if (seen) {
        collisions.push({ name: file.name, kept: seen, ignored: full });
        continue;
      }
      index.set(file.name, full);
    }
  }

  return { index, collisions };
}

/**
 * Express handler serving `root/<any domain>/<file>` at `<mount>/<file>`.
 *
 * Unknown names fall through to `next()`, so this composes with whatever comes
 * after it exactly as `express.static` did.
 */
export function flatStatic(root: string, options: FlatStaticOptions = {}) {
  const maxAge    = options.maxAgeSeconds ?? 3600;
  const cooldown  = options.rescanCooldownMs ?? 5000;

  let index      = new Map<string, string>();
  let lastScanAt = 0;

  function rescan(reason: string): void {
    const { index: next, collisions } = buildFlatIndex(root);
    index      = next;
    lastScanAt = Date.now();
    for (const c of collisions) {
      logger.warn(
        `flat-static: '${c.name}' exists in two domains under ${root}. ` +
        `Serving ${path.relative(root, c.kept)}; ${path.relative(root, c.ignored)} is unreachable. ` +
        `Rename one of them.`
      );
    }
    logger.debug(`flat-static: indexed ${index.size} files under ${root} (${reason})`);
  }

  rescan('startup');

  return function serveFlat(req: Request, res: Response, next: NextFunction): void {
    // `req.path` is '/bee.jpg'. Only the basename is ever consulted, and only
    // as a key — nothing derived from the URL reaches the filesystem.
    const name = path.basename(decodeURIComponent(req.path));

    let file = index.get(name);

    // A miss may just mean the pipeline wrote the file after the last scan.
    if (!file && Date.now() - lastScanAt > cooldown) {
      rescan('miss');
      file = index.get(name);
    }

    if (!file) { next(); return; }

    res.set('Cache-Control', `public, max-age=${maxAge}`);
    res.sendFile(file, err => { if (err) next(err); });
  };
}
