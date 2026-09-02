/**
 * sentence-scramble-mode.ts — reconstruct a shuffled example sentence, target
 * language only (no translation required or shown, beyond the quizzed word's
 * own gloss as an orienting hint).
 *
 * Unlike Trivia/Guess the Blank (hand-written question banks, explicitly
 * outside the vocabulary filter system — see those files' own comments),
 * this draws from `word_examples`, which already flows through the normal
 * vocabulary pipeline. So it takes the same filtered `words` list every other
 * real mode does (see start-handler.ts's `examplesOnly` filter) rather than
 * building its own pool — the Words/POS/Lists/Domains controls apply here
 * exactly as they do on Table or Recall.
 *
 * Click-to-place, not typed: a word bank of shuffled chips, tapped in order
 * into an answer row, tapped again to send back. Word order is graded
 * exactly; spelling/case/accents are not (via foldKey), since the skill this
 * drills is sentence structure, not typing.
 */
import { foldKey } from '../utils/match.ts';
import { shuffle } from '../utils/shuffle.ts';
import { saveSession, recordOutcome } from '../utils/session-history.ts';
import { showSummary, clearSummary, summaryChip, percent } from '../ui/quiz-summary.ts';
import { buildScorePills, scorePct } from '../ui/score-pills.ts';
import { createStopwatch } from '../ui/stopwatch.ts';
import type { Word } from '../types.ts';

interface RenderSentenceScrambleModeOptions {
  words:     Word[];
  container: HTMLElement;
  lang:      string;
}

// ── Pure logic ────────────────────────────────────────────────────────────

export function tokenizeSentence(sentence: string): string[] {
  return sentence.trim().split(/\s+/).filter(Boolean);
}

/** Word order must match exactly; spelling/case/accents do not. */
export function answersMatch(built: readonly string[], original: readonly string[]): boolean {
  if (built.length !== original.length) return false;
  return built.every((t, i) => foldKey(t) === foldKey(original[i]));
}

/**
 * Tokens for one scrambleable example, or null if the word has none.
 *
 * A single-word "example" can't be scrambled into anything — filtered out
 * here rather than upstream, since a word can have several examples and only
 * some might be too short.
 */
