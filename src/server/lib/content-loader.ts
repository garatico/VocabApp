/**
 * content-loader.ts — trivia & Guess the Blank question banks.
 *
 * Same `vocabulary.db` connection as vocab-loader.ts (via getDb — no second
 * connection opened here). The data lives in four small, normalized tables —
 * `trivia_questions`/`trivia_translations` and `guess_blank_questions`/
 * `guess_blank_translations` — a "concept + per-language translations" shape
 * that lets a question be authored once and translated into any number of
 * languages independently (English included as an equal, not a hardcoded
 * side-channel). All four are OPTIONAL — a database built before this
 * feature (or any older/un-migrated deployment) simply lacks them, and that
 * is a completely normal, non-fatal state, same discipline as
 * vocab-loader.ts's hasDisambiguatorCol/hasIsFunctionWordCol: checked at
 * runtime, not listed in data-requirements.ts's REQUIRED_TABLES, and
 * "missing" just means "no rows" rather than a boot failure.
 *
 * This module's job is purely to reconstruct the same flat `TriviaQuestion`/
 * `GuessBlankQuestion` shape the rest of the app has always seen (see
 * routes/public.ts's GET /api/trivia/:language and /api/guess-blank/:language
 * — the API contract does NOT change) via a join against the requested
 * language's translation plus a second join against that same concept's
 * 'english' translation, instead of a flat per-language SELECT.
 *
 * Existence is checked fresh on every call rather than cached: these tables
 * are small (a full `sqlite_master` scan is cheap) and this way there's no
 * second cache-invalidation lifecycle to hook into vocab-loader.ts's own
 * reload/clearCache path for what is, at most, a few hundred rows.
 */

import { getDb } from './vocab-loader.js';
import { logger } from './logger.js';

// ── Types ──────────────────────────────────────────────────────────────────
//
// Minimal duplicates of the client's TriviaQuestion/GuessBlankQuestion (see
// src/client/data/trivia-questions.ts and src/client/data/guess-blank-
// questions.ts) — server and client each keep their own copy of an API
// shape rather than sharing a types file; see vocab-loader.ts's own `Word`
// interface next to the client's types.ts `Word` for the existing
// precedent this follows.

export interface TriviaQuestion {
  id:                string;
  category:          string;
  difficulty:        string;
  readingDifficulty: string;
  readingLength:     string;
  domains:           string[];
  answerType:        string;
  questionTarget:    string;
  questionEn:        string;
  answersTarget:     string[];
  answersEn:         string[];
}

export interface GuessBlankQuestion {
  id:           string;
  category:     string;
  difficulty:   string;
  cluesTarget:  string[];
  cluesEn:      string[];
  answerTarget: string;
  answerEn:     string;
}

// Rows come back from a JOIN of the concept table against the requested
// language's translation, plus a LEFT JOIN against that same concept's
// 'english' translation — so the *_en columns are nullable: a concept with
// no 'english' translation row at all yields NULL there rather than a
// missing row (see loadTriviaQuestions/loadGuessBlankQuestions below).
interface TriviaRow {
  id:                 string;
  category:           string;
  difficulty:         string;
  answer_type:        string;
  domains:            string | null;
  reading_difficulty: string;
  reading_length:     string;
  question_target:    string;
  answers_target:     string;
  question_en:        string | null;
  answers_en:         string | null;
}

interface GuessBlankRow {
  id:            string;
  category:      string;
  difficulty:    string;
  clues_target:  string;
  answer_target: string;
  clues_en:      string | null;
  answer_en:     string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Parse a JSON column value, logging a warning on failure — same reasoning
 * and shape as vocab-loader.ts's own (unexported) parseJsonField: a
 * malformed JSON column is reported, not silently swallowed into an empty
 * array with no trace.
 */
function parseJsonField<T>(raw: string | null, id: string, field: string, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    logger.warn(
      `content-loader: JSON parse error on '${id}' field '${field}': ${(err as Error).message}` +
      ` — raw: ${String(raw).slice(0, 120)}`
    );
    return fallback;
  }
}

