/**
 * types.ts
 *
 * Core vocabulary types shared across the frontend.
 * The shape here mirrors what vocab-loader.js returns via /api/vocab/:lang.
 *
 * Import with:  import type { Word } from '../types.js';
 * (The .js extension is intentional — required for ESM + bundler resolution)
 */

export interface WordLinguistic {
  infinitive:          string | null;
  reflexive:           boolean;
  gender:              string | null;
  plural:              string | null;
  register:            string | null;
  ipa:                 string | null;
  syllables:           string[] | null;
  /**
   * Fully-resolved conjugation table, keyed by tense name.
   * Generated server-side from conjugation_class + overrides when available,
   * otherwise from the stored JSON. Arrays are 6-element [yo,tú,él,nos,vos,ellos].
   * "past_participle" and "gerund" are string values.
   */
  conjugations:        Record<string, string[] | string> | null;
  /**
   * Rule class used to generate this verb's conjugations.
   * e.g. "regular-ar", "stem-e-ie", "irregular-tener".
   * Only present on verb entries; absent for non-verbs.
   */
  conjugation_class?:  string | null;
}

export interface WordFrequency {
  /** CEFR band derived from word.rank server-side — never stored in JSONL. */
  band:              string | null;
  /** Raw corpus frequency rank (sorted by corpus_frequency). Distinct from word.rank (curated pedagogical rank). */
  rank:              number | null;
  corpus_frequency:  number | null;
}

export interface WordRelations {
  synonyms?: string[];
  antonyms?: string[];
}

export interface Word {
  word:       string;
  translation: string;
  pos:        string | null;
  difficulty: number | null;
  notes:      string;
  glosses:    string[];
  examples:   string[];
  svg_url:    string | null;
  emoji:      string | null;
  /** Optional (not `string | null` like the others) so existing test
   *  fixtures that build a Word literal without it still typecheck — the
   *  real API always sets it (see server's vocab-loader.ts). */
  audio_url?: string | null;
  linguistic: WordLinguistic | null;
  frequency:  WordFrequency | null;
  domains:    string[];
  tags:       string[];
  relations?: WordRelations;
  /** Curated frequency rank (1 = most important). Present on API response. */
  rank?:      number | null;
  /** Legacy pipe-delimited answers string (pre-glosses schema). */
  answers?:   string;
  /**
   * Cosmetic sense annotation for words that share a translation with another
   * word — e.g. "auxiliary" on haber vs "possession" on tener, both "have".
   * Shown in parentheses next to the word wherever it's revealed as an
   * answer; never part of matching (see utils.ts's isCorrect family, which
   * only ever reads `glosses`/`translation`, not this). Optional because most
   * words never need one, and because the DB column backing it may not exist
   * yet — see data-requirements.ts's REQUIRED_WORD_COLUMNS, which does not
   * name it, and vocab-loader.ts's runtime column check.
   */
  disambiguator?: string | null;
  /**
   * Same idea as disambiguator, but shown next to the *meaning/gloss* side
   * instead of the word — e.g. funcionar's gloss "work" annotated "work
   * (function)" to tell it apart from trabajar's "work (job)". Independent of
   * disambiguator: a word can carry either, both (possibly different text on
   * each side), or neither. Client-only for now — My Content's own override,
   * not backed by a DB column the way disambiguator is (see
   * vocab-loader.ts's supportsDisambiguator).
   */
  meaningDisambiguator?: string | null;
  /**
   * Which language this word belongs to. Absent on every normal single-language
   * load — the language is implied by which array you fetched. Only set when a
   * word is merged into a multi-language list (see table-mode's Compare
   * language), so per-row code can tell two languages' words apart once they
   * share a container.
   */
  language?: string;
}
