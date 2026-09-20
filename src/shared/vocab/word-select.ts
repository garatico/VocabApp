/**
 * word-select.ts — the SELECT-list + FROM clause shared by every reader of
 * the `words` table that wants the full shape shape-word.ts can turn into a
 * Word: the base columns plus glosses/examples/tags pulled in as JSON arrays
 * via correlated subqueries (so row order inside each array is deterministic
 * without a join that would multiply the outer row count).
 *
 * Callers append their own WHERE/ORDER BY/LIMIT — this only builds the
 * column list, since that's the part every caller (vocab-loader.ts's
 * whole-language load, the paginated admin/public routes) needs identically.
 *
 * Three columns are conditionally selected because they don't exist on every
 * database this app supports (see vocab-loader.ts's runtime PRAGMA
 * table_info checks) — a database built before that column existed is still
 * a valid database, just one where every word is the same default as if the
 * column were NULL/0.
 */

export interface WordSelectColumnFlags {
  hasDisambiguator:      boolean;
  hasIsFunctionWord:     boolean;
  hasGrammaticalNumber:  boolean;
}

/** Row shape returned by a query built with buildWordSelectSql. */
export interface WordSelectRow {
  id:                    number;
  word:                  string;
  translation:           string | null;
  pos:                   string | null;
  difficulty:            string | null;
  notes:                 string | null;
  infinitive:            string | null;
  reflexive:             number;
  gender:                string | null;
  plural:                string | null;
  register:              string | null;
  ipa:                   string | null;
  syllables:             string | null;
  conjugations:          string | null;
  conjugation_class:     string | null;
  future_stem:           string | null;
  conjugation_overrides: string | null;
  emoji:                 string | null;
  rank:                  number | null;
  corpus_frequency:      number | null;
  glosses:               string | null;
  examples:              string | null;
  domains:               string | null;
  tags:                  string | null;
  disambiguator:         string | null;
  is_function_word:      number;
  grammatical_number:    string | null;
}

/** The SELECT-list + FROM clause, no WHERE/ORDER BY/LIMIT. */
export function buildWordSelectSql(flags: WordSelectColumnFlags): string {
  return `
    SELECT
      w.id, w.word, w.translation, w.pos, w.difficulty, w.notes,
      w.infinitive, w.reflexive, w.gender, w.plural, w.register,
      w.ipa, w.syllables,
      w.conjugations,
      w.conjugation_class, w.future_stem, w.conjugation_overrides,
      w.emoji, w.rank, w.corpus_frequency,
      ${flags.hasDisambiguator ? 'w.disambiguator,' : 'NULL as disambiguator,'}
      ${flags.hasIsFunctionWord ? 'w.is_function_word,' : '0 as is_function_word,'}
      ${flags.hasGrammaticalNumber ? 'w.grammatical_number,' : 'NULL as grammatical_number,'}
      (SELECT json_group_array(gloss)
         FROM (SELECT gloss FROM word_glosses  WHERE word_id = w.id ORDER BY position)
      ) AS glosses,
      (SELECT json_group_array(example)
         FROM (SELECT example FROM word_examples WHERE word_id = w.id ORDER BY rowid)
      ) AS examples,
      w.domains,
      (SELECT json_group_array(tag)
         FROM (SELECT tag FROM word_tags WHERE word_id = w.id ORDER BY rowid)
      ) AS tags
    FROM words w
  `;
}
