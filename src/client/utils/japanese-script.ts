/**
 * Which Japanese script a word is written in — for the Script Type filter
 * (Kanji / Katakana / Hiragana). Classified from the word's own text, not
 * stored data: unlike a reading (see VocabApp-Data's enrich_readings, which
 * needs a real dictionary lookup because kanji are reading-ambiguous), which
 * *script* a word uses is a mechanical fact about its characters — no
 * lookup needed.
 *
 * A word can genuinely mix scripts (掛ける is kanji 掛 + hiragana ける,
 * ordinary okurigana) — such a word is classified 'kanji', since that's the
 * distinguishing content a learner has to know how to read; the hiragana
 * verb ending isn't what makes it hard. 'katakana' and 'hiragana' require
 * the *whole* word to be that script, since a word that's genuinely just
 * kana carries no kanji-reading burden at all — that's the entire point of
 * the distinction.
 */
export type JapaneseScript = 'kanji' | 'katakana' | 'hiragana';

// CJK ideographs (Extension A through the main block) — same range as
// VocabApp-Data's _KANJI_RE in pipeline/lib/corpus.py.
const KANJI_RE = /[㐀-鿿]/;

// The katakana block, plus the long-vowel mark (ー) and the interpunct (・)
// that appear inside ordinary katakana words (コーヒー, スパゲッティ) —
// without them, any loanword using either would be misclassified as
// "mixed" and fall through to null.
const KATAKANA_ONLY_RE = /^[゠-ヿー・]+$/;

const HIRAGANA_ONLY_RE = /^[぀-ゟ]+$/;

/** null for anything that isn't purely/primarily one of the three —
 *  digits, punctuation, or a non-Japanese word entirely. */
export function classifyJapaneseScript(word: string): JapaneseScript | null {
  if (KANJI_RE.test(word)) return 'kanji';
  if (KATAKANA_ONLY_RE.test(word)) return 'katakana';
  if (HIRAGANA_ONLY_RE.test(word)) return 'hiragana';
  return null;
}