export function pickScrambleTokens(examples: readonly string[]): string[] | null {
  const candidates = examples.map(tokenizeSentence).filter(toks => toks.length >= 2);
  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

// ── Rendering ─────────────────────────────────────────────────────────────

interface Chip { id: number; text: string }
interface ScrambleQuestion { word: Word; tokens: string[] }

function setProgress(correct: number, total: number, missed: number): void {
  const counts = { correct, revealed: 0, missed, left: Math.max(0, total - correct - missed), total };
  const pct = (n: number): number => scorePct(n, total);
  const g = pct(correct), r = pct(missed);
  const done = correct + missed;

  (['Top', 'Bottom'] as const).forEach(pos => {
    const green = document.getElementById(`sentenceScrambleBar${pos}`);
    const red   = document.getElementById(`sentenceScrambleBar${pos}Missed`);
    const stat  = document.getElementById(`sentenceScrambleStats${pos}`);
    const score = document.getElementById(`sentenceScrambleScore${pos}`);

    if (green) (green as HTMLElement).style.width = g + '%';
    if (red)   { (red as HTMLElement).style.left = g + '%'; (red as HTMLElement).style.width = r + '%'; }
    if (stat) {
      stat.textContent = total > 0 ? `${done} / ${total}` : '';
      stat.classList.toggle('progress-label--done', total > 0 && done === total);
    }
    if (score) score.innerHTML = buildScorePills(counts);
  });
}

export function renderSentenceScrambleMode({
  words, container, lang,
}: RenderSentenceScrambleModeOptions): void {
  container.innerHTML = '';
  clearSummary('sentenceScramble');
  setProgress(0, 0, 0);

  const queue: ScrambleQuestion[] = [];
  words.forEach(w => {
    const tokens = pickScrambleTokens(w.examples);
    if (tokens) queue.push({ word: w, tokens });
  });

  if (queue.length === 0) {
    container.innerHTML = '<div class="ss-empty">'
      + '<p>📝 No example sentences long enough to scramble in this word set.</p>'
      + '<p>Try widening the Words filter, or a language with more examples.</p>'
      + '</div>';
    return;
  }

  const stopwatchEl = document.createElement('span');
  stopwatchEl.className = 'quiz-stopwatch';
  stopwatchEl.title = 'Time spent on this quiz';
  const stopwatch = createStopwatch(stopwatchEl);
  stopwatch.start();
  let finished = false;

  shuffle(queue);
  const results: (boolean | null)[] = queue.map(() => null);
  // What the learner actually arranged, captured at Check time — a wrong
  // answer used to be unrecoverable the moment settle() ran (answer/bank are
  // reset on the very next renderQuestion), so revisiting a missed question
  // via Back silently swapped in the *correct* order instead, styled
  // identically to a right answer. This is what the review branch below
  // shows instead, so a miss actually looks like the attempt that was made.
  const builtAnswers: (string[] | null)[] = queue.map(() => null);
  let idx = 0;
  let correctCount = 0;

  // Current attempt's chip state — reset each time a new question renders.
  let bank: Chip[] = [];
  let answer: Chip[] = [];

  function syncProgress(): void {
    setProgress(correctCount, queue.length, results.filter(r => r === false).length);
  }

  // ── Layout ───────────────────────────────────────────────────────────────

  const wrap = document.createElement('div');
  wrap.className = 'ss-wrap';

  const header = document.createElement('div');
  header.className = 'ss-header';

  const nav = document.createElement('div');
  nav.className = 'ss-nav';
  const prevBtn = document.createElement('button');
  prevBtn.type = 'button'; prevBtn.className = 'ss-nav-btn'; prevBtn.textContent = '← Back';
  const nextBtn = document.createElement('button');
  nextBtn.type = 'button'; nextBtn.className = 'ss-nav-btn'; nextBtn.textContent = 'Next →';
  nav.append(prevBtn, nextBtn);

  const counter = document.createElement('div');
  counter.className = 'ss-counter';

  const giveUpBtn = document.createElement('button');
  giveUpBtn.type = 'button'; giveUpBtn.className = 'ss-giveup-btn recall-giveup-btn';
  giveUpBtn.textContent = 'Give Up';

  header.append(nav, stopwatchEl, giveUpBtn);

  const hint = document.createElement('div');
  hint.className = 'ss-hint';

  const answerRow = document.createElement('div');
  answerRow.className = 'ss-answer-row';

  const bankRow = document.createElement('div');
  bankRow.className = 'ss-bank-row';

  const actionRow = document.createElement('div');
  actionRow.className = 'ss-action-row';
  const clearBtn = document.createElement('button');
  clearBtn.type = 'button'; clearBtn.className = 'ss-clear-btn'; clearBtn.textContent = 'Clear';
  const checkBtn = document.createElement('button');
  checkBtn.type = 'button'; checkBtn.className = 'ss-check-btn'; checkBtn.textContent = 'Check';
  actionRow.append(clearBtn, checkBtn);

  const feedback = document.createElement('div');
  feedback.className = 'ss-feedback';

  wrap.append(header, counter, hint, answerRow, bankRow, actionRow, feedback);
  container.appendChild(wrap);

  // ── Chip rendering ───────────────────────────────────────────────────────

  function renderChips(): void {
    answerRow.innerHTML = '';
    answer.forEach(chip => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'ss-chip ss-chip--answer';
      el.textContent = chip.text;
      el.disabled = finished || results[idx] !== null;
      el.addEventListener('click', () => moveToBank(chip.id));
      answerRow.appendChild(el);
    });

    bankRow.innerHTML = '';
    bank.forEach(chip => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'ss-chip ss-chip--bank';
      el.textContent = chip.text;
      el.disabled = finished || results[idx] !== null;
      el.addEventListener('click', () => moveToAnswer(chip.id));
      bankRow.appendChild(el);
    });

    const total = queue[idx].tokens.length;
    checkBtn.disabled = finished || results[idx] !== null || answer.length !== total;
    clearBtn.disabled = finished || results[idx] !== null || answer.length === 0;
  }

  function moveToAnswer(id: number): void {
    const i = bank.findIndex(c => c.id === id);
    if (i < 0) return;
    answer.push(bank[i]);
    bank.splice(i, 1);
    renderChips();
  }

  function moveToBank(id: number): void {
    const i = answer.findIndex(c => c.id === id);
    if (i < 0) return;
    bank.push(answer[i]);
    answer.splice(i, 1);
    renderChips();
  }

  function renderQuestion(i: number): void {
    const q = queue[i];
    const prior = results[i];

    counter.textContent = `${i + 1} / ${queue.length}`;
    prevBtn.disabled = i === 0;
    nextBtn.disabled = i >= queue.length - 1 && results.some(r => r === null);
    giveUpBtn.disabled = finished;

    feedback.textContent = '';
    feedback.className = 'ss-feedback';
    hint.textContent = `Build the sentence using: ${q.word.word}` +
      (q.word.translation ? ` (${q.word.translation})` : '');

    if (prior !== null) {
      // Already answered — show what was actually submitted (builtAnswers),
      // not the canonical tokens: for a miss those are two different
      // orderings, and showing the correct one here looked exactly like a
      // right answer, with nothing but the feedback text below to say
      // otherwise.
      const submitted = builtAnswers[i] ?? q.tokens;
      answer = submitted.map((text, id) => ({ id, text }));
      bank = [];
      renderChips();
      answerRow.classList.toggle('ss-answer-row--correct', prior);
      answerRow.classList.toggle('ss-answer-row--wrong', !prior);
      showFeedback(prior, q.tokens);
      return;
    }

    answerRow.classList.remove('ss-answer-row--correct', 'ss-answer-row--wrong');
    answer = [];
    bank = shuffle(q.tokens.map((text, id) => ({ id, text })));
    renderChips();
  }

  clearBtn.addEventListener('click', () => {
    bank = shuffle([...bank, ...answer]);
    answer = [];
    renderChips();
  });

  checkBtn.addEventListener('click', () => {
    if (results[idx] !== null || answer.length !== queue[idx].tokens.length) return;
    const built = answer.map(c => c.text);
    builtAnswers[idx] = built;
    settle(idx, answersMatch(built, queue[idx].tokens));
  });

  // ── Shared answer handling ──────────────────────────────────────────────

  function showFeedback(right: boolean, tokens: string[]): void {
    feedback.textContent = right ? '✓ Correct!' : `✗ Correct order: "${tokens.join(' ')}"`;
    feedback.className = 'ss-feedback ' + (right ? 'ok' : 'bad');
  }

  function settle(i: number, right: boolean): void {
    if (results[i] !== null) return;
    results[i] = right;
    if (right) correctCount++;
    syncProgress();
    showFeedback(right, queue[i].tokens);
    renderChips(); // disable further chip moves on this question
    answerRow.classList.toggle('ss-answer-row--correct', right);
    answerRow.classList.toggle('ss-answer-row--wrong', !right);

    const delay = right ? 650 : 1800;
    setTimeout(() => advance(), delay);
  }

  function advance(): void {
    if (finished) return;
    const nextUnanswered = results.findIndex((r, i) => r === null && i > idx);
    const anyLeft = results.some(r => r === null);
    if (!anyLeft) { finish(); return; }
    idx = nextUnanswered >= 0 ? nextUnanswered : results.findIndex(r => r === null);
    renderQuestion(idx);
  }

  prevBtn.addEventListener('click', () => { if (idx > 0) { idx--; renderQuestion(idx); } });
  nextBtn.addEventListener('click', () => {
    if (idx < queue.length - 1) { idx++; renderQuestion(idx); }
    else if (results.every(r => r !== null)) finish();
  });
  giveUpBtn.addEventListener('click', finish);

  // ── Session end ──────────────────────────────────────────────────────────

  function finish(): void {
    if (finished) return;
    finished = true;
    stopwatch.stop();
    giveUpBtn.disabled = true;
    renderQuestion(idx);
    prevBtn.disabled = true;
    nextBtn.disabled = true;
    checkBtn.disabled = true;
    clearBtn.disabled = true;

    const missedQuestions = queue.filter((_, i) => results[i] === false);
    const correctWords = queue.filter((_, i) => results[i]).map(q => q.word.word);
    const missedWords  = missedQuestions.map(q => q.word.word);

    recordOutcome(lang, missedWords, correctWords);
    saveSession(lang, {
      at: new Date().toISOString(),
      mode: 'sentenceScramble',
      total: queue.length,
      correct: correctCount,
      unassisted: correctCount,
      hints: 0,
      revealed: 0,
      seconds: stopwatch.elapsedSeconds(),
      lang,
    });

    syncProgress();
    // Same "↺ Practice N" pattern as table mode's own summary — see
    // table-controls.ts's buildSummaryHtml/wireSummaryButtons. Practicing
    // passes the missed words straight back into `words` — this mode
    // rebuilds its own queue from that (re-picking a scramble sentence per
    // word), so there's no separate fixedQueue param needed here.
    const retryHtml = missedQuestions.length > 0
      ? `<button type="button" class="summary-retry-btn">↺ Practice ${missedQuestions.length}</button>`
      : '';
    showSummary('sentenceScramble',
      retryHtml +
      summaryChip('correct', `✓ ${correctCount} correct`) +
      summaryChip('missed',  `✗ ${missedWords.length} missed`) +
      summaryChip('pct',     `${percent(correctCount, queue.length)}%`),
      queue.length > 0 && missedWords.length === 0 && correctCount === queue.length,
    );
    if (missedQuestions.length > 0) {
      document.querySelectorAll<HTMLButtonElement>('.summary-retry-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          renderSentenceScrambleMode({ container, lang, words: missedQuestions.map(q => q.word) });
        });
      });
    }
  }

  renderQuestion(idx);
  syncProgress();
}
