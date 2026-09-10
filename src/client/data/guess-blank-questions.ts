/**
 * guess-blank-questions.ts — "Guess the Blank": clues about an object,
 * person, place or animal; the learner guesses the target-language word.
 *
 * The bank lives in the `guess_blank_questions` table of vocabulary.db (see
 * src/server/lib/content-loader.ts and the `GET /api/guess-blank/:language`
 * route in src/server/routes/public.ts) rather than in this file — this used
 * to be a hardcoded array here; see git history / VocabApp-Data's
 * data/content/guess_blank/*.json for the original hand-written Spanish/
 * Portuguese sets that were migrated into the database. That table is
 * optional, same as trivia_questions: a database that hasn't been migrated
 * yet, or has no rows for a given language, both just mean an empty array
 * here — guess-blank-mode.ts shows a plain "no questions yet for this
 * language" message rather than an error either way.
 *
 * `getGuessBlankQuestions` follows the exact same fetch/cache/fallback shape
 * as trivia-questions.ts's `getTriviaQuestions` — see that file's header for
 * the full reasoning (in-flight Promise cached per language, a failed fetch
 * resolves to `[]` and drops its cache entry so a later call retries, no
 * bundled-static-file fallback for a packaged build — tracked as the same
 * known gap).
 *
 * Clues are ordered weakest-first — vaguest clue shown alone, more specific
 * ones revealed on request (see guess-blank-mode.ts) — rather than all shown
 * at once, so the guess is worth something even before every clue is out.
 *
 * `difficulty` covers both halves of what makes a question hard: the target
 * word itself (a beginner noun like "gato" vs. a specific dish like
 * "paella") and the clue language (short, simple sentences using common
 * words vs. longer or more idiomatic ones). 'easy' entries keep both
 * simple; 'medium'/'hard' can lean on either.
 *
 * `answerTarget`/`answerEn` are both accepted, matched the same
 * case/accent/punctuation-insensitive way trivia-mode.ts's questions are.
 */

import { logger } from '../utils/logger.ts';

export type BlankCategory = 'animal' | 'object' | 'place' | 'person' | 'food';
export type BlankDifficulty = 'easy' | 'medium' | 'hard';

export interface GuessBlankQuestion {
  id:           string;
  category:     BlankCategory;
  difficulty:   BlankDifficulty;
  /** Weakest clue first. 2-4 per question. */
  cluesTarget:  string[];
  cluesEn:      string[];
  answerTarget: string;
  answerEn:     string;
}

/** Keyed by language, holding the in-flight/resolved fetch — see file header. */
const cache: Record<string, Promise<GuessBlankQuestion[]>> = {};

async function fetchGuessBlankQuestions(lang: string): Promise<GuessBlankQuestion[]> {
  try {
    const res = await fetch(`/api/guess-blank/${lang}`);
    if (!res.ok) throw new Error(`GET /api/guess-blank/${lang} failed with status ${res.status}`);
    const json = await res.json() as { data?: GuessBlankQuestion[] };
    return Array.isArray(json.data) ? json.data : [];
  } catch (error) {
    logger.error(`Error loading Guess the Blank questions for ${lang}:`, error);
    // Don't remember a transient failure as "this language has no
    // questions" for the rest of the session — let the next call retry.
    delete cache[lang];
    return [];
  }
}

export async function getGuessBlankQuestions(lang: string): Promise<GuessBlankQuestion[]> {
  if (!cache[lang]) cache[lang] = fetchGuessBlankQuestions(lang);
  return cache[lang];
}
