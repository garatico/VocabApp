/**
 * guess-blank-mode.ts — "Guess the Blank": clues about an object, person,
 * place or animal; the learner types the target-language word it describes.
 *
 * Proof of concept, built the same way trivia-mode.ts was: self-contained,
 * drawing from its own hand-written question bank (data/guess-blank-
 * questions.ts) rather than the vocabulary word list — the Words/Part-of-
 * Speech/Lists/Domains filters in the controls bar have no effect here,
 * same reasoning as Trivia.
 *
 * One question at a time, free-text input only (no multiple-choice/table
 * sub-mode split like Trivia has — this is the smaller, one-mechanic POC).
 * The clues for a question reveal one at a time, weakest first, via a
 * "Show another clue" button, rather than all at once — the guess is worth
 * something even before every clue is out.
 */
import {
  getGuessBlankQuestions, type GuessBlankQuestion, type BlankDifficulty,
} from '../data/guess-blank-questions.ts';
import { getUserGuessBlankQuestions } from '../data/user-content.ts';
import { normalize } from '../utils/match.ts';
import { shuffle } from '../utils/shuffle.ts';
import { applyAutofillAttr, Settings } from '../settings.ts';
import { saveSession, recordOutcome } from '../utils/session-history.ts';
import { showSummary, clearSummary, summaryChip, percent } from '../ui/quiz-summary.ts';
import { buildScorePills, scorePct } from '../ui/score-pills.ts';
import { createStopwatch } from '../ui/stopwatch.ts';
import { languageInfo } from '../data/languages.ts';
import { hintReveal, hintableLength } from '../utils/hint-reveal.ts';

interface RenderGuessBlankModeOptions {
  container:   HTMLElement;
  lang?:       string;
  /** 'all' (default) drills every difficulty in one shuffled run. */
  difficulty?: BlankDifficulty | 'all';
}

const CATEGORY_LABELS: Record<GuessBlankQuestion['category'], string> = {
  animal: 'Animal',
  object: 'Object',
  place:  'Place',
  person: 'Person',
  food:   'Food',
};

// Leading articles the question bank's answers carry ("el gato", "the
// clock") — stripped so a bare "gato" or "clock" is accepted too. The
// learner is being quizzed on the word a clue describes, not on gender
// agreement, which Table/Recall mode already drills separately.
const ARTICLES = ['el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'the', 'a', 'an'];

function stripArticle(s: string): string | null {
  const words = s.trim().split(/\s+/);
  if (words.length < 2) return null;
  const first = normalize(words[0]);
  if (!ARTICLES.includes(first)) return null;
  return words.slice(1).join(' ');
}

function acceptedAnswers(q: GuessBlankQuestion): string[] {
  const base = [q.answerTarget, q.answerEn];
  const stripped = base.map(stripArticle).filter((s): s is string => s !== null);
  return [...base, ...stripped];
}

function isAnswerCorrect(input: string, q: GuessBlankQuestion): boolean {
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
    const green = document.getElementById(`guessBlankBar${pos}`);
    const red   = document.getElementById(`guessBlankBar${pos}Missed`);
    const stat  = document.getElementById(`guessBlankStats${pos}`);
    const score = document.getElementById(`guessBlankScore${pos}`);

    if (green) (green as HTMLElement).style.width = g + '%';
    if (red)   { (red as HTMLElement).style.left = g + '%'; (red as HTMLElement).style.width = r + '%'; }
    if (stat) {
      stat.textContent = total > 0 ? `${done} / ${total}` : '';
      stat.classList.toggle('progress-label--done', total > 0 && done === total);
    }
    if (score) score.innerHTML = buildScorePills(counts);
  });
}

const DIFFICULTY_LABELS: Record<BlankDifficulty, string> = {
  easy: 'Easy', medium: 'Medium', hard: 'Hard',
};

