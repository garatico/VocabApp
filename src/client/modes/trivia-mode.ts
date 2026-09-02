/**
 * trivia-mode.ts — general-knowledge trivia (history, pop culture), asked in
 * the target language.
 *
 * Unlike every other quiz mode, this one does not draw from the vocabulary
 * word list at all — see data/trivia-questions.ts for the (currently
 * Spanish-only, hand-written) question bank. The Words/Part-of-Speech/Lists/
 * Domains filters in the controls bar have no effect here for that reason.
 *
 * Three sub-modes, picked via #triviaStyleGroup in the controls bar (same
 * pattern as Picture mode's #pictureStyleGroup):
 *
 *   type   — one question at a time, free-text input. The answer is
 *            accepted in either the target language or English (see
 *            data/trivia-questions.ts's answersTarget/answersEn) — matched
 *            case/accent/punctuation-insensitively, no fuzzy distance the
 *            way Recall mode has, since these are proper nouns and years,
 *            not inflected vocabulary.
 *   choice — one question at a time, four options, one correct, distractors
 *            drawn from other questions' canonical target-language answers.
 *            Same one-question-at-a-time, lock-on-answer, auto-advance
 *            mechanic as Picture mode's click sub-mode.
 *   table  — every question at once, Table mode's own shape: one row per
 *            question with its own input box, checked live as you type.
 *
 * (An earlier take on "Trivia" quizzed the vocabulary itself rather than
 * general knowledge — that code moved to word-choice-mode.ts, parked but
 * not wired to a tab, since the mechanic may be useful again later.)
 */
import {
  getTriviaQuestions, type TriviaQuestion, type TriviaDifficulty,
  type ReadingDifficulty, type ReadingLength,
} from '../data/trivia-questions.ts';
import { getSelectedDomains, matchesDomainFilter } from '../filters/domain-filter.ts';
import { getUserTriviaQuestions } from '../data/user-content.ts';
import { normalize } from '../utils/match.ts';
import { shuffle } from '../utils/shuffle.ts';
import { applyAutofillAttr } from '../settings.ts';
import { saveSession, recordOutcome } from '../utils/session-history.ts';
import { showSummary, clearSummary, summaryChip, percent } from '../ui/quiz-summary.ts';
import { buildScorePills, scorePct } from '../ui/score-pills.ts';
import { createStopwatch } from '../ui/stopwatch.ts';
import { languageInfo } from '../data/languages.ts';
import { hintReveal, hintableLength } from '../utils/hint-reveal.ts';

export type TriviaSubMode = 'type' | 'choice' | 'table';

interface RenderTriviaModeOptions {
  container:          HTMLElement;
  lang?:              string;
  subMode?:           TriviaSubMode;
  /** 'all' (default) drills both History and Pop Culture questions together. */
  category?:          TriviaQuestion['category'] | 'all';
  /** 'all' (default) drills every difficulty in one shuffled run. */
  difficulty?:        TriviaDifficulty | 'all';
  /** 'all' (default) drills every reading difficulty. Independent of `difficulty` — see trivia-questions.ts's header comment. */
  readingDifficulty?: ReadingDifficulty | 'all';
  /** 'all' (default) drills every reading length. */
  readingLength?:     ReadingLength | 'all';
  /** When set, skips the filter-built bank and quizzes exactly these
   *  questions instead — the "↺ Practice N" summary button's retry-missed
   *  path (see finish()'s own summary-retry-btn wiring), matching table
   *  mode's restartWith(). */
  fixedQueue?:        TriviaQuestion[];
}

const CATEGORY_LABELS: Record<TriviaQuestion['category'], string> = {
  history:      'History',
  'pop-culture': 'Pop Culture',
};

const DIFFICULTY_LABELS: Record<TriviaDifficulty, string> = {
  easy: 'Easy', medium: 'Medium', hard: 'Hard',
};

function acceptedAnswers(q: TriviaQuestion): string[] {
  return [...q.answersTarget, ...q.answersEn];
}

function canonicalAnswer(q: TriviaQuestion): string {
  return q.answersTarget[0];
}

/**
 * Pick up to `count` multiple-choice distractors for `target` from `pool`,
 * same-type-first — see buildChoiceOptions' call site for why. Pure and
 * exported so its same-type preference is unit-testable without going
 * through the DOM-rendering half of this module (see
 * tests/client/trivia-distractors.test.ts).
 */
