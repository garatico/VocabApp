/**
 * gender.ts — Infer Spanish grammatical gender and plural from word form.
 *
 * Only handles Spanish for now.
 *
 * Usage:
 *   const gender = word.linguistic?.gender ?? inferGender(word.word, lang);
 *   const plural = word.linguistic?.plural ?? inferPlural(word.word, lang);
 */

// Greek-origin -ma/-pa/-ta nouns that are masculine despite ending in -a
const MASC_A_EXCEPTIONS = new Set([
  'problema', 'tema', 'sistema', 'programa', 'idioma', 'clima', 'poema',
  'drama', 'trauma', 'dilema', 'esquema', 'enigma', 'estigma', 'fantasma',
  'mapa', 'papa', 'planeta', 'cometa', 'profeta', 'atleta',
]);

// Common -o nouns that are feminine
const FEM_O_EXCEPTIONS = new Set([
  'mano', 'foto', 'moto', 'radio', 'libido',
]);

export function inferGender(word: string, lang = 'spanish'): 'masculine' | 'feminine' | null {
  if (lang !== 'spanish') return null;

  const w = word.toLowerCase().trim();

  // Feminine suffixes (check before single-letter endings)
  if (/(?:ción|sión|ión|dad|tad|tud|umbre|ie|itis|sis)$/.test(w)) return 'feminine';

  // -a ending
  if (w.endsWith('a')) {
    return MASC_A_EXCEPTIONS.has(w) ? 'masculine' : 'feminine';
  }

  // -o ending
  if (w.endsWith('o')) {
    return FEM_O_EXCEPTIONS.has(w) ? 'feminine' : 'masculine';
  }

  // Everything else is ambiguous (-e, -l, -r, -n, -s, -z, -ista, etc.)
  return null;
}

/**
 * Infer the Spanish plural form from the singular.
 * Returns null for non-Spanish languages.
 *
 * Rules (in priority order):
 *  1. -z           → -ces         (lápiz→lápices, voz→voces)
 *  2. -ón/ín/én/án → drop accent + es  (razón→razones, jardín→jardines)
 *  3. -és/ús/ís/ós → drop accent + es  (inglés→ingleses, autobús→autobuses)
 *  4. -s / -x (polysyllabic, unaccented) → unchanged  (lunes→lunes, crisis→crisis)
 *  5. vowel ending → + s           (casa→casas, libro→libros, café→cafés)
 *  6. consonant   → + es           (árbol→árboles, ciudad→ciudades, mes→meses)
 *
 * True exceptions (accent-shifting -en words, monosyllabic -s, país→países)
 * are stored explicitly in the JSONL and take precedence via the null-coalescing
 * call pattern: word.linguistic?.plural ?? inferPlural(word.word, lang)
 */
export function inferPlural(word: string, lang = 'spanish'): string | null {
  if (lang !== 'spanish') return null;

  const w = word.toLowerCase().trim();

  // 1. -z → -ces
  if (w.endsWith('z')) return w.slice(0, -1) + 'ces';

  // 2. Accented vowel + n (ón, ín, én, án, ún) → drop accent, add -es
  const accentN: Record<string, string> = { 'ón': 'ones', 'ín': 'ines', 'én': 'enes', 'án': 'anes', 'ún': 'unes' };
  for (const [end, rep] of Object.entries(accentN)) {
    if (w.endsWith(end)) return w.slice(0, -end.length) + rep;
  }

  // 3. Accented vowel + s (és, ús, ís, ós, ás) → drop accent, add -es
  const accentS: Record<string, string> = { 'és': 'eses', 'ús': 'uses', 'ís': 'ises', 'ós': 'oses', 'ás': 'ases' };
  for (const [end, rep] of Object.entries(accentS)) {
    if (w.endsWith(end)) return w.slice(0, -end.length) + rep;
  }

  // 4. Unaccented -s or -x (polysyllabic) → unchanged
  if ((w.endsWith('s') || w.endsWith('x')) && w.length > 3) return w;

  // 5. Vowel ending → + s
  if (/[aeiouáéíóú]$/.test(w)) return w + 's';

  // 6. Consonant ending → + es
  return w + 'es';
}
