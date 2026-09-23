import type { StorageAdapter } from '../storage/types.js';

/**
 * write.ts — the entire admin write surface against the `words` table
 * (and its glosses/examples children), ported off better-sqlite3's
 * synchronous Database onto StorageAdapter so both the server and Tauri's
 * local SQLite copy can run it. Logic unchanged from
 * src/server/routes/admin/words.ts's applyWordUpdate/replaceGlosses/
 * replaceExamples — there is no delete-word operation, and `word_tags` is
 * never written here (pipeline-authored, read-only).
 */

export interface LinguisticBody {
  ipa?:        string | null;
  gender?:     string | null;
  plural?:     string | null;
  infinitive?: string | null;
  reflexive?:  boolean | null;
  register?:   string | null;
  syllables?:  string | string[] | null;
  /** Full replace of the `conjugations` column — the caller (admin
   *  Conjugation editor) merges its one edited tense into whatever this
   *  verb already had before sending it, same as it does with glosses/
   *  examples elsewhere; this never merges server-side. Only meaningful for
   *  a verb with no conjugation_class — see conjugation_overrides for the
   *  rule-engine-driven ones. */
  conjugations?: Record<string, unknown> | null;
  /** Full replace of the `conjugation_overrides` column, for a verb whose
   *  forms come from verb-rules.ts's rule engine (conjugation_class set) —
   *  editing its `conjugations` directly would do nothing, since that
   *  column is never read for such a verb (shape-word.ts). */
  conjugation_overrides?: Record<string, unknown> | null;
}

export interface FrequencyBody {
  rank?:             number | null;
  corpus_frequency?: number | null;
}

export interface WordUpdateBody {
  translation?:   string | null;
  pos?:           string | null;
  notes?:         string | null;
  emoji?:         string | null;
  difficulty?:    string | null;
  domains?:       string[] | null;
  glosses?:       string[];
  examples?:      string[];
  linguistic?:    LinguisticBody;
  frequency?:     FrequencyBody;
  disambiguator?: string | null;
}

export interface BatchUpdateItem {
  word: string;
  data: WordUpdateBody;
}

export interface ApplyWordUpdateDeps {
  /** False on a database built before the disambiguator column existed —
   *  see supportsDisambiguator()'s own comment in vocab-loader.ts. */
  supportsDisambiguator: boolean;
  onWarning(message: string): void;
}

/**
 * Inserts a bare `words` row (just `word` + `language` — everything else is
 * nullable/defaulted, per REQUIRED_WORD_COLUMNS/tests/helpers/db.js's own
 * schema) and returns its id, ready for applyWordUpdate to fill in the rest.
 * Callers must check for an existing (word, language) row themselves first —
 * the table's UNIQUE constraint would otherwise surface as a raw SQLite
 * error instead of a clean "already exists".
 */
export async function createWordRow(tx: StorageAdapter, word: string, language: string): Promise<number> {
  const { lastInsertRowid } = await tx.run('INSERT INTO words (word, language) VALUES (?, ?)', [word, language]);
  if (lastInsertRowid == null) throw new Error(`Failed to create word row for '${word}' (${language})`);
  return lastInsertRowid;
}

export async function replaceGlosses(tx: StorageAdapter, wordId: number, glosses: string[]): Promise<void> {
  await tx.run('DELETE FROM word_glosses WHERE word_id = ?', [wordId]);
  const cleaned = glosses.map(g => g.trim()).filter(Boolean);
  for (let i = 0; i < cleaned.length; i++) {
    await tx.run('INSERT INTO word_glosses (word_id, gloss, position) VALUES (?, ?, ?)', [wordId, cleaned[i], i]);
  }
}

export async function replaceExamples(tx: StorageAdapter, wordId: number, examples: string[]): Promise<void> {
  await tx.run('DELETE FROM word_examples WHERE word_id = ?', [wordId]);
  const cleaned = examples.map(e => e.trim()).filter(Boolean);
  for (let i = 0; i < cleaned.length; i++) {
    await tx.run('INSERT INTO word_examples (word_id, example, position) VALUES (?, ?, ?)', [wordId, cleaned[i], i]);
  }
}

