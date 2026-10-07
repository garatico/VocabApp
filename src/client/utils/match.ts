/**
 * match.ts — string comparison shared by every mode.
 *
 * There were four separate implementations of "lowercase and strip accents"
 * in this codebase (my-lists, recall, conjugation, and this file) plus two
 * edit-distance functions. They agreed by luck rather than design. Everything
 * lives here now; add to it rather than writing another local copy.
 */

/**
 * Accents off, so "cafe" matches "café". Kana voicing marks stay on: Unicode
 * files dakuten/handakuten (゛゜, and half-width ﾞﾟ) under Diacritic, but they
 * change the consonant — stripped, かぎ "key" graded as かき "oyster" and ガラス
 * "glass" as カラス "crow". NFC afterwards puts か + ゛ back together as が.
 */
export function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/(?![゙゚ﾞﾟ])\p{Diacritic}/gu, '').normalize('NFC');
}

/**
 * Case- and accent-insensitive key for comparing two words.
 *
 * Punctuation is preserved — use `normalize` when you also want it stripped.
 * Null-safe, because callers pass raw input values.
 */
export function foldKey(s: string): string {
  return stripDiacritics(String(s || '').toLowerCase().trim());
}

/**
 * `foldKey` with punctuation dropped and runs of spaces collapsed to one — so "new  york" (a double space
 * typed by accident) and "hola , mundo" (punctuation removed beside a space) still match their answers.
 */
export function normalize(s: string): string {
  return stripDiacritics(String(s || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim());
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const v0 = new Array<number>(b.length + 1);
  const v1 = new Array<number>(b.length + 1);
  for (let i = 0; i <= b.length; i++) v0[i] = i;
  for (let i = 0; i < a.length; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < b.length; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
    }
    for (let j = 0; j <= b.length; j++) v0[j] = v1[j];
  }
  return v0[b.length];
}


/**
 * Levenshtein distance that gives up once it exceeds `max`.
 *
 * Recall mode scans every unanswered word on each Enter press, so the full
 * matrix is wasted work for pairs that are obviously unrelated. Returns
 * `max + 1` to mean "further than you care about".
 */
export function levenshteinCapped(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}
