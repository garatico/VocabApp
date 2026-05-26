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
  infinitive:      string | null;
  reflexive:       boolean;
  gender:          string | null;
  plural:          string | null;
  register:        string | null;
  ipa:             string | null;
  syllables:       string[] | null;
  /** Keyed by tense name (e.g. "present"), value is array of 6 conjugated forms.
   *  Also contains "past_participle" and "gerund" as string values for verbs. */
  conjugations:    Record<string, string[] | string> | null;
}

export interface WordFrequency {
  band:              string | null;
  rank:              number | null;
  corpus_frequency:  number | null;
}

export interface WordRelations {
  synonyms?: string[];
  antonyms?: string[];
}

export interface Word {
  word:       string;
  display:    string;
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
  /** Direct rank shortcut (mirrors frequency.rank; present on API response). */
  rank?:      number | null;
  /** Legacy pipe-delimited answers string (pre-glosses schema). */
  answers?:   string;
}

/** Word with the resolved emoji added by picture-mode before rendering. */
export interface PictureWord extends Word {
  _emoji: string | null;
}
