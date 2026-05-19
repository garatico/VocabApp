/**
 * visual-map.ts
 *
 * Concept-based visual fallbacks for Picture Quiz mode.
 *
 * Each entry defines one concept (e.g. "dog") with:
 *   - emoji   — Unicode emoji fallback
 *   - svgUrl  — OpenMoji CDN URL (preferred over emoji when present)
 *   - words   — every word across all supported languages that represents
 *               this concept, so one entry covers perro + cachorro + cão + cane + chien
 *
 * Language keys match the full names used throughout the app
 * ('spanish', 'portuguese', 'italian', 'french').
 *
 * OpenMoji CDN base: https://cdn.jsdelivr.net/npm/openmoji@15.0.0/color/svg/
 * Filename = Unicode codepoint, e.g. U+1F415 → 1F415.svg
 * Browse at: https://openmoji.org
 *
 * Workflow:
 *   1. Add/edit entries here for any word missing a visual.
 *   2. Once happy, promote to the DB via the admin panel (paste the svgUrl
 *      into the svg_url field). Remove from here once it's in the DB.
 */

const CDN    = 'https://cdn.jsdelivr.net/npm/openmoji@15.0.0/color/svg';
const SHARED = '/svgs/shared';  // served by Express from data/svgs/shared/

type Languages = 'spanish' | 'portuguese' | 'italian' | 'french';

