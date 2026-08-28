/**
 * session-history.ts — what happened in past quizzes, and what you keep missing.
 *
 * Two related records, both per language, both in localStorage:
 *
 *   sessions   one entry per finished quiz, capped at HISTORY_KEEP
 *   misses     per-word tally of how often a word has been missed
 *
 * Shared by recall and table mode rather than reimplemented in each, because
 * two copies of a storage rule is exactly how the app ended up with two
 * disagreeing progress models before.
 *
 * "Missed" means the quiz ended with the word unanswered, answered wrong, or
 * revealed. Getting it right decays the tally rather than clearing it, so one
 * lucky session doesn't erase a word you have fumbled five times.
 */

import { shuffleInPlace } from './shuffle.ts';
import { readJson, writeJson, remove as removeKey, isNumberRecord, isRecord } from './storage.ts';
import { Settings } from '../settings.ts';

export type QuizMode = 'recall' | 'doubleRecall' | 'table' | 'picture' | 'conjugation' | 'trivia' | 'wordChoice' | 'guessBlank';

/**
 * Table mode's own direction — see table-mode.ts's TableDirection. The other
 * modes each have exactly one fixed direction (Recall and Picture always
 * prompt in English and take the target-language answer; Single Word always
 * shows the target word and takes the English translation), so it's implied
 * by `mode` and not worth a field of its own here.
 */
export type SessionDirection = 'target-en' | 'en-target' | 'mixed';

export interface SessionRecord {
  at:         string;    // ISO timestamp
  mode:       QuizMode;
  total:      number;    // words in the set
  correct:    number;
  /** Correct without a hint or reveal. Equals `correct` where hints don't exist. */
  unassisted: number;
  hints:      number;
  revealed:   number;
  seconds:    number;    // elapsed, not remaining
  /** The language this record is filed under — same as the bucket it's stored
   *  in, kept alongside it so a record is self-describing on its own. */
  lang:       string;
  /**
   * Every language actually touched. A Compare-mode session mixing two or
   * more languages writes one record into each language's own bucket (so
   * mastery/misses land in the right place), which otherwise leaves each of
   * those records looking single-language — this is what says "this session
   * also involved French" from the Spanish record alone. Omitted (same as
   * [lang]) for an ordinary single-language session.
   */
  langs?:     string[];
  /** Table mode only — see SessionDirection. */
  direction?: SessionDirection;
}

const SESSION_PREFIX = 'vq_history_';
const MISS_PREFIX    = 'vq_misses_';

/** Sessions retained per language. Enough for a trend, small enough for quota. */
export const HISTORY_KEEP = 100;

/** A word must be missed at least this often to count as a persistent problem. */
export const TROUBLE_THRESHOLD = 2;

// ── Sessions ──────────────────────────────────────────────────────────────────

export function getSessions(lang: string, mode?: QuizMode): SessionRecord[] {
  const all = readJson<SessionRecord[]>(SESSION_PREFIX + lang.toLowerCase(), [], Array.isArray);
  return mode ? all.filter(s => s.mode === mode) : all;
}

/**
 * Append a session.
 *
 * Returns the sessions that existed *before* this one, so a caller can compare
 * against its own history without a second read.
 */
export function saveSession(lang: string, entry: SessionRecord): SessionRecord[] {
  const prior = getSessions(lang);
  // Callers (recordMastery, endSession, etc.) still return/compare against
  // `prior` regardless of whether this write happens, so a session started
  // before the setting was flipped off still reports its own results.
  if (Settings.getHistoryEnabled()) {
    const next = [...prior, entry].slice(-HISTORY_KEEP);
    // A dropped write (quota) is fine — history is a nicety, never fail a session.
    writeJson(SESSION_PREFIX + lang.toLowerCase(), next);
  }
  return prior.filter(s => s.mode === entry.mode);
}

/** Words per minute. Returns 0 below 5 seconds, where the figure is noise. */
export function wordsPerMinute(count: number, seconds: number): number {
  if (seconds < 5) return 0;
  return Math.round((count / seconds) * 60 * 10) / 10;
}

// ── Misses ────────────────────────────────────────────────────────────────────

export type MissCounts = Record<string, number>;

export function getMisses(lang: string): MissCounts {
  return readJson<MissCounts>(MISS_PREFIX + lang.toLowerCase(), {}, isNumberRecord);
}

function saveMisses(lang: string, counts: MissCounts): void {
  writeJson(MISS_PREFIX + lang.toLowerCase(), counts);
}

/**
 * Fold a finished session into the miss tally.
 *
 * Misses increment by one; correct answers decrement by one to a floor of
 * zero, so the tally reflects a running struggle rather than a permanent
 * record. Words at zero are dropped to keep the object small.
 */
export function recordOutcome(
  lang: string,
  missed: Iterable<string>,
  correct: Iterable<string> = [],
): void {
  const counts   = getMisses(lang);
  const tallies  = getWordTallies(lang);
  for (const w of missed) {
    counts[w] = (counts[w] ?? 0) + 1;
    (tallies[w] ??= { correct: 0, wrong: 0 }).wrong += 1;
  }
  for (const w of correct) {
    if (counts[w] !== undefined) {
      counts[w] -= 1;
      if (counts[w] <= 0) delete counts[w];
    }
    (tallies[w] ??= { correct: 0, wrong: 0 }).correct += 1;
  }
  saveMisses(lang, counts);
  saveWordTallies(lang, tallies);
}

