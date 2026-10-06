/**
 * build-static.ts — `npm run build:static`: the web app as plain files, no Node process at runtime.
 *
 * This is what the hosted site deploys (render.yaml, type: static). A server holding every language in
 * memory is what kept running out of it on a small host; files on a CDN cannot.
 *
 *   1. stage data/{images,emoji,svgs} flat into public/ (gitignored copies; data/ is never touched)
 *   2. shrink the staged photos — the server did this per request (image-optimizer.ts); here it is once,
 *      in place, keeping the same names so every /images/<name> URL still resolves
 *   3. vite build with VITE_STATIC_VOCAB=1 -> dist/
 *   4. write one rank-ordered JSONL per language into dist/data/
 */

import fs   from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { copyFlattened } from './lib/asset-flatten.js';

const root = path.resolve(import.meta.dirname, '..');
const MAX_WIDTH = 800;

function run(cmd: string, env: Record<string, string> = {}): void {
  console.log(`  $ ${cmd}`);
  execSync(cmd, { cwd: root, stdio: 'inherit', env: { ...process.env, ...env } });
}

async function shrinkPhotos(dir: string): Promise<void> {
  let sharp: typeof import('sharp').default;
  try {
    sharp = (await import('sharp')).default;
  } catch {
    console.log('  sharp not installed — photos stay at full size');
    return;
  }
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

async function main(): Promise<void> {
  console.log('\n[1/4] Stage assets');
  for (const name of ['images', 'emoji', 'svgs']) {
    const dest = path.join(root, 'public', name);
    fs.rmSync(dest, { recursive: true, force: true });
    const { files, clashes } = copyFlattened(path.join(root, 'data', name), dest);
    console.log(`  ${name.padEnd(7)} ${files} files${clashes.length ? ` (${clashes.length} name clashes, first kept)` : ''}`);
  }

  console.log('\n[2/4] Shrink photos');
  await shrinkPhotos(path.join(root, 'public', 'images'));

  console.log('\n[3/4] Vite build');
  // Vite does not overwrite files already in dist/, so a stale build would survive.
  fs.rmSync(path.join(root, 'dist'), { recursive: true, force: true });
  run('npx vite build', { VITE_STATIC_VOCAB: '1' });

  console.log('\n[4/4] Export vocabulary');
  run('npx tsx scripts/export-static-vocab.ts --static dist');
}

main().catch(err => { console.error(err); process.exit(1); });
