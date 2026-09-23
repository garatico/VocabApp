import { conjugate, type VerbForms } from '../verb-rules.js';
import { japaneseRomaji } from '../japanese-romaji.js';
import { bandFromRank } from '../band.js';
import type { Word } from '../types.js';
import type { AssetResolver } from '../assets/types.js';
import type { WordSelectRow } from './word-select.js';

/**
 * shape-word.ts — turns one WordSelectRow into a Word, exactly the mapping
 * loadVocabFile used to do inline. Moved out so the server and the Tauri
 * client build the same Word from the same row shape, instead of the row
 * being shaped once server-side and never again anywhere else.
 */

export interface ShapeWordDeps {
  assets: AssetResolver;
  /**
   * A JSON column failed to parse, or verb-rules.conjugate() threw. The
   * server's implementation logs it and — for 'parse-error' only, matching
   * loadVocabFile's original behavior — increments a running counter
   * surfaced through getDbInfo(). 'conjugation-error' is logged but never
   * counted, same as before.
   */
  reportIssue(kind: 'parse-error' | 'conjugation-error', message: string): void;
}

/**
 * `{ [key]: value }` when `value` isn't null, `{}` otherwise — spread into an
 * object literal to omit a field rather than send it as an explicit `null`.
 * Safe specifically for the fields it's used on below: every reader in
 * src/client reaches them via optional chaining or a loose `== null` check,
 * never a strict existence check that an absent key would break.
 */
function ifSet<K extends string, V>(key: K, value: V | null): { [P in K]?: V } {
  return (value === null ? {} : { [key]: value }) as { [P in K]?: V };
}

function parseJsonField<T>(
  raw:      string | null,
  word:     string,
  field:    string,
  deps:     ShapeWordDeps,
  fallback: T | null = null,
): T | null {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    deps.reportIssue(
      'parse-error',
      `vocab-loader: JSON parse error on '${word}' field '${field}': ${(err as Error).message}` +
      ` — raw: ${String(raw).slice(0, 120)}`
    );
    return fallback;
  }
}

export function shapeWordRow(row: WordSelectRow, language: string, deps: ShapeWordDeps): Word {
  // Conjugations: compute at load time from verb-rules for rule-based verbs
  // (regular-*, ortho-*, stem-*). For irregular-* verbs the full forms live
  // in conjugation_overrides. Other languages (French, Italian, Portuguese)
  // that predate the rule engine have conjugations stored as JSON in the DB.
  let conjugations: VerbForms | null = null;
  // Parsed once regardless of conjugation_class, rather than only inside the
  // rule-engine branch below — the admin Conjugation editor needs the raw
  // overrides object too (to merge an edit into it and save), not just the
  // forms conjugate() already folded them into.
  const conjugationOverrides = row.conjugation_overrides
    ? parseJsonField<Record<string, unknown>>(row.conjugation_overrides, row.word, 'conjugation_overrides', deps, {})
    : null;
  if (row.conjugation_class) {
    try {
      const inf = row.infinitive || row.word;
      conjugations = conjugate(inf, row.conjugation_class, conjugationOverrides ?? {}, row.future_stem ?? null);
    } catch (e) {
      deps.reportIssue('conjugation-error', `verb-rules: failed for '${row.word}' (${row.conjugation_class}): ${(e as Error).message}`);
    }
  } else if (row.conjugations) {
    conjugations = parseJsonField<VerbForms>(row.conjugations, row.word, 'conjugations', deps);
  }

  const ipa = language === 'japanese' ? japaneseRomaji(row.word, row.ipa || null) : (row.ipa || null);

  return {
    word:        row.word,
    translation: row.translation  || '',
    pos:         row.pos          || null,
    difficulty:  row.difficulty   || null,
    notes:       row.notes        || '',
    glosses:   row.glosses  ? (parseJsonField<string[]>(row.glosses,  row.word, 'glosses',  deps, []) ?? []).filter(Boolean) : [],
    examples:  row.examples ? (parseJsonField<string[]>(row.examples, row.word, 'examples', deps, []) ?? []).filter(Boolean) : [],
    ...ifSet('svg_url',   deps.assets.svgUrl(language, row.word)),
    ...ifSet('emoji',     row.emoji || null),
    ...ifSet('audio_url', deps.assets.audioUrl(language, row.word)),
    linguistic: {
      reflexive: Boolean(row.reflexive),
      ...ifSet('infinitive',         row.infinitive || null),
      ...ifSet('gender',             row.gender || null),
      ...ifSet('plural',             row.plural || null),
      ...ifSet('grammatical_number', row.grammatical_number || null),
      ...ifSet('register',           row.register || null),
      // Japanese: row.ipa is a hiragana reading, converted to romaji above so
      // the Chinese-oriented romanizedScript display code — which already
      // treats linguistic.ipa as ready-to-show romanized text — works for
      // Japanese unchanged.
      ...ifSet('ipa',                ipa),
      ...ifSet('syllables',          row.syllables ? row.syllables.split('-') : null),
      ...ifSet('conjugations',          conjugations),
      ...ifSet('conjugation_class',     row.conjugation_class || null),
      ...ifSet('conjugation_overrides', conjugationOverrides),
    },
    rank:      row.rank ?? null,
    frequency: {
      band:             bandFromRank(row.rank),
      rank:             row.rank             ?? null,
      corpus_frequency: row.corpus_frequency ?? null,
    },
    domains: row.domains ? (parseJsonField<string[]>(row.domains, row.word, 'domains', deps, []) ?? []) : [],
    tags:    row.tags    ? (parseJsonField<string[]>(row.tags,    row.word, 'tags',    deps, []) ?? []).filter(Boolean) : [],
    ...ifSet('disambiguator', row.disambiguator || null),
    is_function_word: Boolean(row.is_function_word),
  };
}
