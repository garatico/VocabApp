import type { Word } from '../types.ts';
import { normalize, levenshtein } from '../utils/match.ts';
import { readJson, writeJson, remove as removeKey, isRecord } from '../utils/storage.ts';

interface SeenEntry {
  correct:   number;
  incorrect: number;
}

interface QuizState {
  order: number[];
  pos:   number;
  seen:  Record<string, SeenEntry>;
}

export class Quiz {
  words:      Word[];
  storageKey: string;
  tolerance:  number;
  state:      QuizState;

  constructor({ words, storageKey, tolerance }: { words: Word[]; storageKey?: string; tolerance?: number }) {
    this.words      = words;
    this.storageKey = storageKey || 'quick_quiz_state';
    // Fraction of the answer's length forgiven as typos (0 = exact match only).
    this.tolerance  = tolerance ?? 0.25;
    // Corrupt or truncated state (an interrupted write) falls back to empty and
    // is rebuilt below — it used to throw out of the constructor.
    this.state      = readJson<Partial<QuizState>>(this.storageKey, {}, isRecord) as QuizState;

    // Validate saved state against the current word list. Reset if:
    //  - no order exists
    //  - order length doesn't match (different word list size)
    //  - any index is out of range (stale state from a larger list)
    const orderValid = Array.isArray(this.state.order)
      && this.state.order.length === this.words.length
      && this.state.order.every(i => i >= 0 && i < this.words.length);

    if (!orderValid) {
      // Sequential, not shuffled — `words` already arrives in whatever order
      // the caller's Order setting picked (frequency, rarest, A-Z, trouble,
      // or an actual shuffle). Randomizing here on top used to silently
      // discard that: every setting except Shuffle looked identical on
      // screen because this always reshuffled anyway.
      this.state.order = [...this.words.keys()];
      this.state.pos   = 0;
      this.state.seen  = {};
      this.save();
    }
  }

  save(): void {
    writeJson(this.storageKey, this.state);
  }

  current(): Word {
    const idx = this.state.order[this.state.pos % this.state.order.length];
    return this.words[idx];
  }

  next(): void {
    this.state.pos = (this.state.pos + 1) % this.state.order.length;
    this.save();
  }

  stats(): { seen: number; total: number; correct: number; incorrect: number } {
    const seen = Object.keys(this.state.seen).length;
    let correct = 0, incorrect = 0;
    for (const v of Object.values(this.state.seen)) {
      correct   += v.correct   || 0;
      incorrect += v.incorrect || 0;
    }
    return { seen, total: this.words.length, correct, incorrect };
  }

  // Own-property lookup — words like 'constructor' must not resolve to
  // Object.prototype members (state.seen comes from JSON.parse, a plain object).
  private seenEntry(key: string): SeenEntry {
    if (!Object.prototype.hasOwnProperty.call(this.state.seen, key)) {
      this.state.seen[key] = { correct: 0, incorrect: 0 };
    }
    return this.state.seen[key];
  }

  uniqueCorrectCount(): number {
    return this.words.filter(w =>
      Object.prototype.hasOwnProperty.call(this.state.seen, w.word)
      && this.state.seen[w.word].correct > 0
    ).length;
  }

  check(input: string): { ok: boolean; expected: string } {
    const w         = this.current();
    const normInput = normalize(input);
    let ok          = false;

    const candidates = Array.isArray(w.glosses) && w.glosses.length > 0
      ? w.glosses
      : (w.answers ? w.answers.split('|') : []);

    for (const cand of candidates) {
      const nc    = normalize(cand);
      if (nc === normInput) { ok = true; break; }
      if (this.tolerance > 0) {
        const dist   = levenshtein(nc, normInput);
        const thresh = Math.max(1, Math.floor(nc.length * this.tolerance));
        if (dist <= thresh) { ok = true; break; }
      }
    }

    const entry = this.seenEntry(w.word);
    if (ok) entry.correct++;
    else    entry.incorrect++;
    this.save();

    return { ok, expected: candidates.join(', ') };
  }

  markCorrect(): void {
    this.seenEntry(this.current().word).correct++;
    this.save();
  }

  export(): { words: Word[]; state: QuizState } {
    return { words: this.words, state: this.state };
  }

  reset(): void {
    removeKey(this.storageKey);
    this.state = { order: [...this.words.keys()], pos: 0, seen: {} };
    this.save();
  }
}
