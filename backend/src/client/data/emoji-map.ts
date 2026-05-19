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
    // (commented out — transport vehicles are clear as emojis but lower
    //  priority; promote to SVG map when ready)
    // 'coche':       '🚗',
    // 'avión':       '✈️',
    // 'tren':        '🚂',
    // 'autobús':     '🚌',
    // 'barco':       '🚢',
    // 'bicicleta':   '🚲',

    // ── Human Body ────────────────────────────────────────────────────
    // (commented out — body-part emojis are ambiguous or clinical;
    //  better handled with SVG illustrations when we get there)
    // 'cuerpo':      '🫀',
    // 'cabeza':      '🗣️',
    // 'cara':        '😊',
    // 'ojo':         '👁️',
    // 'boca':        '👄',
    // 'mano':        '✋',
    // 'brazo':       '💪',
    // 'pierna':      '🦵',
    // 'pie':         '🦶',
    // 'pelo':        '💇',
    // 'corazón':     '❤️',
    // 'sangre':      '🩸',

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
    // (commented out — too abstract / unclear without an illustration)
    // 'ropa':        '👕',
    // 'camisa':      '👔',
    // 'pantalón':    '👖',
    // 'zapato':      '👟',
    // 'sombrero':    '🎩',

    // ── Home & Furniture ──────────────────────────────────────────────
    // (commented out — mesa/cocina/pared are confusing as emojis;
    //  revisit with SVG icons)
    // 'puerta':      '🚪',
    // 'ventana':     '🪟',
    // 'mesa':        '🍽️',
    // 'silla':       '🪑',
    // 'cama':        '🛏️',
    // 'pared':       '🧱',
    // 'cocina':      '🍳',
    // 'baño':        '🚿',

    // ── Technology & Communication ────────────────────────────────────
    // (commented out — abstract concepts; phone/laptop are fine but
    //  internet/mensaje/correo are unclear)
    // 'teléfono':    '📱',
    // 'computadora': '💻',
    // 'internet':    '🌐',
    // 'mensaje':     '💬',
    // 'correo':      '📧',

    // ── Society, Work & Abstract ──────────────────────────────────────
    // (commented out — no emoji conveys these reliably)
    // 'trabajo':     '💼',
    // 'dinero':      '💰',
    // 'empresa':     '🏢',
    // 'gobierno':    '🏛️',
    // 'ley':         '⚖️',
    // 'guerra':      '⚔️',
    // 'paz':         '☮️',
    // 'poder':       '⚡',

    // ── Knowledge, Arts & Culture ─────────────────────────────────────
    // (commented out — abstract; keep 🎵/🎨/⚽ candidates for later
    //  once we decide on SVG vs emoji for this group)
    // 'libro':       '📖',
    // 'papel':       '📄',
    // 'carta':       '✉️',
    // 'número':      '🔢',
    // 'música':      '🎵',
    // 'arte':        '🎨',
    // 'ciencia':     '🔬',
    // 'deporte':     '⚽',
    // 'película':    '🎬',
    // 'noticia':     '📰',
    // 'historia':    '📚',
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