/** How many times this word has been missed, net of later successes. */
export function missCount(lang: string, word: string): number {
  return getMisses(lang)[word] ?? 0;
}

// ── Per-word quiz tallies ────────────────────────────────────────────────────
//
// Unlike `misses` (a net "still struggling" counter that decays on success),
// this keeps the raw correct/wrong counts recordOutcome already sees on every
// quiz completion — the record a "how have I actually done on this word"
// scale needs, which a decaying net counter can't answer on its own (it can't
// tell "never quizzed" from "always right", both read as zero).

export interface WordTally { correct: number; wrong: number }
export type TallyRecord = Record<string, WordTally>;

const TALLY_PREFIX = 'vq_tally_';

export function getWordTallies(lang: string): TallyRecord {
  return readJson<TallyRecord>(TALLY_PREFIX + lang.toLowerCase(), {}, isRecord);
}

function saveWordTallies(lang: string, tallies: TallyRecord): void {
  writeJson(TALLY_PREFIX + lang.toLowerCase(), tallies);
}

export function wordTally(lang: string, word: string): WordTally {
  return getWordTallies(lang)[word] ?? { correct: 0, wrong: 0 };
}

/** Labels for quizStrength()'s 0–4 scale. Index 0 doubles as "no data yet". */
export const QUIZ_STRENGTH_LABELS = ['No data', 'Struggling', 'Shaky', 'Solid', 'Strong'] as const;

/**
 * A word's quiz performance, 0–4, derived from how often recordOutcome has
 * seen it answered right vs wrong. Distinct from the learner's own mastery
 * rating: this reflects what actually happened in quizzes, not what they
 * believe about themselves.
 */
export function quizStrength(lang: string, word: string): number {
  const t     = wordTally(lang, word);
  const total = t.correct + t.wrong;
  if (total === 0) return 0;
  const ratio = t.correct / total;
  // A single data point isn't enough to call "Solid"/"Strong" yet.
  if (total === 1) return ratio === 1 ? 2 : 1;
  if (ratio >= 0.85) return 4;
  if (ratio >= 0.6)  return 3;
  if (ratio >= 0.35) return 2;
  return 1;
}

/**
 * Words missed at least `min` times, worst first.
 * This is the set worth resurfacing — the whole point of tracking misses.
 */
export function troubleWords(lang: string, min = TROUBLE_THRESHOLD): string[] {
  const counts = getMisses(lang);
  return Object.entries(counts)
    .filter(([, n]) => n >= min)
    .sort((a, b) => b[1] - a[1])
    .map(([w]) => w);
}

export function clearHistory(lang: string): void {
  removeKey(SESSION_PREFIX + lang.toLowerCase());
  removeKey(MISS_PREFIX + lang.toLowerCase());
  removeKey(TALLY_PREFIX + lang.toLowerCase());
}

// ── Word ordering ─────────────────────────────────────────────────────────────

export type WordOrder = 'rank' | 'rank-desc' | 'alpha' | 'shuffle' | 'trouble';

export const WORD_ORDER_LABELS: [WordOrder, string][] = [
  ['rank',      'Most Frequent First'],
  ['rank-desc', 'Least Frequent First'],
  ['alpha',     'A → Z'],
  ['shuffle',   'Shuffle'],
  ['trouble',   'Words I Keep Missing First'],
];

/**
 * Order a word set for display.
 *
 * Kept here rather than in either mode so recall and table can't drift apart
 * on what "shuffle" or "trouble" means.
 *
 * `lang` is normally one language for the whole list. A multi-language table
 * (Compare mode) mixes words from different languages' miss tallies into one
 * list, so `lang` also accepts a per-word resolver for that case.
 */
export function orderWords<T extends { word: string; rank?: number | null }>(
  words: readonly T[],
  order: WordOrder,
  lang: string | ((w: T) => string),
): T[] {
  const out = [...words];
  switch (order) {
    case 'alpha':
      return out.sort((a, b) => a.word.localeCompare(b.word));
    case 'shuffle':
      // Deliberately not seeded: a fresh order every session is the point,
      // otherwise you memorise positions instead of words.
      return shuffleInPlace(out);
    case 'trouble': {
      // Cache per-language miss tallies so a per-word resolver doesn't re-read
      // storage for every comparison.
      const missesByLang = new Map<string, MissCounts>();
      const missesFor = (w: T): number => {
        const l = typeof lang === 'function' ? lang(w) : lang;
        let counts = missesByLang.get(l);
        if (!counts) { counts = getMisses(l); missesByLang.set(l, counts); }
        return counts[w.word] ?? 0;
      };
      return out.sort((a, b) => {
        const d = missesFor(b) - missesFor(a);
        return d !== 0 ? d : (a.rank ?? 9999) - (b.rank ?? 9999);
      });
    }
    case 'rank-desc':
      // Rarest first. An unranked word (null) still sorts last, same as
      // plain 'rank' does — -1 is smaller than every real rank, so it's
      // always the least "rare-first-worthy" entry in a descending sort.
      return out.sort((a, b) => (b.rank ?? -1) - (a.rank ?? -1));
    case 'rank':
    default:
      return out.sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999));
  }
}
