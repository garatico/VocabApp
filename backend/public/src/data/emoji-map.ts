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

  // ── People & family ───────────────────────────────────────────────────────
  spanish: {
    // Core people
    // 'hombre':      '👨',
    // 'mujer':       '👩',
    // 'persona':     '👤',
    // 'niño':        '👦',
    // 'niña':        '👧',

    // // Family
    // 'padre':       '👨',
    // 'madre':       '👩',
    // 'hijo':        '👦',
    // 'hija':        '👧',
    // 'hermano':     '👦',
    // 'hermana':     '👧',
    // 'abuelo':      '👴',
    // 'abuela':      '👵',
    // 'tío':         '👨',
    // 'tía':         '👩',
    // 'primo':       '👦',
    // 'prima':       '👧',
    // 'esposo':      '💍',
    // 'esposa':      '💍',
    // 'novio':       '💑',
    // 'novia':       '💑',
    // 'amigo':       '🤝',
    // 'amiga':       '🤝',

    // Professions
    // 'médico':      '👨‍⚕️',
    // 'maestro':     '👨‍🏫',
    // 'maestra':     '👩‍🏫',
    // 'abogado':     '⚖️',
    // 'ingeniero':   '👷',
    // 'policía':     '👮',
    // 'soldado':     '💂',
    // 'rey':         '👑',
    // 'reina':       '👑',
    // 'presidente':  '🏛️',

    // ── Animals ───────────────────────────────────────────────────────────────
    'perro':       '🐕',
    'gato':        '🐱',
    'caballo':     '🐴',
    'vaca':        '🐄',
    'cerdo':       '🐷',
    'oveja':       '🐑',
    'pájaro':      '🐦',
    'pez':         '🐟',
    'animal':      '🦁',
    'lobo':        '🐺',
    'león':        '🦁',
    'tigre':       '🐯',
    'oso':         '🐻',
    'mono':        '🐒',
    'elefante':    '🐘',
    'serpiente':   '🐍',
    'insecto':     '🐛',

    // ── Nature ────────────────────────────────────────────────────────────────
    'agua':        '💧',
    'tierra':      '🌍',
    'mar':         '🌊',
    'río':         '🏞️',
    'montaña':     '⛰️',
    'árbol':       '🌳',
    'flor':        '🌸',
    'cielo':       '🌤️',
    'sol':         '☀️',
    'luna':        '🌙',
    'estrella':    '⭐',
    'fuego':       '🔥',
    'aire':        '💨',
    'bosque':      '🌲',
    'planta':      '🌱',
    'hoja':        '🍃',
    'semilla':     '🌱',
    'nube':        '☁️',
    'lluvia':      '🌧️',
    'nieve':       '❄️',
    'viento':      '💨',
    'tormenta':    '⛈️',

    // ── Places & buildings ────────────────────────────────────────────────────
    // 'mundo':       '🌍',
    // 'país':        '🗺️',
    // 'ciudad':      '🏙️',
    // 'casa':        '🏠',
    // 'calle':       '🛣️',
    // 'camino':      '🛤️',
    // 'escuela':     '🏫',
    // 'hospital':    '🏥',
    // 'banco':       '🏦',
    // 'tienda':      '🏪',
    // 'mercado':     '🛒',
    // 'aeropuerto':  '🛫',
    // 'edificio':    '🏢',
    // 'iglesia':     '⛪',
    // 'museo':       '🏛️',
    // 'biblioteca':  '📚',
    // 'estadio':     '🏟️',
    // 'teatro':      '🎭',
    // 'oficina':     '💼',
    // 'habitación':  '🛏️',
    // 'apartamento': '🏠',
    // 'jardín':      '🌿',
    // 'isla':        '🏝️',
    // 'desierto':    '🏜️',
    // 'lago':        '🌊',
    // 'valle':       '🏕️',
    // 'volcán':      '🌋',

    // ── Transport ─────────────────────────────────────────────────────────────
    'coche':       '🚗',
    'avión':       '✈️',
    'tren':        '🚂',
    'autobús':     '🚌',
    'barco':       '🚢',
    'bicicleta':   '🚲',

    // ── Body ─────────────────────────────────────────────────────────────────
    'cuerpo':      '🫀',
    'cabeza':      '🗣️',
    'mano':        '✋',
    'ojo':         '👁️',
    'boca':        '👄',
    'pie':         '🦶',
    'corazón':     '❤️',
    'sangre':      '🩸',
    'pelo':        '💇',
    'cara':        '😊',
    'brazo':       '💪',
    'pierna':      '🦵',

    // ── Food & drink ──────────────────────────────────────────────────────────
    'comida':      '🍽️',
    'pan':         '🍞',
    'leche':       '🥛',
    'carne':       '🥩',
    'pescado':     '🐟',
    'pollo':       '🍗',
    'arroz':       '🍚',
    'fruta':       '🍎',
    'verdura':     '🥦',
    'café':        '☕',
    'vino':        '🍷',
    'cerveza':     '🍺',
    'jugo':        '🥤',

    // ── Clothes ───────────────────────────────────────────────────────────────
    'ropa':        '👕',
    'camisa':      '👔',
    'pantalón':    '👖',
    'zapato':      '👟',
    'sombrero':    '🎩',

    // ── Home & furniture ─────────────────────────────────────────────────────
    'puerta':      '🚪',
    'ventana':     '🪟',
    'mesa':        '🍽️',
    'silla':       '🪑',
    'cama':        '🛏️',
    'pared':       '🧱',
    'cocina':      '🍳',
    'baño':        '🚿',

    // ── Technology ───────────────────────────────────────────────────────────
    'teléfono':    '📱',
    'computadora': '💻',
    'internet':    '🌐',
    'mensaje':     '💬',
    'correo':      '📧',

    // ── Work, money & society ─────────────────────────────────────────────────
    'trabajo':     '💼',
    'dinero':      '💰',
    'empresa':     '🏢',
    'gobierno':    '🏛️',
    'ley':         '⚖️',
    'guerra':      '⚔️',
    'paz':         '☮️',
    'poder':       '⚡',
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
    'historia':    '📚',

    // ── Time ─────────────────────────────────────────────────────────────────
    // 'tiempo':      '⏰',
    // 'día':         '☀️',
    // 'noche':       '🌙',
    // 'año':         '📅',
    // 'semana':      '📅',
    // 'mes':         '🗓️',
    // 'hora':        '⏰',
    // 'lunes':       '🌙',
    // 'martes':      '🔴',
    // 'miércoles':   '💧',
    // 'jueves':      '⚡',
    // 'viernes':     '❤️',
    // 'sábado':      '⭐',
    // 'domingo':     '☀️',
    // 'enero':       '❄️',
    // 'febrero':     '❤️',
    // 'marzo':       '🌱',
    // 'abril':       '🌸',
    // 'mayo':        '🌼',
    // 'junio':       '☀️',
    // 'julio':       '🏖️',
    // 'agosto':      '🌻',
    // 'septiembre':  '🍂',
    // 'octubre':     '🎃',
    // 'noviembre':   '🍁',
    // 'diciembre':   '🎄',
    // 'primavera':   '🌸',
    // 'verano':      '☀️',
    // 'otoño':       '🍂',
    // 'invierno':    '❄️',

    // ── Emotions & abstract (with clear emoji) ────────────────────────────────
    // 'amor':        '❤️',
    // 'miedo':       '😨',
    // 'alegría':     '😊',
    // 'tristeza':    '😢',
    // 'enojo':       '😠',
    // 'sueño':       '💤',
    // 'esperanza':   '🌟',
    // 'odio':        '😡',
    // 'sorpresa':    '😲',
    // 'orgullo':     '😤',
    // 'duda':        '🤔',
    // 'vida':        '💚',
    // 'idea':        '💡',
    // 'problema':    '⚠️',
    // 'verdad':      '✅',
    // 'nombre':      '🏷️',
    // 'éxito':       '🏆',
    // 'fracaso':     '❌',
    // 'peligro':     '🚨',
  },
};

/**
 * Look up a fallback emoji for a word.
 * Returns the emoji string or null if none is mapped.
 */
export function getFallbackEmoji(lang: string, word: string): string | null {
  return EMOJI_MAP[lang]?.[word] ?? null;
}
