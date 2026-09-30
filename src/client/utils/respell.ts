/**
 * respell.ts — an English-reader's spelling of a Spanish IPA transcription, the "sounds like" line
 * SpanishDictionary.com gives: /oβ.ˈβja.men.te/ → "ohb-BYAH-mehn-teh".
 *
 * Deliberately Spanish-only and approximate: it maps symbols to the English spelling that comes
 * closest (β → b, θ → th, x → h, ɾ → r …), not to a claim of exact sound. Syllables come from the
 * transcription itself — a `.`, or the start of a stressed syllable (ˈ / ˌ) — and the stressed one is
 * written in capitals, the plain-text version of the bold the dictionary uses.
 */

/** Multi-character sounds first, so `tʃ` is one sound rather than `t` then `ʃ`. */
const CONSONANTS: [string, string][] = [
  ['tʃ', 'ch'], ['dʒ', 'j'], ['ɟʝ', 'y'], ['ts', 'ts'],
  ['β', 'b'], ['ð', 'th'], ['ɣ', 'g'], ['ɡ', 'g'], ['g', 'g'], ['θ', 'th'], ['x', 'h'], ['χ', 'h'],
  ['ʝ', 'y'], ['ʎ', 'y'], ['ɟ', 'y'], ['ɲ', 'ny'], ['ŋ', 'ng'], ['ɱ', 'm'], ['ɾ', 'r'], ['r', 'rr'], ['ʃ', 'sh'], ['ʒ', 'zh'],
  ['s', 's'], ['z', 'z'], ['k', 'k'], ['t', 't'], ['p', 'p'], ['b', 'b'], ['d', 'd'], ['f', 'f'],
  ['l', 'l'], ['m', 'm'], ['n', 'n'], ['h', 'h'], ['v', 'v'], ['c', 'k'], ['q', 'k'],
];

const VOWELS: Record<string, string> = { a: 'ah', e: 'eh', i: 'ee', o: 'oh', u: 'oo' };

/** A vowel plus a following glide (j / w), which English writes as one sound. */
const OFFGLIDES: Record<string, string> = {
  aj: 'eye', ej: 'ay', oj: 'oy', uj: 'ooee', ij: 'ee', aw: 'ow', ew: 'ehoo', ow: 'ohoo', iw: 'eeoo', uw: 'oo',
};
/** A glide before a vowel: /ja/ → "yah", /we/ → "weh". */
const ONGLIDES: Record<string, string> = { j: 'y', w: 'w' };

function respellSyllable(syl: string): string {
  let out = '';
  for (let i = 0; i < syl.length;) {
    const ch = syl[i];
    const pair = syl.slice(i, i + 2);
    if (OFFGLIDES[pair]) { out += OFFGLIDES[pair]; i += 2; continue; }
    if (ONGLIDES[ch] && VOWELS[syl[i + 1] ?? '']) { out += ONGLIDES[ch] + VOWELS[syl[i + 1]]; i += 2; continue; }
    if (VOWELS[ch]) { out += VOWELS[ch]; i++; continue; }
    if (ONGLIDES[ch]) { out += ONGLIDES[ch]; i++; continue; }
    const two = CONSONANTS.find(([ipa]) => ipa.length === 2 && syl.startsWith(ipa, i));
    if (two) { out += two[1]; i += 2; continue; }
    const one = CONSONANTS.find(([ipa]) => ipa === ch);
    if (one) { out += one[1]; i++; continue; }
    i++;   // length marks, tie bars and anything else with no English counterpart
  }
  return out;
}

/** The respelling of a Spanish IPA transcription, or '' if there isn't one to make. */
export function respellSpanishIpa(ipa: string | null | undefined): string {
  if (!ipa) return '';
  const cleaned = ipa
    .normalize('NFD').replace(/\p{M}/gu, '')          // ̪ ̯ ̞ ̃ …
    .replace(/[/[\]ː‿ʰ]/g, '');   // (the tie bar ͡ is a combining mark, already gone)
  // `.` ends a syllable; so does the point just before a stress mark (which opens the next one).
  const parts = cleaned.replace(/([ˈˌ])/g, '.$1').split('.').filter(Boolean);
  const syllables = parts.map(p => ({ stressed: p.startsWith('ˈ'), text: respellSyllable(p.replace(/[ˈˌ]/g, '')) }))
    .filter(s => s.text);
  if (syllables.length === 0) return '';
  const marks = syllables.length > 1;
  return syllables.map(s => (marks && s.stressed ? s.text.toUpperCase() : s.text)).join('-');
}
