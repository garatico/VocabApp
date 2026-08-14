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

export type QuizMode = 'recall' | 'table' | 'picture' | 'single' | 'conjugation';

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
}

const SESSION_PREFIX = 'vq_history_';
const MISS_PREFIX    = 'vq_misses_';

/** Sessions retained per language. Enough for a trend, small enough for quota. */
export const HISTORY_KEEP = 30;

/** A word must be missed at least this often to count as a persistent problem. */
export const TROUBLE_THRESHOLD = 2;

// ── Sessions ──────────────────────────────────────────────────────────────────

export function getSessions(lang: string, mode?: QuizMode): SessionRecord[] {
  try {
    const raw = localStorage.getItem(SESSION_PREFIX + lang.toLowerCase());
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    const all = arr as SessionRecord[];
    return mode ? all.filter(s => s.mode === mode) : all;
  } catch { return []; }
}

/**
 * Append a session.
 *
 * Returns the sessions that existed *before* this one, so a caller can compare
 * against its own history without a second read.
 */
export function saveSession(lang: string, entry: SessionRecord): SessionRecord[] {
  const prior = getSessions(lang);
  const next  = [...prior, entry].slice(-HISTORY_KEEP);
  try {
    localStorage.setItem(SESSION_PREFIX + lang.toLowerCase(), JSON.stringify(next));
  } catch { /* quota exceeded — history is a nicety, never fail the session */ }
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
  try {
    const raw = localStorage.getItem(MISS_PREFIX + lang.toLowerCase());
    const obj = raw ? JSON.parse(raw) : {};
    return (obj && typeof obj === 'object') ? obj as MissCounts : {};
  } catch { return {}; }
}

function saveMisses(lang: string, counts: MissCounts): void {
  try {
    localStorage.setItem(MISS_PREFIX + lang.toLowerCase(), JSON.stringify(counts));
  } catch { /* quota */ }
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
  const counts = getMisses(lang);
  for (const w of missed)  counts[w] = (counts[w] ?? 0) + 1;
  for (const w of correct) {
    if (counts[w] === undefined) continue;
    counts[w] -= 1;
    if (counts[w] <= 0) delete counts[w];
  }
  saveMisses(lang, counts);
}

/** How many times this word has been missed, net of later successes. */
export function missCount(lang: string, word: string): number {
  return getMisses(lang)[word] ?? 0;
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
  localStorage.removeItem(SESSION_PREFIX + lang.toLowerCase());
  localStorage.removeItem(MISS_PREFIX + lang.toLowerCase());
}

// ── Word ordering ─────────────────────────────────────────────────────────────

export type WordOrder = 'rank' | 'alpha' | 'shuffle' | 'trouble';

export const WORD_ORDER_LABELS: [WordOrder, string][] = [
  ['rank',    'Most frequent first'],
  ['alpha',   'A → Z'],
  ['shuffle', 'Shuffle'],
  ['trouble', 'Words I keep missing first'],
];

/**
 * Order a word set for display.
 *
 * Kept here rather than in either mode so recall and table can't drift apart
 * on what "shuffle" or "trouble" means.
 */
export function orderWords<T extends { word: string; rank?: number | null }>(
  words: readonly T[],
  order: WordOrder,
  lang: string,
): T[] {
  const out = [...words];
  switch (order) {
    case 'alpha':
      return out.sort((a, b) => a.word.localeCompare(b.word));
    case 'shuffle': {
      // Fisher–Yates. Deliberately not seeded: a fresh order every session is
      // the point, otherwise you memorise positions instead of words.
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    }
    case 'trouble': {
      const counts = getMisses(lang);
      return out.sort((a, b) => {
        const d = (counts[b.word] ?? 0) - (counts[a.word] ?? 0);
        return d !== 0 ? d : (a.rank ?? 9999) - (b.rank ?? 9999);
      });
    }
    case 'rank':
    default:
      return out.sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999));
  }
}
