/**
 * SVG Loader - Filesystem-based SVG detection
 *
 * All SVGs live in data/svgs/shared/ named by English concept (e.g. dog.svg).
 * Words in any language resolve to the same shared file via the CONCEPTS map.
 *
 * To add a new SVG: drop the file in data/svgs/shared/ with an English concept
 * name, then add the word→concept mappings to CONCEPTS below, and mirror the
 * entry in client-side visual-map.ts.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const appRoot    = path.join(__dirname, '../../../..');

// ── Concept map ───────────────────────────────────────────────────────────────
// Maps every known word in every language to a shared SVG concept key.
// Key  = English concept name = filename in data/svgs/shared/ (without .svg)
// Keep in sync with data/svgs/shared/ and client-side visual-map.ts.

const CONCEPTS = {
  dog:    { spanish: ['perro', 'cachorro'], portuguese: ['cachorro', 'cão'], italian: ['cane'],          french: ['chien'] },
  cat:    { spanish: ['gato'],             portuguese: ['gato'],            italian: ['gatto'],          french: ['chat'] },
  water:  { spanish: ['agua'],             portuguese: ['água'],            italian: ['acqua'],          french: ['eau'] },
  sun:    { spanish: ['sol'],              portuguese: ['sol'],             italian: ['sole'],           french: ['soleil'] },
  flower: { spanish: ['flor'],             portuguese: ['flor'],            italian: ['fiore'],          french: ['fleur'] },
  tree:   { spanish: ['árbol'],            portuguese: ['árvore'],          italian: ['albero'],         french: ['arbre'] },
  apple:  { spanish: ['manzana'],          portuguese: ['maçã'],            italian: ['mela'],           french: ['pomme'] },
  house:  { spanish: ['casa'],             portuguese: ['casa'],            italian: ['casa'],           french: ['maison'] },
  book:   { spanish: ['libro'],            portuguese: ['livro'],           italian: ['libro'],          french: ['livre'] },
  table:  { spanish: ['mesa'],             portuguese: ['mesa'],            italian: ['tavolo'],         french: ['table'] },
};

// Build reverse lookup: lang → word → conceptKey  (computed once at startup)
const _wordToKey = {};
for (const [key, langs] of Object.entries(CONCEPTS)) {
  for (const [lang, words] of Object.entries(langs)) {
    for (const word of words) {
      (_wordToKey[lang] ??= {})[word] = key;
    }
  }
}

function conceptKeyFor(language, word) {
  return _wordToKey[language.toLowerCase()]?.[word] ?? null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sharedSvgPath(key) {
  return path.join(appRoot, 'data', 'svgs', `${key}.svg`);
}

function fileExists(p) {
  try { return fs.existsSync(p); } catch { return false; }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Return the shared SVG URL for a word, or null if no mapping exists.
 *   /svgs/{concept}.svg
 */
export function getSvgUrl(language, word) {
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
export function ensureSvgDirs() {
  const sharedDir = path.join(appRoot, 'data', 'svgs');
  try {
    if (!fs.existsSync(sharedDir)) {
      fs.mkdirSync(sharedDir, { recursive: true });
    }
    return true;
  } catch (err) {
    console.error('Error creating SVG directory:', err.message);
    return false;
  }
}

export default { getSvgUrl, ensureSvgDirs };
