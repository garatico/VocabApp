/**
 * russian-translit.ts — so a learner without a Cyrillic keyboard can still answer in Russian.
 *
 * A Russian answer is accepted in Cyrillic (matched against the word as usual) or in Latin letters.
 * Latin spellings of Russian vary (хорошо: khorosho, horosho, xorosho; я: ya, ja; щ: shch, sch), so
 * rather than list every spelling, both sides go through one loose key: the word is transliterated
 * (`cyrillicToLatin`), and both it and what was typed are folded by `latinKey`, which maps each
 * common variant onto one spelling. Two letters the transliteration has to choose for get both
 * choices: ё as "yo" or "e" (most Russians print е), й as "y" or "i" (moi for мой).
 */

const TABLE: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ж: 'zh', з: 'z', и: 'i', к: 'k', л: 'l', м: 'm',
  н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh',
  щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

/** Is there a Cyrillic letter in `s`? */
export function hasCyrillic(s: string): boolean {
  return /[Ѐ-ӿ]/.test(s);
}

/** Is there a Latin letter in `s`? */
export function hasLatin(s: string): boolean {
  return /[a-z]/i.test(s);
}

/**
 * `s` in Latin letters. Stress marks are dropped; ё and й follow `yo` and `short`, which
 * `latinTargets` varies. Anything that is not a Russian letter is kept as it is.
 */
export function cyrillicToLatin(s: string, yo: 'yo' | 'e' = 'yo', short: 'y' | 'i' = 'y'): string {
  let out = '';
  for (const ch of s.normalize('NFD').replace(/[̀́]/g, '').normalize('NFC').toLowerCase()) {
    if (ch === 'ё') out += yo;
    else if (ch === 'й') out += short;
    else out += TABLE[ch] ?? ch;
  }
  return out;
}

/**
 * One spelling for the common ways of writing a Russian sound in Latin letters: x and a bare h are
 * kh, c (not in ch) and tz are ts, sch is shch, j is y, w is v; apostrophes (the soft sign) go.
 * Applied to the transliterated word and to what was typed alike, so each only has to land on the key.
 */
export function latinKey(s: string): string {
  return s.toLowerCase()
    .replace(/['’`ʹʺ"]/g, '')
    .replace(/x/g, 'kh')
    .replace(/w/g, 'v')
    .replace(/j/g, 'y')
    .replace(/tz/g, 'ts')
    .replace(/c(?!h)/g, 'ts')
    .replace(/sch/g, 'shch')
    .replace(/(?<![kzcs])h/g, 'kh');
}

/** The Latin keys a Russian word is accepted as: every ё/й choice, folded by `latinKey`. */
export function latinTargets(word: string): string[] {
  const keys = new Set<string>();
  for (const yo of ['yo', 'e'] as const) {
    for (const short of ['y', 'i'] as const) keys.add(latinKey(cyrillicToLatin(word, yo, short)));
  }
  return [...keys];
}
