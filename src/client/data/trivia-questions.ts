/**
 * trivia-questions.ts — general-knowledge trivia (history, pop culture),
 * asked in the target language.
 *
 * The bank itself lives in the `trivia_questions` table of vocabulary.db
 * (see src/server/lib/content-loader.ts and the `GET /api/trivia/:language`
 * route in src/server/routes/public.ts) rather than in this file — this used
 * to be a hardcoded array here; see git history / VocabApp-Data's
 * data/content/trivia/*.json for the original hand-written Spanish/
 * Portuguese sets that were migrated into the database. That table is
 * optional: a database that hasn't been migrated yet, or has no rows for a
 * given language, both just mean an empty array here — trivia-mode.ts shows
 * a plain "no questions yet for this language" message rather than an error
 * either way.
 *
 * `getTriviaQuestions` fetches and caches per language (the in-flight
 * Promise itself, not just the resolved value, so two callers racing before
 * the first response lands share one fetch rather than firing two — same
 * shape as data-loader.ts's loadCachedVocab, applied to this smaller,
 * optional dataset instead of the core vocabulary). A failed fetch resolves
 * to `[]` rather than rethrowing: trivia is optional supplementary content,
 * not something the app can't run without, so it folds into the same empty
 * state as "no questions yet" rather than surfacing as a hard error the
 * learner can't do anything about. The cache entry for a failed fetch is
 * dropped so a later call retries instead of a transient failure being
 * remembered as "no questions" for the rest of the session.
 *
 * Known gap: unlike data-loader.ts's vocabulary fetch, there is no bundled-
 * static-file fallback here (see vocab-source.ts) — a packaged Tauri/
 * Capacitor build with no server behind it gets an empty trivia bank rather
 * than the bundled export vocabulary gets. Tracked as a follow-up for
 * packaged builds specifically, not silently lost.
 *
 * ## Three independent difficulty axes
 *
 * `difficulty` (how obscure the fact itself is), `readingDifficulty` (how
 * hard the question's own vocabulary/sentence structure is) and
 * `readingLength` (one short clause vs. a multi-sentence prompt) are
 * deliberately independent — a fact can be common knowledge asked in a
 * dense, multi-clause sentence, or an obscure fact asked in the plainest
 * possible words. Collapsing them into one "difficulty" knob (as the
 * original schema did) couldn't tell "the learner doesn't know this fact"
 * apart from "the learner couldn't parse the question," which are very
 * different problems for a language learner specifically.
 *
 * `domains` reuses the vocabulary word-list's own domain taxonomy (see
 * domain-filter.ts / the `domains` column in the database) wherever a
 * vocabulary domain fits a trivia fact, extended with a handful of
 * trivia-only domains vocabulary never needed: `history`, `literature`,
 * `entertainment`, `culture`.
 *
 * `answerType` classifies what *kind* of thing the answer is (a year, a
 * plain number, a person, a place, or an unclassified "thing" — an object,
 * an event, a style, a language, a currency, ...). trivia-mode.ts's
 * multiple-choice distractor selection prefers same-type distractors so a
 * "Quién...?" question's correct answer (a person) doesn't sit next to an
 * obviously-wrong-shaped option like a bare year.
 */

import { logger } from '../utils/logger.ts';

export type TriviaCategory       = 'history' | 'pop-culture';
export type TriviaDifficulty     = 'easy' | 'medium' | 'hard';
export type ReadingDifficulty    = 'easy' | 'medium' | 'hard';
export type ReadingLength        = 'short' | 'long';
export type AnswerType           = 'year' | 'number' | 'person' | 'place' | 'thing';

export interface TriviaQuestion {
  id:                string;
  category:          TriviaCategory;
  /** How obscure the fact itself is. */
  difficulty:        TriviaDifficulty;
  /** How hard the question's own vocabulary/sentence structure is to read. */
  readingDifficulty: ReadingDifficulty;
  /** One short clause vs. a multi-sentence prompt. */
  readingLength:     ReadingLength;
  /** Topic tags — mostly the vocabulary domain taxonomy, see file header. */
  domains:           string[];
  /** What kind of thing the answer is — drives distractor selection. */
  answerType:        AnswerType;
  questionTarget:    string;
  questionEn:        string;
  answersTarget:     string[];
  answersEn:         string[];
}

/** Keyed by language, holding the in-flight/resolved fetch — see file header. */
const cache: Record<string, Promise<TriviaQuestion[]>> = {};

async function fetchTriviaQuestions(lang: string): Promise<TriviaQuestion[]> {
  try {
    const res = await fetch(`/api/trivia/${lang}`);
    if (!res.ok) throw new Error(`GET /api/trivia/${lang} failed with status ${res.status}`);
    const json = await res.json() as { data?: TriviaQuestion[] };
    return Array.isArray(json.data) ? json.data : [];
  } catch (error) {
    logger.error(`Error loading trivia questions for ${lang}:`, error);
    // Don't remember a transient failure as "this language has no
    // questions" for the rest of the session — let the next call retry.
    delete cache[lang];
    return [];
  }
}

export async function getTriviaQuestions(lang: string): Promise<TriviaQuestion[]> {
  if (!cache[lang]) cache[lang] = fetchTriviaQuestions(lang);
  return cache[lang];
}
