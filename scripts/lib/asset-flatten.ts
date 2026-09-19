/**
 * asset-flatten.ts — build-time counterpart to src/server/lib/flat-static.ts.
 *
 * `data/images/` and `data/emoji/` are organised by domain on disk
 * (`images/animals/bee.jpg`) but addressed flatly as `/images/bee.jpg` (see
 * flat-static.ts's own header for why). Express serves that flattening live
 * at request time via an in-memory index. A packaged Tauri/Capacitor build
 * has no Express to do that at runtime, so build-native.ts calls
 * copyFlattened() below once, at build time, to physically write the same
 * flattened layout into public/ before `vite build` picks it up.
 *
 * Domains are visited in sorted order — same as flat-static.ts's own
 * buildFlatIndex — so a filename that exists in two domains resolves to the
 * *same* winner on both the live server and a packaged build, rather than
 * whichever this filesystem's `readdirSync` happened to return first.
 */

import fs   from 'node:fs';
import path from 'node:path';

/**
 * Copy every file under `fromDir`'s domain subdirectories into `toDir`,
 * flattening the domain level away. Returns how many files were copied and
 * the names of any collisions (a filename that exists in more than one
 * domain) — the first domain, alphabetically, wins; every later one with
 * the same filename is skipped and reported.
 */
export function copyFlattened(fromDir: string, toDir: string): { files: number; clashes: string[] } {
  const clashes: string[] = [];
  let files = 0;
  if (!fs.existsSync(fromDir)) return { files, clashes };
  fs.mkdirSync(toDir, { recursive: true });

  const copyOne = (src: string, name: string): void => {
    const dest = path.join(toDir, name);
    if (fs.existsSync(dest)) { clashes.push(name); return; }
    fs.copyFileSync(src, dest);
    files++;
  };

  const entries = fs.readdirSync(fromDir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const e of entries) {
    const p = path.join(fromDir, e.name);
    if (!e.isDirectory()) { copyOne(p, e.name); continue; }
    // One level of domain subdirectory, same as flat-static.ts's own index —
    // recursing further would let two *different* domains' own nested
    // structure collide in ways flat-static.ts's runtime index never has to
    // consider, since it only ever walks exactly this deep too.
    for (const file of fs.readdirSync(p, { withFileTypes: true })
      .filter(f => f.isFile())
      .sort((a, b) => a.name.localeCompare(b.name))) {
      copyOne(path.join(p, file.name), file.name);
    }
  }
  return { files, clashes };
}
