/**
 * svg-map.ts
 *
 * Client-side fallback SVG URLs for Picture Quiz mode.
 * Used when a word has no svg_url stored in the database.
 *
 * URLs point to the OpenMoji CDN (jsDelivr mirror).
 * Each filename is the Unicode codepoint(s) for the corresponding emoji,
 * uppercased and hyphen-joined for multi-codepoint sequences.
 *
 * OpenMoji reference: https://openmoji.org
 * CDN base: https://cdn.jsdelivr.net/npm/openmoji@15.0.0/color/svg/
 *
 * To find a codepoint: pick the emoji on https://emojipedia.org and read
 * the "Codepoints" field, e.g. U+1F415 → filename "1F415.svg".
 *
 * Workflow:
 *   1. Add entries here as a fallback.
 *   2. Once you're happy with a visual, promote it to the DB via the admin
 *      panel (paste the CDN URL into the svg_url field for that word).
 *   3. Remove the entry here — the DB value takes precedence anyway.
 */

const OPENMOJI_BASE = 'https://cdn.jsdelivr.net/npm/openmoji@15.0.0/color/svg';

/** lang → word → absolute SVG URL */
type SvgMap = Record<string, Record<string, string>>;

export const SVG_MAP: SvgMap = {
  spanish: {

    // ── Animals (POC — 3 entries) ──────────────────────────────────────
    // OpenMoji renders much more clearly than system emoji for Picture Quiz.
    // Expand this group first; other categories can follow the same pattern.
    'perro':   `${OPENMOJI_BASE}/1F415.svg`,  // 🐕 dog
    'gato':    `${OPENMOJI_BASE}/1F431.svg`,  // 🐱 cat face
    'caballo': `${OPENMOJI_BASE}/1F434.svg`,  // 🐴 horse face

    // Add more animals here as you go, e.g.:
    // 'vaca':      `${OPENMOJI_BASE}/1F404.svg`,  // 🐄 cow
    // 'cerdo':     `${OPENMOJI_BASE}/1F437.svg`,  // 🐷 pig face
    // 'oveja':     `${OPENMOJI_BASE}/1F411.svg`,  // 🐑 ewe
    // 'lobo':      `${OPENMOJI_BASE}/1F43A.svg`,  // 🐺 wolf
    // 'oso':       `${OPENMOJI_BASE}/1F43B.svg`,  // 🐻 bear
    // 'mono':      `${OPENMOJI_BASE}/1F412.svg`,  // 🐒 monkey
    // 'elefante':  `${OPENMOJI_BASE}/1F418.svg`,  // 🐘 elephant
    // 'tigre':     `${OPENMOJI_BASE}/1F42F.svg`,  // 🐯 tiger face
    // 'león':      `${OPENMOJI_BASE}/1F981.svg`,  // 🦁 lion
    // 'pájaro':    `${OPENMOJI_BASE}/1F426.svg`,  // 🐦 bird
    // 'pez':       `${OPENMOJI_BASE}/1F41F.svg`,  // 🐟 fish
    // 'serpiente': `${OPENMOJI_BASE}/1F40D.svg`,  // 🐍 snake
  },
};

/**
 * Look up a fallback SVG URL for a word.
 * Returns the URL string, or null if none is mapped.
 * The DB value (word.svg_url) always takes precedence — only call this
 * when svg_url is absent.
 */
export function getFallbackSvgUrl(lang: string, word: string): string | null {
  const map = SVG_MAP[lang];
  if (!map || !Object.prototype.hasOwnProperty.call(map, word)) return null;
  return map[word] ?? null;
}
