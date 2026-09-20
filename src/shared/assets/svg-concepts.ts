/**
 * svg-concepts.ts — the word→concept mapping, moved out of
 * src/server/lib/svg-loader.ts so the Tauri client can resolve the same
 * concept key without needing fs.existsSync (there is no filesystem check
 * in a webview — see src/client/tauri/asset-resolver.ts, which checks a
 * build-time manifest instead).
 *
 * All SVGs live in data/svgs/ named by English concept (e.g. dog.svg).
 * Words in any language resolve to the same shared file via CONCEPTS. To add
 * one: drop the file in data/svgs/, add the word→concept mapping here, and
 * mirror the entry in the client's visual-map.ts — the two maps are separate
 * on purpose (svg-loader.ts also checks the file exists on disk) but must
 * not disagree about which words map to which concept.
 */

type ConceptMap = Record<string, Record<string, string[]>>;

export const CONCEPTS: ConceptMap = {
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
 * Lookup key for a word: lowercased with diacritics stripped. Matches
 * norm() in the client's visual-map.ts, which the two maps have to agree
 * on — without it 'arbol' missed 'árbol', and German (nouns stored
 * capitalised) would have been worse.
 */
export function normKey(s: string): string {
  return s.normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase();
}

// Build reverse lookup: lang -> normalised word -> conceptKey (once at import time)
const wordToKey: Record<string, Record<string, string>> = {};
for (const [key, langs] of Object.entries(CONCEPTS)) {
  for (const [lang, words] of Object.entries(langs)) {
    for (const word of words) {
      (wordToKey[lang] ??= {})[normKey(word)] = key;
    }
  }
}

export function conceptKeyFor(language: string, word: string): string | null {
  if (!word) return null;
  return wordToKey[language.toLowerCase()]?.[normKey(word)] ?? null;
}
