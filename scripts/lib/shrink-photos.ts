/**
 * shrink-photos.ts — resize the staged photos once, at build time, for every build without a server.
 *
 * data/images/ holds Wikipedia originals (27 MB, the biggest 2.4 MB). The server derives a small copy per
 * request (src/server/lib/image-optimizer.ts); a static site or a packaged app has no server, so
 * build-static.ts and build-native.ts shrink their staged copies in place instead, keeping each name so
 * every /images/<name> URL still resolves. Only the copies under public/ are touched, never data/.
 * `sharp` is an optional dependency: without it the photos stay at full size.
 */

import fs   from 'node:fs';
import path from 'node:path';

const MAX_WIDTH = 800;

export async function shrinkPhotos(dir: string): Promise<void> {
  let sharp: typeof import('sharp').default;
  try {
    sharp = (await import('sharp')).default;
  } catch {
    console.log('  sharp not installed — photos stay at full size');
    return;
  }
  if (!fs.existsSync(dir)) return;
  let before = 0, after = 0;
  for (const name of fs.readdirSync(dir).filter(n => /\.(jpe?g|png)$/i.test(n))) {
    const file = path.join(dir, name);
    const input = fs.readFileSync(file);
    const pipeline = sharp(input).rotate().resize({ width: MAX_WIDTH, height: MAX_WIDTH, fit: 'inside', withoutEnlargement: true });
    let out: Buffer;
    try {
      out = await (/\.png$/i.test(name) ? pipeline.png({ compressionLevel: 9 }) : pipeline.jpeg({ quality: 80, mozjpeg: true })).toBuffer();
    } catch (err) {
      console.warn(`  skipped ${name}: ${(err as Error).message} (${input.length} bytes)`);
      continue;
    }
    before += input.length;
    if (out.length < input.length) { fs.writeFileSync(file, out); after += out.length; } else { after += input.length; }
  }
  console.log(`  photos ${(before / 1048576).toFixed(1)} MB -> ${(after / 1048576).toFixed(1)} MB`);
}
