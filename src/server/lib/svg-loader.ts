/**
 * SVG Loader - Filesystem-based SVG detection
 *
 * All SVGs live in data/svgs/ named by English concept (e.g. dog.svg).
 * Words in any language resolve to the same shared file via the CONCEPTS map.
 *
 * To add a new SVG: drop the file in data/svgs/ with an English concept name,
 * then add the word→concept mappings to CONCEPTS below, and mirror the entry
 * in client-side visual-map.ts. These two maps are separate on purpose — this
 * one also checks the file exists on disk — but they must not disagree about
 * which words map to which concept.
 */

import fs   from 'fs';
import path from 'path';
import { dataDir } from './paths.js';
import { logger } from './logger.js';
import { conceptKeyFor } from '../../shared/assets/svg-concepts.js';

function sharedSvgPath(key: string): string {
  return path.join(dataDir, 'svgs', `${key}.svg`);
}

function fileExists(p: string): boolean {
  try { return fs.existsSync(p); } catch { return false; }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Return the shared SVG URL for a word, or null if no mapping exists.
 *   /svgs/{concept}.svg
 */
export function getSvgUrl(language: string, word: string): string | null {
  if (!language || !word) return null;
  const key = conceptKeyFor(language, word);
  if (key && fileExists(sharedSvgPath(key))) {
    return `/svgs/${key}.svg`;
  }
  return null;
}

/**
 * Ensure the shared SVG directory exists (called at server startup).
 */
export function ensureSvgDirs(): boolean {
  const sharedDir = path.join(dataDir, 'svgs');
  try {
    if (!fs.existsSync(sharedDir)) {
      fs.mkdirSync(sharedDir, { recursive: true });
    }
    return true;
  } catch (err) {
    logger.error('Error creating SVG directory:', (err as Error).message);
    return false;
  }
}

export default { getSvgUrl, ensureSvgDirs };
