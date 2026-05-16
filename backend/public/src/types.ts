/**
 * types.ts
 *
 * Core vocabulary types shared across the frontend.
 * The shape here mirrors what vocab-loader.js returns via /api/vocab/:lang.
 *
 * Import with:  import type { Word } from './types.js';
 * (The .js extension is intentional — required for ESM + bundler resolution)
 */

export interface WordLinguistic {
  infinitive:    string | null;
  reflexive:     boolean;
  gender:        string | null;
  plural:        string | null;
  register:      string | null;
  ipa:           string | null;
  syllables:     string[] | null;
  /** Keyed by tense name (e.g. "present"), value is array of 6 conjugated forms. */
  conjugations:  Record<string, string[]> | null;
}

export interface WordFrequency {
  band:              string | null;
  rank:              number | null;
  corpus_frequency:  number | null;
}

export interface Word {
  word:       string;
  display:    string;
  pos:        string | null;
  difficulty: string | null;
  notes:      string;
  glosses:    string[];
  examples:   string[];
  svg_url:    string | null;
  emoji:      string | null;
  linguistic: WordLinguistic;
  frequency:  WordFrequency;
  domains:    string[];
  tags:       string[];
}

/** Word with the resolved emoji added by picture-mode before rendering. */
export interface PictureWord extends Word {
  _emoji: string | null;
}
