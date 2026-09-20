/**
 * asset-manifest.ts — build-time counterpart to
 * src/server/lib/svg-loader.ts / audio-loader.ts, for the same reason
 * asset-flatten.ts exists: a packaged Tauri build has no fs.existsSync at
 * runtime, so it can't ask "does this word have an SVG/audio file" the way
 * the live server does. This runs once at build time and writes the answer
 * for every asset that actually exists into public/data/asset-manifest.json,
 * which src/client/tauri/asset-resolver.ts fetches and checks against
 * instead.
 *
 * Neither check needs the database: svg-loader's CONCEPTS map is a small,
 * fixed word list (so this just checks which of ~10 concept files exist),
 * and audio files are one-per-(language,word) with no separate index to
 * consult — so this simply lists what's actually on disk in data/audio/.
 */

import fs   from 'node:fs';
import path from 'node:path';

export interface AssetManifest {
  /** Concept keys (e.g. "dog") that have a real file in data/svgs/. */
  svgConcepts: string[];
  /** language -> slugs that have a real .wav file in data/audio/<language>/. */
  audioSlugs: Record<string, string[]>;
}

export function buildAssetManifest(dataDir: string): AssetManifest {
  const svgDir = path.join(dataDir, 'svgs');
  const svgConcepts = fs.existsSync(svgDir)
    ? fs.readdirSync(svgDir)
        .filter(f => f.endsWith('.svg'))
        .map(f => f.slice(0, -'.svg'.length))
        .sort()
    : [];

  const audioDir = path.join(dataDir, 'audio');
  const audioSlugs: Record<string, string[]> = {};
  if (fs.existsSync(audioDir)) {
    for (const entry of fs.readdirSync(audioDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const langDir = path.join(audioDir, entry.name);
      audioSlugs[entry.name] = fs.readdirSync(langDir)
        .filter(f => f.endsWith('.wav'))
        .map(f => f.slice(0, -'.wav'.length))
        .sort();
    }
  }

  return { svgConcepts, audioSlugs };
}

export function writeAssetManifest(dataDir: string, outPath: string): AssetManifest {
  const manifest = buildAssetManifest(dataDir);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(manifest));
  return manifest;
}
