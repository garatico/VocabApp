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


// ── Concept map ───────────────────────────────────────────────────────────────

type ConceptMap = Record<string, Record<string, string[]>>;

const CONCEPTS: ConceptMap = {
  dog:    { spanish: ['perro', 'cachorro'], portuguese: ['cachorro', 'cão'], italian: ['cane'],    french: ['chien'],   german: ['Hund', 'Welpe'], dutch: ['hond','puppy'] },
  cat:    { spanish: ['gato'],             portuguese: ['gato'],            italian: ['gatto'],   french: ['chat'],    german: ['Katze'], dutch: ['kat','poes'] },
  water:  { spanish: ['agua'],             portuguese: ['água'],            italian: ['acqua'],   french: ['eau'],     german: ['Wasser'], dutch: ['water'] },
  sun:    { spanish: ['sol'],              portuguese: ['sol'],             italian: ['sole'],    french: ['soleil'],  german: ['Sonne'], dutch: ['zon'] },
  flower: { spanish: ['flor'],             portuguese: ['flor'],            italian: ['fiore'],   french: ['fleur'],   german: ['Blume'], dutch: ['bloem'] },
  tree:   { spanish: ['árbol'],            portuguese: ['árvore'],          italian: ['albero'],  french: ['arbre'],   german: ['Baum'], dutch: ['boom'] },
  apple:  { spanish: ['manzana'],          portuguese: ['maçã'],            italian: ['mela'],    french: ['pomme'],   german: ['Apfel'], dutch: ['appel'] },
  house:  { spanish: ['casa'],             portuguese: ['casa'],            italian: ['casa'],    french: ['maison'],  german: ['Haus'], dutch: ['huis'] },
  book:   { spanish: ['libro'],            portuguese: ['livro'],           italian: ['libro'],   french: ['livre'],   german: ['Buch'], dutch: ['boek'] },
  table:  { spanish: ['mesa'],             portuguese: ['mesa'],            italian: ['tavolo'],  french: ['table'],   german: ['Tisch'], dutch: ['tafel'] },
};

/**
 * Lookup key for a word: lowercased with diacritics stripped.
 *
 * Matches norm() in the client's visual-map.ts, which the two maps have to
 * agree on. Without it the lookup was exact-match, so 'arbol' missed 'árbol' —
 * and German would have been worse, since every noun is stored capitalised
 * (Hund) while a learner may well type it lowercase.
 */
function normKey(s: string): string {
  return s.normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase();
}

// Build reverse lookup: lang → normalised word → conceptKey (once at startup)
const _wordToKey: Record<string, Record<string, string>> = {};
for (const [key, langs] of Object.entries(CONCEPTS)) {
  for (const [lang, words] of Object.entries(langs)) {
    for (const word of words) {
      (_wordToKey[lang] ??= {})[normKey(word)] = key;
    }
  }
}

function conceptKeyFor(language: string, word: string): string | null {
  if (!word) return null;
  return _wordToKey[language.toLowerCase()]?.[normKey(word)] ?? null;
}

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
