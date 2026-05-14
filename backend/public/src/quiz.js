import { normalize, stripDiacritics, levenshtein } from './match.js';

export class Quiz {
  constructor({ words, storageKey }) {
    this.words      = words;
    this.storageKey = storageKey || 'quick_quiz_state';
    this.state      = JSON.parse(localStorage.getItem(this.storageKey) || '{}');

    if (!this.state.order) {
      this.state.order = this.words.map((_, i) => i).sort(() => Math.random() - 0.5);
      this.state.pos   = 0;
      this.state.seen  = {};
      this.save();
    }
  }

  save() {
    localStorage.setItem(this.storageKey, JSON.stringify(this.state));
  }

  current() {
    const idx = this.state.order[this.state.pos % this.state.order.length];
    return this.words[idx];
  }

  next() {
    this.state.pos = (this.state.pos + 1) % this.state.order.length;
    this.save();
  }

  stats() {
    const seen = Object.keys(this.state.seen).length;
    let correct = 0, incorrect = 0;
    for (const v of Object.values(this.state.seen)) {
      correct   += v.correct   || 0;
      incorrect += v.incorrect || 0;
    }
    return { seen, total: this.words.length, correct, incorrect };
  }

  check(input) {
    const w         = this.current();
    const normInput = normalize(input);
    let ok          = false;

    // Check glosses array (current schema) then answers array (legacy)
    const candidates = Array.isArray(w.glosses) && w.glosses.length > 0
      ? w.glosses
      : (w.answers || []);

    for (const cand of candidates) {
      const nc    = normalize(cand);
      if (nc === normInput) { ok = true; break; }
      const dist  = levenshtein(nc, normInput);
      const thresh = Math.max(1, Math.floor(nc.length * 0.25));
      if (dist <= thresh) { ok = true; break; }
    }

    const key = w.word;
    if (!this.state.seen[key]) this.state.seen[key] = { correct: 0, incorrect: 0 };
    if (ok) this.state.seen[key].correct++;
    else    this.state.seen[key].incorrect++;
    this.save();

    return { ok, expected: candidates.join(', ') };
  }

  markCorrect() {
    const w   = this.current();
    const key = w.word;
    if (!this.state.seen[key]) this.state.seen[key] = { correct: 0, incorrect: 0 };
    this.state.seen[key].correct++;
    this.save();
  }

  export() {
    return { words: this.words, state: this.state };
  }

  reset() {
    localStorage.removeItem(this.storageKey);
    this.state = {
      order: this.words.map((_, i) => i),
      pos:   0,
      seen:  {}
    };
    this.save();
  }
}