interface Concept {
  /** English concept name — matches the filename in data/svgs/shared/ */
  key?: string;
  /** Unicode emoji — always include as a cheap fallback */
  emoji?: string;
  /**
   * SVG URL used as a client-side fallback when the server returns no svg_url.
   * Prefer SHARED paths (local files) over CDN where a shared file exists.
   * The server's getSvgUrl() already resolves known words to /svgs/shared/,
   * so this fallback mainly covers words the server concept-map doesn't list yet.
   */
  svgUrl?: string;
  /** All words across languages that represent this concept */
  words: Partial<Record<Languages, string[]>>;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONCEPTS
// ─────────────────────────────────────────────────────────────────────────────

const CONCEPTS: Concept[] = [

  // ── Animals ───────────────────────────────────────────────────────────────

  {
    key: 'dog', emoji: '🐕', svgUrl: `${SHARED}/dog.svg`,
    words: {
      spanish:    ['perro', 'cachorro'],
      portuguese: ['cachorro', 'cão'],
      italian:    ['cane'],
      french:     ['chien'],
    },
  },
  {
    key: 'cat', emoji: '🐱', svgUrl: `${SHARED}/cat.svg`,
    words: {
      spanish:    ['gato'],
      portuguese: ['gato'],
      italian:    ['gatto'],
      french:     ['chat'],
    },
  },
  {
    key: 'horse', emoji: '🐴', svgUrl: `${CDN}/1F434.svg`,  // no shared SVG yet
    words: {
      spanish:    ['caballo'],
      portuguese: ['cavalo'],
      italian:    ['cavallo'],
      french:     ['cheval'],
    },
  },
  {
    emoji: '🐄',
    // svgUrl: `${CDN}/1F404.svg`,  // uncomment when ready
    words: {
      spanish:    ['vaca'],
      portuguese: ['vaca'],
      italian:    ['mucca', 'vacca'],
      french:     ['vache'],
    },
  },
  {
    emoji: '🐷',
    // svgUrl: `${CDN}/1F437.svg`,
    words: {
      spanish:    ['cerdo'],
      portuguese: ['porco'],
      italian:    ['maiale'],
      french:     ['cochon'],
    },
  },
  {
    emoji: '🐑',
    // svgUrl: `${CDN}/1F411.svg`,
    words: {
      spanish:    ['oveja'],
      portuguese: ['ovelha'],
      italian:    ['pecora'],
      french:     ['mouton', 'brebis'],
    },
  },
  {
    emoji: '🐺',
    // svgUrl: `${CDN}/1F43A.svg`,
    words: {
      spanish:    ['lobo'],
      portuguese: ['lobo'],
      italian:    ['lupo'],
      french:     ['loup'],
    },
  },
  {
    emoji: '🐻',
    // svgUrl: `${CDN}/1F43B.svg`,
    words: {
      spanish:    ['oso'],
      portuguese: ['urso'],
      italian:    ['orso'],
      french:     ['ours'],
    },
  },
  {
    emoji: '🐒',
    // svgUrl: `${CDN}/1F412.svg`,
    words: {
      spanish:    ['mono'],
      portuguese: ['macaco'],
      italian:    ['scimmia'],
      french:     ['singe'],
    },
  },
  {
    emoji: '🐘',
    // svgUrl: `${CDN}/1F418.svg`,
    words: {
      spanish:    ['elefante'],
      portuguese: ['elefante'],
      italian:    ['elefante'],
      french:     ['éléphant'],
    },
  },
  {
    emoji: '🦁',
    // svgUrl: `${CDN}/1F981.svg`,
    words: {
      spanish:    ['león', 'animal'],
      portuguese: ['leão', 'animal'],
      italian:    ['leone', 'animale'],
      french:     ['lion', 'animal'],
    },
  },
  {
    emoji: '🐯',
    // svgUrl: `${CDN}/1F42F.svg`,
    words: {
      spanish:    ['tigre'],
      portuguese: ['tigre'],
      italian:    ['tigre'],
      french:     ['tigre'],
    },
  },
  {
    emoji: '🐦',
    // svgUrl: `${CDN}/1F426.svg`,
    words: {
      spanish:    ['pájaro'],
      portuguese: ['pássaro'],
      italian:    ['uccello'],
      french:     ['oiseau'],
    },
  },
  {
    // Both live fish (pez) and food fish (pescado) share the same visual
    emoji: '🐟',
    // svgUrl: `${CDN}/1F41F.svg`,
    words: {
      spanish:    ['pez', 'pescado'],
      portuguese: ['peixe'],
      italian:    ['pesce'],
      french:     ['poisson'],
    },
  },
  {
    emoji: '🐍',
    // svgUrl: `${CDN}/1F40D.svg`,
    words: {
      spanish:    ['serpiente'],
      portuguese: ['serpente', 'cobra'],
      italian:    ['serpente'],
      french:     ['serpent'],
    },
  },
  {
    emoji: '🐛',  // caterpillar — stands in for insects generally
    words: {
      spanish:    ['insecto'],
      portuguese: ['inseto'],
      italian:    ['insetto'],
      french:     ['insecte'],
    },
  },

  // ── Nature & Weather ──────────────────────────────────────────────────────

  {
    key: 'water', emoji: '💧', svgUrl: `${SHARED}/water.svg`,
    words: {
      spanish:    ['agua'],
      portuguese: ['água'],
      italian:    ['acqua'],
      french:     ['eau'],
    },
  },
  {
    emoji: '🔥',
    words: {
      spanish:    ['fuego'],
      portuguese: ['fogo'],
      italian:    ['fuoco'],
      french:     ['feu'],
    },
  },
  {
    emoji: '💨',
    words: {
      spanish:    ['aire', 'viento'],
      portuguese: ['ar', 'vento'],
      italian:    ['aria', 'vento'],
      french:     ['air', 'vent'],
    },
  },
  {
    emoji: '🌍',  // globe — "earth" as a concept
    words: {
      spanish:    ['tierra'],
      portuguese: ['terra'],
      italian:    ['terra'],
      french:     ['terre'],
    },
  },
  {
    emoji: '🌊',
    words: {
      spanish:    ['mar'],
      portuguese: ['mar'],
      italian:    ['mare'],
      french:     ['mer'],
    },
  },
  {
    emoji: '🏞️',  // landscape — closest to river
    words: {
      spanish:    ['río'],
      portuguese: ['rio'],
      italian:    ['fiume'],
      french:     ['rivière', 'fleuve'],
    },
  },
  {
    emoji: '⛰️',
    words: {
      spanish:    ['montaña'],
      portuguese: ['montanha'],
      italian:    ['montagna'],
      french:     ['montagne'],
    },
  },
  {
    emoji: '🌲',
    words: {
      spanish:    ['bosque'],
      portuguese: ['floresta'],
      italian:    ['foresta'],
      french:     ['forêt'],
    },
  },
  {
    key: 'tree', emoji: '🌳', svgUrl: `${SHARED}/tree.svg`,
    words: {
      spanish:    ['árbol'],
      portuguese: ['árvore'],
      italian:    ['albero'],
      french:     ['arbre'],
    },
  },
  {
    emoji: '🌱',
    words: {
      spanish:    ['planta', 'semilla'],
      portuguese: ['planta', 'semente'],
      italian:    ['pianta', 'seme'],
      french:     ['plante', 'graine'],
    },
  },
  {
    key: 'flower', emoji: '🌸', svgUrl: `${SHARED}/flower.svg`,
    words: {
      spanish:    ['flor'],
      portuguese: ['flor'],
      italian:    ['fiore'],
      french:     ['fleur'],
    },
  },
  {
    emoji: '🍃',
    words: {
      spanish:    ['hoja'],
      portuguese: ['folha'],
      italian:    ['foglia'],
      french:     ['feuille'],
    },
  },
  {
    emoji: '🌤️',
    words: {
      spanish:    ['cielo'],
      portuguese: ['céu'],
      italian:    ['cielo'],
      french:     ['ciel'],
    },
  },
  {
    key: 'sun', emoji: '☀️', svgUrl: `${SHARED}/sun.svg`,
    words: {
      spanish:    ['sol'],
      portuguese: ['sol'],
      italian:    ['sole'],
      french:     ['soleil'],
    },
  },
  {
    emoji: '🌙',
    words: {
      spanish:    ['luna'],
      portuguese: ['lua'],
      italian:    ['luna'],
      french:     ['lune'],
    },
  },
  {
    emoji: '⭐',
    words: {
      spanish:    ['estrella'],
      portuguese: ['estrela'],
      italian:    ['stella'],
      french:     ['étoile'],
    },
  },
  {
    emoji: '☁️',
    words: {
      spanish:    ['nube'],
      portuguese: ['nuvem'],
      italian:    ['nuvola'],
      french:     ['nuage'],
    },
  },
  {
    emoji: '🌧️',
    words: {
      spanish:    ['lluvia'],
      portuguese: ['chuva'],
      italian:    ['pioggia'],
      french:     ['pluie'],
    },
  },
  {
    emoji: '❄️',
    words: {
      spanish:    ['nieve'],
      portuguese: ['neve'],
      italian:    ['neve'],
      french:     ['neige'],
    },
  },
  {
    emoji: '⛈️',
    words: {
      spanish:    ['tormenta'],
      portuguese: ['tempestade'],
      italian:    ['tempesta'],
      french:     ['tempête'],
    },
  },

  // ── Food & Drink ──────────────────────────────────────────────────────────

  {
    emoji: '🍽️',
    words: {
      spanish:    ['comida'],
      portuguese: ['comida', 'alimento'],
      italian:    ['cibo'],
      french:     ['nourriture', 'repas'],
    },
  },
  {
    emoji: '🍞',
    words: {
      spanish:    ['pan'],
      portuguese: ['pão'],
      italian:    ['pane'],
      french:     ['pain'],
    },
  },
  {
    emoji: '🥩',
    words: {
      spanish:    ['carne'],
      portuguese: ['carne'],
      italian:    ['carne'],
      french:     ['viande'],
    },
  },
  {
    emoji: '🍗',
    words: {
      spanish:    ['pollo'],
      portuguese: ['frango'],
      italian:    ['pollo'],
      french:     ['poulet'],
    },
  },
  {
    emoji: '🍚',
    words: {
      spanish:    ['arroz'],
      portuguese: ['arroz'],
      italian:    ['riso'],
      french:     ['riz'],
    },
  },
  {
    emoji: '🍎',
    words: {
      spanish:    ['fruta'],
      portuguese: ['fruta'],
      italian:    ['frutta'],
      french:     ['fruit'],
    },
  },
  {
    key: 'apple', emoji: '🍎', svgUrl: `${SHARED}/apple.svg`,
    words: {
      spanish:    ['manzana'],
      portuguese: ['maçã'],
      italian:    ['mela'],
      french:     ['pomme'],
    },
  },
  {
    emoji: '🥦',
    words: {
      spanish:    ['verdura'],
      portuguese: ['verdura', 'legume'],
      italian:    ['verdura'],
      french:     ['légume'],
    },
  },
  {
    emoji: '🥛',
    words: {
      spanish:    ['leche'],
      portuguese: ['leite'],
      italian:    ['latte'],
      french:     ['lait'],
    },
  },
  {
    emoji: '☕',
    words: {
      spanish:    ['café'],
      portuguese: ['café'],
      italian:    ['caffè'],
      french:     ['café'],
    },
  },
  {
    emoji: '🍷',
    words: {
      spanish:    ['vino'],
      portuguese: ['vinho'],
      italian:    ['vino'],
      french:     ['vin'],
    },
  },
  {
    emoji: '🍺',
    words: {
      spanish:    ['cerveza'],
      portuguese: ['cerveja'],
      italian:    ['birra'],
      french:     ['bière'],
    },
  },
  {
    emoji: '🥤',
    words: {
      spanish:    ['jugo'],
      portuguese: ['suco'],
      italian:    ['succo'],
      french:     ['jus'],
    },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// RUNTIME LOOKUP TABLES  (built once from CONCEPTS above)
// ─────────────────────────────────────────────────────────────────────────────

const _emoji: Record<string, Record<string, string>> = {};
const _svg:   Record<string, Record<string, string>> = {};

for (const concept of CONCEPTS) {
  for (const [lang, words] of Object.entries(concept.words) as [string, string[]][]) {
    for (const word of words) {
      if (concept.emoji) {
        (_emoji[lang] ??= {})[word] = concept.emoji;
      }
      if (concept.svgUrl) {
        (_svg[lang] ??= {})[word] = concept.svgUrl;
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API  (same signatures as the old emoji-map / svg-map)
// ─────────────────────────────────────────────────────────────────────────────

/** Fallback emoji for a word. Returns null if no mapping exists. */
export function getFallbackEmoji(lang: string, word: string): string | null {
  return _emoji[lang]?.[word] ?? null;
}

/** Fallback OpenMoji SVG URL for a word. Returns null if no mapping exists.
 *  DB value (word.svg_url) always takes precedence — only call this when absent. */
export function getFallbackSvgUrl(lang: string, word: string): string | null {
  return _svg[lang]?.[word] ?? null;
}
