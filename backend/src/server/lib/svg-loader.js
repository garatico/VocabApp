/**
 * SVG Loader - Filesystem-based SVG detection
 *
 * Resolution order for getSvgUrl(language, word):
 *   1. data/svgs/shared/{concept}.svg  — canonical English-named file,
 *      used for all languages that map to the same concept (e.g. dog →
 *      chien, perro, cane, cachorro all resolve to /svgs/shared/dog.svg)
 *   2. data/svgs/{language}/{word}.svg — legacy per-language file
 *
 * To add a new shared SVG: drop the file in data/svgs/shared/ with an
 * English concept name, then add the word→concept mappings below.
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
  return path.join(appRoot, 'data', 'svgs', 'shared', `${key}.svg`);
}

function langSvgPath(language, word) {
  return path.join(appRoot, 'data', 'svgs', language.toLowerCase(), `${word}.svg`);
}

function fileExists(p) {
  try { return fs.existsSync(p); } catch { return false; }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Check if any SVG (shared or per-language) exists for a word.
 */
export function hasSvg(language, word) {
  if (!language || !word) return false;
  const key = conceptKeyFor(language, word);
  if (key && fileExists(sharedSvgPath(key))) return true;
  return fileExists(langSvgPath(language, word));
}

/**
 * Return the URL for the best available SVG:
 *   /svgs/shared/{concept}.svg  if a shared canonical exists
 *   /svgs/{language}/{word}.svg  if a per-language file exists
 *   null                         if nothing is found
 */
export function getSvgUrl(language, word) {
  if (!language || !word) return null;

  const key = conceptKeyFor(language, word);
  if (key && fileExists(sharedSvgPath(key))) {
    return `/svgs/shared/${key}.svg`;
  }

  if (fileExists(langSvgPath(language, word))) {
    return `/svgs/${language.toLowerCase()}/${word}.svg`;
  }

  return null;
}

/**
 * Ensure SVG directories exist (called at server startup).
 */
export function ensureSvgDirs() {
  const svgsRoot = path.join(appRoot, 'data', 'svgs');
  const dirs = ['shared', 'spanish', 'portuguese', 'italian', 'french'];

  try {
    if (!fs.existsSync(svgsRoot)) {
      fs.mkdirSync(svgsRoot, { recursive: true });
    }
    dirs.forEach(d => {
      const p = path.join(svgsRoot, d);
      if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
    });
    return true;
  } catch (err) {
    console.error('Error creating SVG directories:', err.message);
    return false;
  }
}

/**
 * SVG counts per language (for admin stats).
 */
export function getSvgStats() {
  const stats = {};
  const languages = ['shared', 'spanish', 'portuguese', 'italian', 'french'];
  languages.forEach(lang => {
    const dir = path.join(appRoot, 'data', 'svgs', lang);
    try {
      stats[lang] = fs.existsSync(dir)
        ? fs.readdirSync(dir).filter(f => f.endsWith('.svg')).length
        : 0;
    } catch { stats[lang] = 0; }
  });
  return stats;
}

export default { hasSvg, getSvgUrl, ensureSvgDirs, getSvgStats };
