/**
 * compact-word.ts — drop what the client can put back, on the wire only.
 *
 * `shapeWordRow` always emits four things that are fully determined by other
 * fields or are the default, which together are about 14% of a language's raw
 * JSON and ~350 KB of its gzipped transfer (Spanish):
 *
 *   frequency.rank    always equals `rank`
 *   glosses           very often exactly `[translation]`
 *   linguistic.reflexive   false for most words
 *   is_function_word       false for most words
 *
 * `compactWord` removes them; `expandWord` restores them, so the Word the app
 * holds in memory has the same shape as before and no consumer changes. Both
 * rely on shapeWordRow emitting all four on every word — an absent key can only
 * mean "dropped". `tests/compact-word.test.js` pins the round trip on the
 * real shaper's output, so a new default added to shapeWordRow either belongs
 * here or leaves the round trip unchanged.
 *
 * `register` is deliberately NOT compacted: it is absent on many real words
 * (an absent value means "unknown", not "neutral"), so the default is not safe
 * to infer.
 */

interface CompactableWord {
  translation?:      string;
  glosses?:          string[];
  rank?:             number | null;
  frequency?:        { rank?: number | null } | null;
  linguistic?:       { reflexive?: boolean } | null;
  is_function_word?: boolean;
}

/** A copy of `word` without the redundant fields. Never mutates its input. */
export function compactWord<T extends CompactableWord>(word: T): T {
  const out: CompactableWord = { ...word };
  if (out.is_function_word === false) delete out.is_function_word;
  if (out.linguistic && out.linguistic.reflexive === false) {
    out.linguistic = { ...out.linguistic };
    delete out.linguistic.reflexive;
  }
  if (out.frequency && out.frequency.rank === out.rank) {
    out.frequency = { ...out.frequency };
    delete out.frequency.rank;
  }
  if (out.glosses && out.glosses.length === 1 && out.glosses[0] === out.translation) delete out.glosses;
  return out as T;
}

/** Restores what `compactWord` dropped. Mutates and returns `word`. */
export function expandWord<T extends CompactableWord>(word: T): T {
  const w = word as CompactableWord;
  if (w.is_function_word === undefined) w.is_function_word = false;
  if (w.linguistic && w.linguistic.reflexive === undefined) w.linguistic.reflexive = false;
  if (w.frequency && w.frequency.rank === undefined) w.frequency.rank = w.rank ?? null;
  if (w.glosses === undefined && w.translation !== undefined) w.glosses = [w.translation];
  return word;
}
