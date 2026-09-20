import * as wanakana from 'wanakana';

// CJK ideographs (Extension A through the main block) — must match
// src/client/utils/japanese-script.ts's own KANJI_RE. Duplicated rather
// than imported: that file is bundled for the client and this one runs on
// the server, and nothing else in the app shares a regex across that
// boundary either.
const KANJI_RE = /[㐀-鿿]/;

/**
 * Romaji for a Japanese word, computed at DB-load time rather than stored.
 *
 * `vocabulary.db`'s `ipa` column holds a hiragana *reading* for Japanese
 * (see VocabApp-Data's `enrich_readings` in pipeline/lib/corpus.py) — not
 * romaji directly, and deliberately so: romaji is a mechanical,
 * lossless transliteration of the kana reading, so storing it too would be
 * a second copy of a derived fact free to drift from the first, the same
 * mistake this project already made once with the `band` column (see
 * contract/schema.sql in VocabApp-Data for that history). What can't be
 * derived — the reading itself, since most kanji have several possible
 * readings depending on the word — is what gets stored; romaji is derived
 * from it here, on every load, by the same client the Chinese
 * `romanizedScript` machinery in utils.ts already expects to receive an
 * already-romanized string in `linguistic.ipa`. Reusing that machinery
 * for Japanese is why this function's *output* replaces the stored
 * reading in the `ipa` field returned to the client, rather than the
 * reading being exposed as a separate field — see vocab-loader.ts's call
 * site.
 *
 * `reading` is the stored hiragana reading, or null/empty for a word
 * that's already plain kana (a particle, a pronoun already written in
 * hiragana, a katakana loanword) — such a word has nothing to look up
 * because it already *is* its own reading, so `word` itself is romanized
 * instead.
 *
 * That fallback assumes a missing `reading` only ever happens for a word
 * that's already plain kana — true for anything the pipeline curated, but
 * not for a word edited by hand: the admin Word Editor's IPA field
 * (admin-editor.ts's `editIPA`) is a generic, unvalidated text input, so a
 * kanji-containing word can end up with no stored reading too. wanakana
 * leaves kanji untouched, so romanizing the raw word in that case produces
 * a mixed kanji+romaji string (e.g. "掛keru") rather than real romaji —
 * caught here by returning nothing instead, the same as if the word had no
 * romanization available at all.
 */
export function japaneseRomaji(word: string, reading: string | null): string {
  const override = PARTICLE_ROMAJI_OVERRIDES[word];
  if (override) return override;
  if (!reading && KANJI_RE.test(word)) return '';
  return wanakana.toRomaji(reading || word);
}

/**
 * は, を and へ are pronounced differently when used as the grammatical
 * particles they're curated as here (topic marker, object marker,
 * direction marker) than their literal kana reading (ha, wo, he) — a
 * well-known, finite exception in Japanese orthography that no generic
 * kana->romaji converter can resolve from the bare kana alone, since the
 * same kana are also perfectly ordinary syllables inside other words.
 * Found by running the real curated word list through wanakana and
 * checking the output against what は/を are actually curated to mean
 * (VocabApp-Data's HAND_CURATED_GRAMMAR_WORDS) rather than trusting a
 * clean-looking run. Safe to key on the bare word here — unlike
 * romanizing arbitrary sentence text, every one of these three words in
 * this app's own data *is* specifically the particle entry, never the
 * plain-syllable sense, so no additional context is needed to know which
 * case applies.
 */
const PARTICLE_ROMAJI_OVERRIDES: Record<string, string> = {
  'は': 'wa',
  'を': 'o',
  'へ': 'e',
};