export function selectDistractors(target: TriviaQuestion, pool: TriviaQuestion[], count = 3): string[] {
  const used = new Set<string>([normalize(canonicalAnswer(target))]);
  const distractors: string[] = [];

  function fill(candidates: TriviaQuestion[]): void {
    for (const other of candidates) {
      if (distractors.length >= count) break;
      const text = canonicalAnswer(other);
      const key  = normalize(text);
      if (used.has(key)) continue;
      used.add(key);
      distractors.push(text);
    }
  }

  const others = pool.filter(o => o.id !== target.id);
  fill(others.filter(o => o.answerType === target.answerType));
  if (distractors.length < count) fill(others);

  return distractors;
}

function isAnswerCorrect(input: string, q: TriviaQuestion): boolean {
  const key = normalize(input);
  if (!key) return false;
  return acceptedAnswers(q).some(a => normalize(a) === key);
}

function setProgress(correct: number, total: number, missed = 0): void {
  const counts = { correct, revealed: 0, missed, left: Math.max(0, total - correct - missed), total };
  const pct = (n: number): number => scorePct(n, total);
  const g = pct(correct), r = pct(missed);
  const done = correct + missed;

  (['Top', 'Bottom'] as const).forEach(pos => {
    const green = document.getElementById(`triviaBar${pos}`);
    const red   = document.getElementById(`triviaBar${pos}Missed`);
    const stat  = document.getElementById(`triviaStats${pos}`);
    const score = document.getElementById(`triviaScore${pos}`);

    if (green) (green as HTMLElement).style.width = g + '%';
    if (red)   { (red as HTMLElement).style.left = g + '%'; (red as HTMLElement).style.width = r + '%'; }
    if (stat) {
      stat.textContent = total > 0 ? `${done} / ${total}` : '';
      stat.classList.toggle('progress-label--done', total > 0 && done === total);
    }
    if (score) score.innerHTML = buildScorePills(counts);
  });
}

/**
 * 'table' sub-mode — every question in one grid, an input box beside each,
 * the same all-rows-at-once shape as Table mode's own grid rather than one
 * question at a time. Checked live as you type, exactly like a Table mode
 * input: correct fills in and locks green, Give Up reveals the rest in red.
 */
