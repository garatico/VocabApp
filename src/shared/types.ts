import type { VerbForms } from './verb-rules.js';

/**
 * types.ts — the word shape produced by src/shared/vocab/shape-word.ts,
 * moved out of src/server/lib/vocab-loader.ts so both the server and the
 * Tauri client build the exact same object from a database row.
 *
 * This is deliberately NOT the same type as src/client/types.ts's `Word` —
 * that one is a broader, client-only superset (nullable `linguistic`/
 * `frequency`, extra fields like `relations`/`answers`/`language` added for
 * My Content overrides and multi-language merging that never come from the
 * database). Unifying the two would mean either loosening this shape to
 * match client-only concerns it has no business knowing about, or tightening
 * the client's to match this one and risk breaking the client code that
 * already depends on its current shape. Out of scope here — this type only
 * needs to be the one thing the server and Tauri's local SQLite reader agree
 * on, which is what actually caused the historical `band` drift this
 * refactor is trying not to repeat.
 *
 * Every `?:` field below (not `| null`, an actual absent key) is omitted at
 * serialization time when a word has no value for it, rather than sent as an
 * explicit `null` — see shape-word.ts's `ifSet` for why that's safe.
 */
export interface Word {
  word:        string;
  translation: string;
  pos:         string | null;
  difficulty:  string | null;
  notes:       string;
  glosses:     string[];
  examples:    string[];
  svg_url?:    string;
  emoji?:      string;
  audio_url?:  string;
  linguistic: {
    infinitive?:        string;
    reflexive:          boolean;
    gender?:            string;
    plural?:            string;
    grammatical_number?: string;
    register?:          string;
    ipa?:               string;
    syllables?:         string[];
    conjugations?:      VerbForms;
    conjugation_class?: string;
  };
  rank:      number | null;
  frequency: {
    band:             string | null;
    rank:             number | null;
    corpus_frequency: number | null;
  };
  domains: string[];
  tags:    string[];
  /** See Word.disambiguator in src/client/types.ts for the full rationale. */
  disambiguator?: string;
  /** See Word.is_function_word in src/client/types.ts for the full rationale. */
  is_function_word: boolean;
}
