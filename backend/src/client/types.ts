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
  linguistic: WordLinguistic | null;
  frequency:  WordFrequency | null;
  domains:    string[];
  tags:       string[];
  relations?: WordRelations;
  /** Curated frequency rank (1 = most important). Present on API response. */
  rank?:      number | null;
  /** Legacy pipe-delimited answers string (pre-glosses schema). */
  answers?:   string;
}