function renderFillInTable(bank: TriviaQuestion[], container: HTMLElement, lang: string): void {
  const wrap = document.createElement('div');
  wrap.className = 'tv-qa-wrap';

  const header = document.createElement('div');
  header.className = 'tv-header tv-qa-header';
  const stopwatchEl = document.createElement('span');
  stopwatchEl.className = 'quiz-stopwatch';
  stopwatchEl.title = 'Time spent on this quiz';
  const stopwatch = createStopwatch(stopwatchEl);
  stopwatch.start();
  const giveUpBtn = document.createElement('button');
  giveUpBtn.type = 'button';
  giveUpBtn.className = 'tv-giveup-btn recall-giveup-btn';
  giveUpBtn.textContent = 'Give Up';
  header.append(stopwatchEl, giveUpBtn);

  const table = document.createElement('table');
  table.className = 'tv-qa-table';

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  ['Category', 'Difficulty', 'Question', 'Your Answer'].forEach(label => {
    const th = document.createElement('th');
    th.textContent = label;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  const inputs: HTMLInputElement[] = [];
  let finished = false;

  bank.forEach(q => {
    const tr = document.createElement('tr');

    const catTd = document.createElement('td');
    catTd.className = 'tv-qa-category';
    catTd.textContent = CATEGORY_LABELS[q.category];

    const diffTd = document.createElement('td');
    diffTd.className = `tv-qa-difficulty gb-difficulty gb-difficulty--${q.difficulty}`;
    diffTd.textContent = DIFFICULTY_LABELS[q.difficulty];

    const qTd = document.createElement('td');
    qTd.className = 'tv-qa-question';
    qTd.textContent = q.questionTarget;

    const aTd = document.createElement('td');
    aTd.className = 'tv-qa-answer-cell';
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.className = 'tv-qa-input';
    inp.placeholder = 'Type your answer, in either language…';
    applyAutofillAttr(inp);
    inp.addEventListener('input', () => {
      if (finished || inp.disabled) return;
      if (!isAnswerCorrect(inp.value, q)) return;
      inp.value = canonicalAnswer(q);
      inp.disabled = true;
      inp.classList.add('correct');
      updateProgress();
      if (inputs.every(i => i.disabled)) finish();
    });
    aTd.appendChild(inp);
    inputs.push(inp);

    tr.append(catTd, diffTd, qTd, aTd);
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  wrap.append(header, table);
  container.appendChild(wrap);

  function updateProgress(): void {
    const correct = inputs.filter(i => i.classList.contains('correct')).length;
    const missed  = inputs.filter(i => i.classList.contains('incorrect')).length;
    setProgress(correct, bank.length, missed);
  }

  function finish(): void {
    if (finished) return;
    finished = true;
    stopwatch.stop();
    giveUpBtn.disabled = true;

    bank.forEach((q, i) => {
      const inp = inputs[i];
      if (inp.disabled) return;
      inp.value = canonicalAnswer(q);
      inp.disabled = true;
      inp.classList.add('incorrect');
    });

    const correct = inputs.filter(i => i.classList.contains('correct')).length;
    const missed  = bank.length - correct;
    const missedQuestions = bank.filter((_, i) => !inputs[i].classList.contains('correct'));
    updateProgress();

    recordOutcome(lang, bank.filter((_, i) => !inputs[i].value || inputs[i].classList.contains('incorrect')).map(q => canonicalAnswer(q)),
                  bank.filter((_, i) => inputs[i].classList.contains('correct')).map(q => canonicalAnswer(q)));
    saveSession(lang, {
      at: new Date().toISOString(),
      mode: 'trivia',
      total: bank.length,
      correct,
      unassisted: correct,
      hints: 0,
      revealed: 0,
      seconds: stopwatch.elapsedSeconds(),
      lang,
    });

    // Same "↺ Practice N" pattern as the 'type'/'choice' finish() above and
    // table mode's own summary — see table-controls.ts's buildSummaryHtml.
    const retryHtml = missedQuestions.length > 0
      ? `<button type="button" class="summary-retry-btn">↺ Practice ${missedQuestions.length}</button>`
      : '';
    showSummary('trivia',
      retryHtml +
      summaryChip('correct', `✓ ${correct} correct`) +
      summaryChip('missed',  `✗ ${missed} missed`) +
      summaryChip('pct',     `${percent(correct, bank.length)}%`),
      bank.length > 0 && missed === 0,
    );
    if (missedQuestions.length > 0) {
      document.querySelectorAll<HTMLButtonElement>('.summary-retry-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          // renderFillInTable doesn't clear the container itself — it's
          // normally only ever reached through renderTriviaMode, which
          // already did this before dispatching to it.
          container.innerHTML = '';
          clearSummary('trivia');
          renderFillInTable(missedQuestions, container, lang);
        });
      });
    }
  }

  giveUpBtn.addEventListener('click', finish);
  updateProgress();
  inputs[0]?.focus();
}

export function renderTriviaMode({
  container,
  lang = 'spanish',
  subMode = 'type',
  category = 'all',
  difficulty = 'all',
  readingDifficulty = 'all',
  readingLength = 'all',
  fixedQueue,
}: RenderTriviaModeOptions): void {
  container.innerHTML = '';
  clearSummary('trivia');
  setProgress(0, 0);

  // My Content tab additions (data/user-content.ts) — client-only, layered
  // on top of the hand-written bank the same way loadWords() layers in
  // user-added vocabulary words.
  const allQuestions = [...getTriviaQuestions(lang), ...getUserTriviaQuestions(lang)];
  const selectedDomains = getSelectedDomains();
  const bank = fixedQueue ?? allQuestions.filter(q =>
    (category === 'all' || q.category === category)
    && (difficulty === 'all' || q.difficulty === difficulty)
    && (readingDifficulty === 'all' || q.readingDifficulty === readingDifficulty)
    && (readingLength === 'all' || q.readingLength === readingLength)
    && matchesDomainFilter(q, selectedDomains),
  );

  if (bank.length === 0) {
    // Four independent filters (Category, Difficulty, Reading Difficulty,
    // Reading Length) plus Domains can each narrow the bank to zero — this
    // used to always name Difficulty specifically ("No {label} questions"),
    // which broke outright when Difficulty was left at "All" (DIFFICULTY_LABELS
    // has no 'all' entry, so it printed "No undefined questions") and was
    // misleading even when it didn't crash, pointing at Difficulty when a
    // different filter was the one actually narrowing the bank to nothing.
    const why = allQuestions.length > 0
      ? `<p>No questions match the current filters for ${languageInfo(lang.split('+')[0]).label}.</p>
         <p>Try widening Category, Difficulty, Reading Difficulty or Reading Length, or check back once more are written.</p>`
      : `<p>❓ No trivia questions yet for ${languageInfo(lang.split('+')[0]).label}.</p>
         <p>Spanish has a starter set — try that language, or check back once more are written.</p>`;
    container.innerHTML = `<div class="tv-empty">${why}</div>`;
    return;
  }

  // 'table' shows every question at once with its own input box — Table
  // mode's own shape, applied to trivia questions instead of vocabulary.
  if (subMode === 'table') {
    renderFillInTable(bank, container, lang);
    return;
  }

  const stopwatchEl = document.createElement('span');
  stopwatchEl.className = 'quiz-stopwatch';
  stopwatchEl.title = 'Time spent on this quiz';
  const stopwatch = createStopwatch(stopwatchEl);
  stopwatch.start();
  let finished = false;

  const queue = shuffle(bank);
  const results: (boolean | null)[] = queue.map(() => null);
  // Letters revealed via 'type' sub-mode's "Show a letter" hint, per
  // question — 'choice' doesn't need one (the options are the assistance)
  // and never touches this.
  const hintsShown: number[] = queue.map(() => 0);
  let totalHintsUsed = 0;
  let idx = 0;
  let correctCount = 0;

  function syncProgress(): void {
    setProgress(correctCount, queue.length, results.filter(r => r === false).length);
  }

  // ── Layout ───────────────────────────────────────────────────────────────

  const wrap = document.createElement('div');
  wrap.className = 'tv-wrap';

  const header = document.createElement('div');
  header.className = 'tv-header';

  const nav = document.createElement('div');
  nav.className = 'tv-nav';
  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'tv-nav-btn';
  prevBtn.textContent = '← Back';
  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'tv-nav-btn';
  nextBtn.textContent = 'Next →';
  nav.append(prevBtn, nextBtn);

  const counter = document.createElement('div');
  counter.className = 'tv-counter';

  const giveUpBtn = document.createElement('button');
  giveUpBtn.type = 'button';
  giveUpBtn.className = 'tv-giveup-btn recall-giveup-btn';
  giveUpBtn.textContent = 'Give Up';

  header.append(nav, stopwatchEl, giveUpBtn);

  const prompt = document.createElement('div');
  prompt.className = 'tv-prompt';
  const badgeRow = document.createElement('div');
  badgeRow.className = 'tv-badge-row';
  const categoryEl = document.createElement('span');
  categoryEl.className = 'tv-category';
  const difficultyEl = document.createElement('span');
  badgeRow.append(categoryEl, difficultyEl);
  const promptWord = document.createElement('div');
  promptWord.className = 'tv-prompt-word';
  prompt.append(badgeRow, promptWord);

  // 'choice' sub-mode's answer grid
  const optionsGrid = document.createElement('div');
  optionsGrid.className = 'tv-options';

  // 'type' sub-mode's answer input
  const typeRow = document.createElement('div');
  typeRow.className = 'recall-input-row tv-type-row';
  const typeInput = document.createElement('input');
  typeInput.type = 'text';
  typeInput.className = 'recall-input';
  typeInput.placeholder = 'Type your answer, in either language…';
  applyAutofillAttr(typeInput);
  typeRow.appendChild(typeInput);

  // 'type' sub-mode's letter hint — only sub-mode with no other kind of
  // help available (choice has its options, table shows the answer key
  // live). Its own row below the input, muted, not the default path.
  const hintRow = document.createElement('div');
  hintRow.className = 'gb-hint-row';
  const hintBtn = document.createElement('button');
  hintBtn.type = 'button';
  hintBtn.className = 'gb-hint-btn';
  const hintDisplay = document.createElement('span');
  hintDisplay.className = 'gb-hint-display';
  hintRow.append(hintBtn, hintDisplay);

  const feedback = document.createElement('div');
  feedback.className = 'tv-feedback';

  wrap.append(header, counter, prompt, optionsGrid, typeRow, hintRow, feedback);
  container.appendChild(wrap);

  // ── Question rendering ──────────────────────────────────────────────────

  function renderQuestion(i: number): void {
    const q = queue[i];
    const prior = results[i];

    counter.textContent = `${i + 1} / ${queue.length}`;
    prevBtn.disabled = i === 0;
    nextBtn.disabled = i >= queue.length - 1 && results.some(r => r === null);
    giveUpBtn.disabled = finished;

    feedback.textContent = '';
    feedback.className = 'tv-feedback';

    categoryEl.textContent = CATEGORY_LABELS[q.category];
    difficultyEl.textContent = DIFFICULTY_LABELS[q.difficulty];
    difficultyEl.className = `gb-difficulty gb-difficulty--${q.difficulty}`;
    promptWord.textContent = q.questionTarget;

    if (subMode === 'choice') {
      renderChoiceOptions(i, q, prior);
    } else {
      renderTypeInput(i, q, prior);
    }
  }

  // ── 'choice' sub-mode ────────────────────────────────────────────────────

  // Distractors are drawn same-type-first — see selectDistractors — from the
  // shuffled queue, so which 3 wrong options come up still varies run to run.
  function buildChoiceOptions(q: TriviaQuestion): string[] {
    const correct = canonicalAnswer(q);
    const distractors = selectDistractors(q, shuffle(queue));
    return shuffle([correct, ...distractors]);
  }

  function renderChoiceOptions(i: number, q: TriviaQuestion, prior: boolean | null): void {
    optionsGrid.style.display = '';
    typeRow.style.display = 'none';
    hintRow.style.display = 'none';
    optionsGrid.innerHTML = '';

    const options = buildChoiceOptions(q);
    const correctText = canonicalAnswer(q);

    options.forEach(text => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tv-option';
      btn.textContent = text;
      const isCorrectOpt = normalize(text) === normalize(correctText);

      if (prior !== null) {
        btn.disabled = true;
        if (isCorrectOpt)      btn.classList.add(prior ? 'tv-option--correct' : 'tv-option--reveal');
      } else if (finished) {
        btn.disabled = true;
      } else {
        btn.addEventListener('click', () => {
          if (results[i] !== null) return;
          answer(i, isCorrectOpt);
          btn.classList.add(isCorrectOpt ? 'tv-option--correct' : 'tv-option--wrong');
          optionsGrid.querySelectorAll<HTMLButtonElement>('.tv-option').forEach(b => { b.disabled = true; });
          if (!isCorrectOpt) {
            const correctBtn = [...optionsGrid.querySelectorAll<HTMLButtonElement>('.tv-option')]
              .find(b => normalize(b.textContent ?? '') === normalize(correctText));
            correctBtn?.classList.add('tv-option--reveal');
          }
        });
      }
      optionsGrid.appendChild(btn);
    });

    if (prior !== null) showFeedback(prior, correctText);
  }

  // ── 'type' sub-mode ──────────────────────────────────────────────────────

  function renderHint(i: number): void {
    const target = canonicalAnswer(queue[i]);
    const shown  = hintsShown[i];
    // Never reveals the last letter — narrows it down, doesn't finish the job.
    const cap = Math.max(0, hintableLength(target) - 1);

    hintDisplay.textContent = shown > 0 ? hintReveal(target, shown) : '';
    hintDisplay.hidden = shown === 0;

    const answered = results[i] !== null;
    const atMax = shown >= cap;
    hintBtn.disabled = answered || finished || atMax;
    hintBtn.textContent = atMax ? 'No more letters' : (shown === 0 ? 'Show a letter' : 'Show another letter');
  }

  function renderTypeInput(i: number, q: TriviaQuestion, prior: boolean | null): void {
    optionsGrid.style.display = 'none';
    typeRow.style.display = '';
    hintRow.style.display = '';
    // Revisiting an answered question (Back) used to always blank this box —
    // right or wrong, going back showed an empty, disabled input with no
    // trace of the answer, unlike every other mode's own "reveal what was
    // resolved" convention (Table's revealText, choice sub-mode's own locked
    // buttons here). The feedback line below already names the answer for a
    // miss, but there was nothing to read *in the box itself*.
    typeInput.value = prior !== null ? canonicalAnswer(q) : '';
    typeInput.disabled = prior !== null || finished;
    if (!typeInput.disabled) typeInput.focus();
    renderHint(i);
    if (prior !== null) showFeedback(prior, canonicalAnswer(q));
  }

  hintBtn.addEventListener('click', () => {
    const cap = Math.max(0, hintableLength(canonicalAnswer(queue[idx])) - 1);
    if (hintsShown[idx] === 0) totalHintsUsed++;
    if (hintsShown[idx] < cap) {
      hintsShown[idx]++;
      renderHint(idx);
    }
  });

  typeInput.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key !== 'Enter' || finished) return;
    if (results[idx] !== null) return;
    const val = typeInput.value.trim();
    if (!val) return;
    const q = queue[idx];
    answer(idx, isAnswerCorrect(val, q));
    typeInput.disabled = true;
  });

  // ── Shared answer handling ──────────────────────────────────────────────

  function showFeedback(right: boolean, correctText: string): void {
    feedback.textContent = right ? '✓ Correct!' : `✗ The answer was "${correctText}"`;
    feedback.className = 'tv-feedback ' + (right ? 'ok' : 'bad');
  }

  function answer(i: number, right: boolean): void {
    if (results[i] !== null) return;
    results[i] = right;
    if (right) correctCount++;
    syncProgress();
    showFeedback(right, canonicalAnswer(queue[i]));
    hintBtn.disabled = true;

    const delay = right ? 650 : 1600;
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
    typeInput.disabled = true;
    hintBtn.disabled = true;

    // results[i] is null for a question Give Up caught before the learner
    // ever reached it — `!results[i]` used to treat that the same as an
    // actual wrong answer (false), so giving up right on question 1 quietly
    // recorded every other question in the run as missed, poisoning the
    // "words I keep missing" tally (recordOutcome, shared with Table mode's
    // own repeat-offender tracking) with material never even seen. Matches
    // guess-blank-mode.ts's own explicit choice here: only a question
    // actually answered counts either way.
    const missedQuestions = queue.filter((_, i) => results[i] === false);
    const correctWords = queue.filter((_, i) => results[i]).map(q => canonicalAnswer(q));
    const missedWords  = missedQuestions.map(q => canonicalAnswer(q));
    // Correct without ever opening the letter hint on that question — only
    // meaningful for 'type' sub-mode; hintsShown stays all-zero for 'choice'
    // and 'table', so this is just correctCount there.
    const unassistedCount = results.filter((r, i) => r === true && hintsShown[i] === 0).length;

    recordOutcome(lang, missedWords, correctWords);
    saveSession(lang, {
      at: new Date().toISOString(),
      mode: 'trivia',
      total: queue.length,
      correct: correctCount,
      unassisted: unassistedCount,
      hints: totalHintsUsed,
      revealed: 0,
      seconds: stopwatch.elapsedSeconds(),
      lang,
    });

    syncProgress();
    // Same "↺ Practice N" pattern as table mode's own summary — see
    // table-controls.ts's buildSummaryHtml/wireSummaryButtons, the original
    // this is modeled on.
    const retryHtml = missedQuestions.length > 0
      ? `<button type="button" class="summary-retry-btn">↺ Practice ${missedQuestions.length}</button>`
      : '';
    showSummary('trivia',
      retryHtml +
      summaryChip('correct', `✓ ${correctCount} correct`) +
      summaryChip('missed',  `✗ ${missedWords.length} missed`) +
      summaryChip('pct',     `${percent(correctCount, queue.length)}%`),
      // Not just "nothing wrong" — a Give Up part-way through a run has
      // missedWords.length === 0 too (nothing explicitly wrong, just
      // unattempted), which isn't the same as actually finishing clean.
      queue.length > 0 && missedWords.length === 0 && correctCount === queue.length,
    );
    if (missedQuestions.length > 0) {
      document.querySelectorAll<HTMLButtonElement>('.summary-retry-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          renderTriviaMode({ container, lang, subMode, fixedQueue: missedQuestions });
        });
      });
    }
  }

  renderQuestion(idx);
  syncProgress();
}
