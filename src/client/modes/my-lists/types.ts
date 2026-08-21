/**
 * types.ts — the shapes and label tables My Lists is built out of.
 *
 * Kept apart from the modules that use them because almost every other file in
 * this directory needs `VocabEntry`, and a module that only exports types and
 * frozen tables can be imported from anywhere without creating a cycle.
 */

/**
 * A vocabulary row, reduced to the fields My Lists actually renders.
 *
 * Deliberately not the API's `Word`: that type carries conjugations, examples
 * in several languages and admin-only columns, none of which a list row shows.
 * Narrowing here means the panel cannot accidentally start depending on a field
 * the offline export does not carry.
 */
export interface VocabEntry {
  word:        string;
  translation: string;
  pos:         string | null;
  rank:        number | null;
  /** CEFR level, derived from rank server-side. */
  band:        string | null;
  glosses:     string[];
  examples:    string[];
  ipa:         string | null;
}

export type SortMode =
  | 'alpha-asc' | 'alpha-desc'
  | 'rank-asc'  | 'rank-desc'
  | 'added-desc' | 'added-asc';

export type ExportFormat = 'with-translation' | 'words-only';

/** CEFR levels, easiest first. Order matters for the chip row. */
export const BANDS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;

/** How many word rows to append per chunk while scrolling. */
export const WORD_CHUNK = 120;

/** Short labels for word-row badges. */
export const POS_ABBREV: Record<string, string> = {
  verb: 'verb', noun: 'noun', adjective: 'adj',
  adverb: 'adv', pronoun: 'pron', preposition: 'prep',
  conjunction: 'conj', article: 'art',
};

/** The chip row above the word list. The empty value is the "All" chip. */
export const POS_CHIPS: readonly { value: string; label: string }[] = [
  { value: '',            label: 'All'          },
  { value: 'verb',        label: 'Verbs'        },
  { value: 'noun',        label: 'Nouns'        },
  { value: 'adjective',   label: 'Adjectives'   },
  { value: 'adverb',      label: 'Adverbs'      },
  { value: 'pronoun',     label: 'Pronouns'     },
  { value: 'preposition', label: 'Prepositions' },
  { value: 'conjunction', label: 'Conjunctions' },
  { value: 'article',     label: 'Articles'     },
];
