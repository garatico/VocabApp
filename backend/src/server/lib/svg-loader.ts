/**
 * SVG Loader - Filesystem-based SVG detection
 *
 * All SVGs live in data/svgs/ named by English concept (e.g. dog.svg).
 * Words in any language resolve to the same shared file via the CONCEPTS map.
 *
 * To add a new SVG: drop the file in data/svgs/ with an English concept name,
 * then add the word→concept mappings to CONCEPTS below, and mirror the entry
 * in client-side visual-map.ts.
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const appRoot    = path.join(__dirname, '../../../..');

// ── Concept map ───────────────────────────────────────────────────────────────

type ConceptMap = Record<string, Record<string, string[]>>;

const CONCEPTS: ConceptMap = {
  dog:    { spanish: ['perro', 'cachorro'], portuguese: ['cachorro', 'cão'], italian: ['cane'],    french: ['chien'] },
  cat:    { spanish: ['gato'],             portuguese: ['gato'],            italian: ['gatto'],   french: ['chat'] },
  water:  { spanish: ['agua'],             portuguese: ['água'],            italian: ['acqua'],   french: ['eau'] },
  sun:    { spanish: ['sol'],              portuguese: ['sol'],             italian: ['sole'],    french: ['soleil'] },
  flower: { spanish: ['flor'],             portuguese: ['flor'],            italian: ['fiore'],   french: ['fleur'] },
  tree:   { spanish: ['árbol'],            portuguese: ['árvore'],          italian: ['albero'],  french: ['arbre'] },
  apple:  { spanish: ['manzana'],          portuguese: ['maçã'],            italian: ['mela'],    french: ['pomme'] },
  house:  { spanish: ['casa'],             portuguese: ['casa'],            italian: ['casa'],    french: ['maison'] },
  book:   { spanish: ['libro'],            portuguese: ['livro'],           italian: ['libro'],   french: ['livre'] },
  table:  { spanish: ['mesa'],             portuguese: ['mesa'],            italian: ['tavolo'],  french: ['table'] },
};

// Build reverse lookup: lang → word → conceptKey (computed once at startup)
const _wordToKey: Record<string, Record<string, string>> = {};
for (const [key, langs] of Object.entries(CONCEPTS)) {
  for (const [lang, words] of Object.entries(langs)) {
    (_wordToKey[lang] ??= {})[words[0]] = key;
    for (const word of words) {
      (_wordToKey[lang] ??= {})[word] = key;
    }
  }
}

function conceptKeyFor(language: string, word: string): string | null {
  return _wordToKey[language.toLowerCase()]?.[word] ?? null;
}

function sharedSvgPath(key: string): string {
  return path.join(appRoot, 'data', 'svgs', `${key}.svg`);
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
  const sharedDir = path.join(appRoot, 'data', 'svgs');
  try {
    if (!fs.existsSync(sharedDir)) {
      fs.mkdirSync(sharedDir, { recursive: true });
    }
    return true;
  } catch (err) {
    console.error('Error creating SVG directory:', (err as Error).message);
    return false;
  }
}

export default { getSvgUrl, ensureSvgDirs };