/**
 * The full `words` row UPDATE, shared by the single-word PATCH endpoint and
 * the batch endpoint — batch used to only touch translation/pos/notes/
 * domains/ipa, a much narrower set than a single word's own PATCH, which
 * meant a caller editing several fields on several words at once (the admin
 * table view) had no single call that could actually save all of them.
 */
export async function applyWordUpdate(
  tx:   StorageAdapter,
  wordId: number,
  word: string,
  data: WordUpdateBody,
  deps: ApplyWordUpdateDeps,
): Promise<void> {
  const setClauses: string[] = ['updated_at = CURRENT_TIMESTAMP'];
  const params: unknown[]    = [];

  if ('translation' in data) { setClauses.push('translation = ?');      params.push(data.translation ?? null); }
  if ('pos'         in data) { setClauses.push('pos = ?');              params.push(data.pos         ?? null); }
  if ('notes'       in data) { setClauses.push('notes = ?');            params.push(data.notes       ?? null); }
  if ('emoji'       in data) { setClauses.push('emoji = ?');            params.push(data.emoji       ?? null); }
  if ('difficulty'  in data) { setClauses.push('difficulty = ?');       params.push(data.difficulty  ?? null); }
  if ('disambiguator' in data) {
    if (deps.supportsDisambiguator) {
      setClauses.push('disambiguator = ?'); params.push(data.disambiguator ?? null);
    } else {
      // Column doesn't exist on this database yet — dropped rather than
      // thrown, so the rest of this word's edit still saves.
      deps.onWarning(`Ignoring disambiguator update for '${word}' — no disambiguator column on this database yet`);
    }
  }
  if ('domains'     in data) {
    setClauses.push('domains = ?');
    params.push(data.domains != null ? JSON.stringify(data.domains) : null);
  }

  if (data.linguistic) {
    const ling = data.linguistic;
    if ('ipa'        in ling) { setClauses.push('ipa = ?');        params.push(ling.ipa        ?? null); }
    if ('gender'     in ling) { setClauses.push('gender = ?');     params.push(ling.gender     ?? null); }
    if ('plural'     in ling) { setClauses.push('plural = ?');     params.push(ling.plural     ?? null); }
    if ('infinitive' in ling) { setClauses.push('infinitive = ?'); params.push(ling.infinitive ?? null); }
    if ('register'   in ling) { setClauses.push('register = ?');   params.push(ling.register   ?? null); }
    if ('syllables'  in ling) {
      const sv = ling.syllables != null
        ? (Array.isArray(ling.syllables) ? ling.syllables.join('-') : String(ling.syllables))
        : null;
      setClauses.push('syllables = ?');
      params.push(sv);
    }
    if ('reflexive' in ling) {
      setClauses.push('reflexive = ?');
      params.push(ling.reflexive != null ? (ling.reflexive ? 1 : 0) : null);
    }
    if ('conjugations' in ling) {
      setClauses.push('conjugations = ?');
      params.push(ling.conjugations != null ? JSON.stringify(ling.conjugations) : null);
    }
    if ('conjugation_overrides' in ling) {
      setClauses.push('conjugation_overrides = ?');
      params.push(ling.conjugation_overrides != null ? JSON.stringify(ling.conjugation_overrides) : null);
    }
  }

  if (data.frequency) {
    const freq = data.frequency;
    if ('rank'             in freq) { setClauses.push('rank = ?');             params.push(freq.rank             ?? null); }
    if ('corpus_frequency' in freq) { setClauses.push('corpus_frequency = ?'); params.push(freq.corpus_frequency ?? null); }
  }

  if (setClauses.length > 1) {
    await tx.run(`UPDATE words SET ${setClauses.join(', ')} WHERE id = ?`, [...params, wordId]);
  }

  if (Array.isArray(data.glosses))  await replaceGlosses(tx, wordId, data.glosses);
  if (Array.isArray(data.examples)) await replaceExamples(tx, wordId, data.examples);
}