export function renderGuessBlankMode({
  container,
  lang = 'spanish',
  difficulty = 'all',
}: RenderGuessBlankModeOptions): void {
  container.innerHTML = '';
  clearSummary('guessBlank');
  setProgress(0, 0);

  // My Content tab additions (data/user-content.ts) — client-only, layered
  // on top of the hand-written bank the same way trivia-mode.ts layers in
  // getUserTriviaQuestions().
  const allQuestions = [...getGuessBlankQuestions(lang), ...getUserGuessBlankQuestions(lang)];
  const bank = difficulty === 'all' ? allQuestions : allQuestions.filter(q => q.difficulty === difficulty);

  if (bank.length === 0) {
    const why = allQuestions.length > 0
      ? `<p>No ${DIFFICULTY_LABELS[difficulty as BlankDifficulty]} questions yet for ${languageInfo(lang.split('+')[0]).label}.</p>
         <p>Try "All" difficulties, or check back once more are written.</p>`
      : `<p>🔍 No Guess the Blank questions yet for ${languageInfo(lang.split('+')[0]).label}.</p>
         <p>Spanish has a starter set — try that language, or check back once more are written.</p>`;
    container.innerHTML = `<div class="gb-empty">${why}</div>`;
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
  // How many of a question's clues are currently revealed — starts at one
  // (the vaguest), climbs as "Show another clue" is clicked.
  const cluesShown: number[] = queue.map(() => 1);
  // Wrong guesses made so far on each question, against Settings'
  // guesses-per-question cap — a question isn't scored missed until this
  // runs out (or Give Up/Next skips past it unanswered).
  const wrongGuesses: number[] = queue.map(() => 0);
  const maxAttempts = Settings.getGuessBlankMaxAttempts();
  // Letters revealed so far via "Show a letter", per question — separate
  // from the clues above, which describe the concept; this helps with the
  // word itself once the concept is known but the exact spelling isn't.
  // Capped short of the full word (see hintBtn below) so a hint alone can
  // never fully answer the question.
  const hintsShown: number[] = queue.map(() => 0);
  let totalHintsUsed = 0;
  let idx = 0;
  let correctCount = 0;

  function syncProgress(): void {
    setProgress(correctCount, queue.length, results.filter(r => r === false).length);
  }

  // ── Layout ───────────────────────────────────────────────────────────────

  const wrap = document.createElement('div');
  wrap.className = 'gb-wrap';

  const header = document.createElement('div');
  header.className = 'gb-header';

  const nav = document.createElement('div');
  nav.className = 'gb-nav';
  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'gb-nav-btn';
  prevBtn.textContent = '← Back';
  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'gb-nav-btn';
  nextBtn.textContent = 'Next →';
  nav.append(prevBtn, nextBtn);

  const counter = document.createElement('div');
  counter.className = 'gb-counter';

  const giveUpBtn = document.createElement('button');
  giveUpBtn.type = 'button';
  giveUpBtn.className = 'gb-giveup-btn recall-giveup-btn';
  giveUpBtn.textContent = 'Give Up';

  header.append(nav, stopwatchEl, giveUpBtn);

  const prompt = document.createElement('div');
  prompt.className = 'gb-prompt';
  const badgeRow = document.createElement('div');
  badgeRow.className = 'gb-badge-row';
  const categoryEl = document.createElement('span');
  categoryEl.className = 'gb-category';
  const difficultyEl = document.createElement('span');
  badgeRow.append(categoryEl, difficultyEl);

  const cluesList = document.createElement('ul');
  cluesList.className = 'gb-clues';

  const moreClueBtn = document.createElement('button');
  moreClueBtn.type = 'button';
  moreClueBtn.className = 'gb-more-clue-btn';

  // Letter hint — a second, independent kind of help from the clues above:
  // those describe the concept, this helps with spelling the word once the
  // concept is already known. Its own row so it doesn't read as "one more
  // clue" among the others.
  const hintRow = document.createElement('div');
  hintRow.className = 'gb-hint-row';
  const hintBtn = document.createElement('button');
  hintBtn.type = 'button';
  hintBtn.className = 'gb-hint-btn';
  const hintDisplay = document.createElement('span');
  hintDisplay.className = 'gb-hint-display';
  hintRow.append(hintBtn, hintDisplay);

  prompt.append(badgeRow, cluesList, moreClueBtn, hintRow);

  const typeRow = document.createElement('div');
  typeRow.className = 'recall-input-row gb-type-row';
  const typeInput = document.createElement('input');
  typeInput.type = 'text';
  typeInput.className = 'recall-input';
  typeInput.placeholder = 'Type your guess, in either language…';
  applyAutofillAttr(typeInput);
  typeRow.appendChild(typeInput);

  const feedback = document.createElement('div');
  feedback.className = 'gb-feedback';

  wrap.append(header, counter, prompt, typeRow, feedback);
  container.appendChild(wrap);

  // ── Question rendering ──────────────────────────────────────────────────

  /** The bare word a letter hint reveals — the article-stripped form, since
   *  that's what a learner is actually spelling out. */
  function hintTarget(q: GuessBlankQuestion): string {
    return stripArticle(q.answerTarget) ?? q.answerTarget;
  }

  function renderHint(i: number): void {
    const q      = queue[i];
    const target = hintTarget(q);
    const shown  = hintsShown[i];
    // Never reveals the last letter — a hint narrows it down, it doesn't
    // finish the job.
    const cap = Math.max(0, hintableLength(target) - 1);

    hintDisplay.textContent = shown > 0 ? hintReveal(target, shown) : '';
    hintDisplay.hidden = shown === 0;

    const answered = results[i] !== null;
    const atMax = shown >= cap;
    hintBtn.disabled = answered || finished || atMax;
    hintBtn.textContent = atMax ? 'No more letters' : (shown === 0 ? 'Show a letter' : 'Show another letter');
  }

  function renderClues(i: number): void {
    const q = queue[i];
    const shown = cluesShown[i];
    cluesList.innerHTML = '';
    q.cluesTarget.slice(0, shown).forEach(clue => {
      const li = document.createElement('li');
      li.textContent = clue;
      cluesList.appendChild(li);
    });

    const answered = results[i] !== null;
    const atMax = shown >= q.cluesTarget.length;
    moreClueBtn.disabled = answered || finished || atMax;
    moreClueBtn.textContent = atMax
      ? 'No more clues'
      : `Show another clue (${shown}/${q.cluesTarget.length})`;
  }

  function renderQuestion(i: number): void {
    const q = queue[i];
    const prior = results[i];

    counter.textContent = `${i + 1} / ${queue.length}`;
    prevBtn.disabled = i === 0;
    nextBtn.disabled = i >= queue.length - 1 && results.some(r => r === null);
    giveUpBtn.disabled = finished;

    feedback.textContent = '';
    feedback.className = 'gb-feedback';

    categoryEl.textContent = CATEGORY_LABELS[q.category];
    difficultyEl.textContent = DIFFICULTY_LABELS[q.difficulty];
    difficultyEl.className = `gb-difficulty gb-difficulty--${q.difficulty}`;
    renderClues(i);
    renderHint(i);

    // Revisiting an answered question (Back) used to always blank this box,
    // right or wrong, leaving an empty disabled input with only the feedback
    // line below to say what happened — every other mode's own "reveal what
    // was resolved" convention (Table's revealText, Trivia's own type
    // sub-mode) shows the answer itself once a question is settled.
    typeInput.value = prior !== null ? q.answerTarget : '';
    typeInput.disabled = prior !== null || finished;
    if (!typeInput.disabled) typeInput.focus();
    if (prior !== null) showFeedback(prior, q.answerTarget);
  }

  moreClueBtn.addEventListener('click', () => {
    const q = queue[idx];
    if (cluesShown[idx] < q.cluesTarget.length) {
      cluesShown[idx]++;
      renderClues(idx);
    }
  });

  hintBtn.addEventListener('click', () => {
    const cap = Math.max(0, hintableLength(hintTarget(queue[idx])) - 1);
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

    if (isAnswerCorrect(val, q)) {
      answer(idx, true);
      typeInput.disabled = true;
      return;
    }

    wrongGuesses[idx]++;
    if (wrongGuesses[idx] < maxAttempts) {
      // A guess left — let them try again rather than ending the question.
      const left = maxAttempts - wrongGuesses[idx];
      feedback.textContent = Number.isFinite(left)
        ? `✗ Not quite — ${left} guess${left === 1 ? '' : 'es'} left`
        : '✗ Not quite — try again';
      feedback.className = 'gb-feedback bad';
      typeInput.value = '';
      typeInput.classList.add('gb-shake');
      setTimeout(() => typeInput.classList.remove('gb-shake'), 300);
      return;
    }

    // Out of guesses — scored the same as a single wrong guess always was.
    answer(idx, false);
    typeInput.disabled = true;
  });

  // ── Shared answer handling ──────────────────────────────────────────────

  function showFeedback(right: boolean, correctText: string): void {
    feedback.textContent = right ? '✓ Correct!' : `✗ The answer was "${correctText}"`;
    feedback.className = 'gb-feedback ' + (right ? 'ok' : 'bad');
  }

  function answer(i: number, right: boolean): void {
    if (results[i] !== null) return;
    results[i] = right;
    if (right) correctCount++;
    syncProgress();
    showFeedback(right, queue[i].answerTarget);
    moreClueBtn.disabled = true;
    hintBtn.disabled = true;

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
    // A given-up question is neither correct nor revealed with an answer to
    // show — it just stays unanswered. Only questions actually answered
    // before Give Up was pressed count either way.
    renderQuestion(idx);
    prevBtn.disabled = true;
    nextBtn.disabled = true;
    typeInput.disabled = true;
    moreClueBtn.disabled = true;
    hintBtn.disabled = true;

    const correctWords = queue.filter((_, i) => results[i]).map(q => q.answerTarget);
    const missedWords  = queue.filter((_, i) => results[i] === false).map(q => q.answerTarget);
    // Correct without ever opening the letter hint on that question — the
    // clues themselves don't count as assistance (they're the question).
    const unassistedCount = results.filter((r, i) => r === true && hintsShown[i] === 0).length;

    recordOutcome(lang, missedWords, correctWords);
    saveSession(lang, {
      at: new Date().toISOString(),
      mode: 'guessBlank',
      total: queue.length,
      correct: correctCount,
      unassisted: unassistedCount,
      hints: totalHintsUsed,
      revealed: 0,
      seconds: stopwatch.elapsedSeconds(),
      lang,
    });

    syncProgress();
    showSummary('guessBlank',
      summaryChip('correct', `✓ ${correctCount} correct`) +
      summaryChip('missed',  `✗ ${missedWords.length} missed`) +
      summaryChip('pct',     `${percent(correctCount, queue.length)}%`),
      queue.length > 0 && missedWords.length === 0 && correctCount === queue.length,
    );
  }

  renderQuestion(idx);
  syncProgress();
}
