/**
 * tests/asset-flatten.test.js
 *
 * copyFlattened() is the build-time twin of src/server/lib/flat-static.ts's
 * buildFlatIndex() (see asset-flatten.ts's own header) — the desktop/mobile
 * build's ONLY chance to reproduce the live server's domain-flattening,
 * since a packaged Tauri/Capacitor build has no Express to do it at request
 * time. Uses the exact same fixture as tests/flat-static.test.js so a
 * collision can be asserted to resolve to the *same* winner on both paths —
 * the two implementations silently disagreeing here is invisible to every
 * other test, since none of them build both a live server and a packaged
 * app from the same fixture.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { buildFlatIndex } from '../src/server/lib/flat-static.js';
import { copyFlattened }  from '../scripts/lib/asset-flatten.js';

let srcRoot, destRoot;

function write(rel, body) {
  const full = path.join(srcRoot, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body);
}

beforeAll(() => {
  srcRoot  = fs.mkdtempSync(path.join(os.tmpdir(), 'asset-flatten-src-'));
  destRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'asset-flatten-dest-'));
  write('animals/bee.jpg',   'BEE');
  write('food/apple.jpg',    'FOOD APPLE');
  write('nature/apple.jpg',  'NATURE APPLE');   // the collision
  write('nature/river.jpg',  'RIVER');
});

afterAll(() => {
  fs.rmSync(srcRoot, { recursive: true, force: true });
  fs.rmSync(destRoot, { recursive: true, force: true });
});

describe('copyFlattened', () => {
  it('copies every file across every domain into one flat directory', () => {
    const dest = path.join(destRoot, 'copy-all');
    const { files } = copyFlattened(srcRoot, dest);
    expect(files).toBe(3); // apple.jpg collision counts once, not twice
    expect(fs.readdirSync(dest).sort()).toEqual(['apple.jpg', 'bee.jpg', 'river.jpg']);
  });

  it('resolves a same-name collision to the same winner flat-static.ts would pick at runtime', () => {
    const dest = path.join(destRoot, 'collision-winner');
    const { clashes } = copyFlattened(srcRoot, dest);
    expect(clashes).toEqual(['apple.jpg']);

    const copiedContent  = fs.readFileSync(path.join(dest, 'apple.jpg'), 'utf8');
    const runtimeWinner  = buildFlatIndex(srcRoot).index.get('apple.jpg');
    const runtimeContent = fs.readFileSync(runtimeWinner, 'utf8');
    // Not just "some file was picked" — the exact same domain's file the
    // live server would have served for a request to /images/apple.jpg.
    expect(copiedContent).toBe(runtimeContent);
    expect(copiedContent).toBe('FOOD APPLE');
  });

  it('creates the destination directory if it does not exist yet', () => {
    const dest = path.join(destRoot, 'not-yet-created', 'nested');
    expect(fs.existsSync(dest)).toBe(false);
    copyFlattened(srcRoot, dest);
    expect(fs.existsSync(dest)).toBe(true);
  });

  it('returns zero files and no clashes for a source directory that does not exist', () => {
    const result = copyFlattened(path.join(srcRoot, 'nope'), path.join(destRoot, 'from-nothing'));
    expect(result).toEqual({ files: 0, clashes: [] });
  });

  it('does not overwrite a file already at the destination from a prior run', () => {
    const dest = path.join(destRoot, 'preexisting');
    fs.mkdirSync(dest, { recursive: true });
    fs.writeFileSync(path.join(dest, 'bee.jpg'), 'STALE FROM LAST BUILD');

    const { clashes } = copyFlattened(srcRoot, dest);

    expect(clashes).toContain('bee.jpg');
    expect(fs.readFileSync(path.join(dest, 'bee.jpg'), 'utf8')).toBe('STALE FROM LAST BUILD');
  });
});
