/**
 * asset-resolver.ts — the Tauri-side AssetResolver, backed by the manifest
 * scripts/lib/asset-manifest.ts writes at build time instead of a runtime
 * fs.existsSync check (there is none in a webview). Fetched once via plain
 * fetch() — the same mechanism vocab-source.ts already uses for
 * /data/index.json — so this needs no Tauri fs API at all.
 *
 * URL formats match src/server/lib/svg-loader.ts / audio-loader.ts exactly,
 * since these are the same physical files, just served as static assets
 * bundled into the app instead of by Express.
 */
import { conceptKeyFor } from '../../shared/assets/svg-concepts.js';
import { slugify } from '../../shared/assets/audio-slug.js';
import type { AssetResolver } from '../../shared/assets/types.js';

interface RawManifest {
  svgConcepts: string[];
  audioSlugs: Record<string, string[]>;
}

interface Manifest {
  svgConcepts: Set<string>;
  audioSlugs: Map<string, Set<string>>;
}

let cached: Manifest | null = null;

async function loadManifest(): Promise<Manifest> {
  if (cached) return cached;
  try {
    const res = await fetch('/data/asset-manifest.json');
    const raw = res.ok ? (await res.json() as RawManifest) : { svgConcepts: [], audioSlugs: {} };
    cached = {
      svgConcepts: new Set(raw.svgConcepts),
      audioSlugs: new Map(Object.entries(raw.audioSlugs).map(([lang, slugs]) => [lang, new Set(slugs)])),
    };
  } catch {
    cached = { svgConcepts: new Set(), audioSlugs: new Map() };
  }
  return cached;
}

/** Fetches the manifest once; safe to call before it resolves — callers get no asset URLs until then. */
export async function initTauriAssetResolver(): Promise<AssetResolver> {
  const manifest = await loadManifest();
  return {
    svgUrl(language, word) {
      const key = conceptKeyFor(language, word);
      return key && manifest.svgConcepts.has(key) ? `/svgs/${key}.svg` : null;
    },
    audioUrl(language, word) {
      const lang = language.toLowerCase();
      const slug = slugify(word);
      return manifest.audioSlugs.get(lang)?.has(slug) ? `/audio/${lang}/${slug}.wav` : null;
    },
  };
}