function tableExists(name: string): boolean {
  const row = getDb()
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
    .get(name) as { name: string } | undefined;
  return row !== undefined;
}

// ── Public API ─────────────────────────────────────────────────────────────

/** All trivia questions for `language`, or `[]` if either table doesn't
 *  exist yet on this database (an older/un-migrated vocabulary.db) or no
 *  concept has a translation for this language — both ordinary, non-error
 *  states. */
export function loadTriviaQuestions(language: string): TriviaQuestion[] {
  if (!tableExists('trivia_questions') || !tableExists('trivia_translations')) return [];

  const rows = getDb()
    .prepare(`
      SELECT q.id              AS id,
             q.category        AS category,
             q.difficulty      AS difficulty,
             q.answer_type     AS answer_type,
             q.domains         AS domains,
             t.reading_difficulty AS reading_difficulty,
             t.reading_length     AS reading_length,
             t.question_text      AS question_target,
             t.answers            AS answers_target,
             e.question_text      AS question_en,
             e.answers            AS answers_en
      FROM trivia_questions q
      JOIN trivia_translations t ON t.question_id = q.id AND t.language = ?
      LEFT JOIN trivia_translations e ON e.question_id = q.id AND e.language = 'english'
      ORDER BY q.id
    `)
    .all(language.toLowerCase()) as TriviaRow[];

  return rows.map((row): TriviaQuestion => {
    const hasEnglish = row.question_en !== null && row.question_en !== undefined;
    if (!hasEnglish) {
      logger.warn(
        `content-loader: trivia question '${row.id}' has no 'english' translation` +
        ` — falling back to empty questionEn/answersEn`
      );
    }
    return {
      id:                row.id,
      category:          row.category,
      difficulty:        row.difficulty,
      readingDifficulty: row.reading_difficulty,
      readingLength:     row.reading_length,
      domains:           parseJsonField<string[]>(row.domains, row.id, 'domains', []),
      answerType:        row.answer_type,
      questionTarget:    row.question_target,
      questionEn:        row.question_en ?? '',
      answersTarget:     parseJsonField<string[]>(row.answers_target, row.id, 'answers_target', []),
      answersEn:         hasEnglish
        ? parseJsonField<string[]>(row.answers_en, row.id, 'answers_en', [])
        : [],
    };
  });
}

/** All Guess the Blank questions for `language` — same "missing table or
 *  empty is fine" contract as loadTriviaQuestions above. */
export function loadGuessBlankQuestions(language: string): GuessBlankQuestion[] {
  if (!tableExists('guess_blank_questions') || !tableExists('guess_blank_translations')) return [];

  const rows = getDb()
    .prepare(`
      SELECT q.id           AS id,
             q.category     AS category,
             q.difficulty   AS difficulty,
             t.clues        AS clues_target,
             t.answer       AS answer_target,
             e.clues        AS clues_en,
             e.answer       AS answer_en
      FROM guess_blank_questions q
      JOIN guess_blank_translations t ON t.question_id = q.id AND t.language = ?
      LEFT JOIN guess_blank_translations e ON e.question_id = q.id AND e.language = 'english'
      ORDER BY q.id
    `)
    .all(language.toLowerCase()) as GuessBlankRow[];

  return rows.map((row): GuessBlankQuestion => {
    const hasEnglish = row.answer_en !== null && row.answer_en !== undefined;
    if (!hasEnglish) {
      logger.warn(
        `content-loader: guess-blank question '${row.id}' has no 'english' translation` +
        ` — falling back to empty cluesEn/answerEn`
      );
    }
    return {
      id:           row.id,
      category:     row.category,
      difficulty:   row.difficulty,
      cluesTarget:  parseJsonField<string[]>(row.clues_target, row.id, 'clues_target', []),
      cluesEn:      hasEnglish
        ? parseJsonField<string[]>(row.clues_en, row.id, 'clues_en', [])
        : [],
      answerTarget: row.answer_target,
      answerEn:     row.answer_en ?? '',
    };
  });
}

export default { loadTriviaQuestions, loadGuessBlankQuestions };
