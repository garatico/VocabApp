/**
 * emoji-map.ts
 *
 * Hardcoded emoji fallbacks for Picture Quiz mode.
 * Used when a word has no SVG and no emoji set in the database.
 * Extend per-language as needed; promote to the DB via the admin panel
 * once you're happy with a particular emoji.
 */

/** lang → word → emoji */
type EmojiMap = Record<string, Record<string, string>>;

export const EMOJI_MAP: EmojiMap = {
  spanish: {

    // ── Animals ───────────────────────────────────────────────────────
    'animal':      '🦁',
    'perro':       '🐕',
    'gato':        '🐱',
    'caballo':     '🐴',
    'vaca':        '🐄',
    'cerdo':       '🐷',
    'oveja':       '🐑',
    'lobo':        '🐺',
    'oso':         '🐻',
    'mono':        '🐒',
    'elefante':    '🐘',
    'león':        '🦁',
    'tigre':       '🐯',
    'pájaro':      '🐦',
    'pez':         '🐟',
    'serpiente':   '🐍',
    'insecto':     '🐛',  // caterpillar — stands in for insects generally

    // ── Nature & Weather ──────────────────────────────────────────────
    'agua':        '💧',
    'fuego':       '🔥',
    'aire':        '💨',
    'tierra':      '🌍',  // globe — represents "earth/ground" conceptually
    'mar':         '🌊',
    'río':         '🏞️',  // landscape with river
    'montaña':     '⛰️',
    'bosque':      '🌲',
    'árbol':       '🌳',
    'planta':      '🌱',
    'hoja':        '🍃',
    'semilla':     '🌱',  // sprout — closest to "seed"
    'flor':        '🌸',
    'cielo':       '🌤️',
    'sol':         '☀️',
    'luna':        '🌙',
    'estrella':    '⭐',
    'nube':        '☁️',
    'lluvia':      '🌧️',
    'nieve':       '❄️',
    'viento':      '💨',
    'tormenta':    '⛈️',

    // ── Transport ─────────────────────────────────────────────────────
    'coche':       '🚗',
    'avión':       '✈️',
    'tren':        '🚂',
    'autobús':     '🚌',
    'barco':       '🚢',
    'bicicleta':   '🚲',

    // ── Human Body ────────────────────────────────────────────────────
    'cuerpo':      '🫀',  // anatomical heart — represents the body as a whole
    'cabeza':      '🗣️',
    'cara':        '😊',
    'ojo':         '👁️',
    'boca':        '👄',
    'mano':        '✋',
    'brazo':       '💪',
    'pierna':      '🦵',
    'pie':         '🦶',
    'pelo':        '💇',  // person getting haircut — stands in for hair
    'corazón':     '❤️',
    'sangre':      '🩸',

    // ── Food & Drink ──────────────────────────────────────────────────
    'comida':      '🍽️',
    'pan':         '🍞',
    'carne':       '🥩',
    'pescado':     '🐟',  // fish on plate — distinct from pez (live fish)
    'pollo':       '🍗',
    'arroz':       '🍚',
    'fruta':       '🍎',
    'verdura':     '🥦',
    'leche':       '🥛',
    'café':        '☕',
    'vino':        '🍷',
    'cerveza':     '🍺',
    'jugo':        '🥤',

    // ── Clothing ─────────────────────────────────────────────────────
    'ropa':        '👕',
    'camisa':      '👔',
    'pantalón':    '👖',
    'zapato':      '👟',
    'sombrero':    '🎩',

    // ── Home & Furniture ──────────────────────────────────────────────
    'puerta':      '🚪',
    'ventana':     '🪟',
    'mesa':        '🍽️',  // no table emoji exists; plate on table is the closest
    'silla':       '🪑',
    'cama':        '🛏️',
    'pared':       '🧱',
    'cocina':      '🍳',  // frying pan — represents kitchen/cooking
    'baño':        '🚿',

    // ── Technology & Communication ────────────────────────────────────
    'teléfono':    '📱',
    'computadora': '💻',
    'internet':    '🌐',
    'mensaje':     '💬',
    'correo':      '📧',

    // ── Society, Work & Institutions ──────────────────────────────────
    'trabajo':     '💼',
    'dinero':      '💰',
    'empresa':     '🏢',
    'gobierno':    '🏛️',
    'ley':         '⚖️',
    'guerra':      '⚔️',
    'paz':         '☮️',
    'poder':       '⚡',  // lightning bolt — energy/power

    // ── Knowledge, Arts & Culture ─────────────────────────────────────
    'libro':       '📖',
    'papel':       '📄',
    'carta':       '✉️',
    'número':      '🔢',
    'música':      '🎵',
    'arte':        '🎨',
    'ciencia':     '🔬',
    'deporte':     '⚽',
    'película':    '🎬',
    'noticia':     '📰',
    'historia':    '📚',  // stack of books — covers both "history" and "story"
  },
};

/**
 * Look up a fallback emoji for a word.
 * Returns the emoji string or null if none is mapped.
 */
export function getFallbackEmoji(lang: string, word: string): string | null {
  const map = EMOJI_MAP[lang];
  if (!map || !Object.prototype.hasOwnProperty.call(map, word)) return null;
  return map[word] ?? null;
}
