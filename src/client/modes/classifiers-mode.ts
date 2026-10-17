/**
 * classifiers-mode.ts — which measure word counts this noun? 只 or 本 or 辆; con or cái or chiếc.
 *
 * Chinese and Vietnamese put a classifier between a number and a noun (两只猫 "two cats", hai con chó "two
 * dogs"), and which one is a fact of the noun that a translation quiz never asks about — the same gap the
 * Articles tab fills for der/die/das. VocabApp-Data carries it as `linguistic.classifier` (schemaVersion 9,
 * from Wiktionary); see utils/classifiers.ts.
 *
 * The same card as Articles (and its stylesheet): one noun at a time, four buttons — its usual classifier and
 * the quiz's most common others it does not take — number keys 1–4, instant feedback, the counted phrase
 * ("一只猫") as the answer. Any classifier the noun takes counts. Like Articles, a miss is not a missed
 * meaning, so it goes into History but not into Words to Review.
 */
import { saveSession } from '../utils/session-history.ts';
import { showSummary, clearSummary, summaryChip, percent } from '../ui/quiz-summary.ts';
import { buildScorePills, scorePct } from '../ui/score-pills.ts';
import { createStopwatch } from '../ui/stopwatch.ts';
import { bindChoiceKeys } from '../ui/choice-keys.ts';
import { classifierChoices, classifiersOf, commonClassifiers, countedOnce, takesClassifier, type ClassifierChoice } from '../utils/classifiers.ts';
import { advanceLater } from '../utils/advance-later.ts';
import { isoCode } from '../data/languages.ts';
import type { Word } from '../types.ts';
import '../styles-lazy/articles.css';

interface RenderClassifiersModeOptions {
  words:     Word[];
  container: HTMLElement;
  lang:      string;
  /** For tests: the order the buttons are shuffled in. */
  random?:   () => number;
  /** Where wrong options come from; by default the given words' own classifiers, most used first. */
  common?:   readonly string[];
}

interface ClassifierQuestion { word: Word; choices: ClassifierChoice[] }

/** The quiz's questions, in the order given: every noun with a known classifier and something to contrast it with. */
export function buildClassifierQuestions(words: readonly Word[], random: () => number = Math.random,
                                         common: readonly string[] = commonClassifiers(words)): ClassifierQuestion[] {
  const out: ClassifierQuestion[] = [];
  for (const word of words) {
    const choices = classifierChoices(word, common, 4, random);
    if (choices && choices.length > 1) out.push({ word, choices });
  }
  return out;
}

function setProgress(correct: number, total: number, missed: number): void {
  const counts = { correct, revealed: 0, missed, left: Math.max(0, total - correct - missed), total };
  const g = scorePct(correct, total), r = scorePct(missed, total);
  const done = correct + missed;
  (['Top', 'Bottom'] as const).forEach(pos => {
    const green = document.getElementById(`classifiersBar${pos}`);
    const red   = document.getElementById(`classifiersBar${pos}Missed`);
    const stat  = document.getElementById(`classifiersStats${pos}`);
    const score = document.getElementById(`classifiersScore${pos}`);
    if (green) green.style.width = g + '%';
    if (red)   { red.style.left = g + '%'; red.style.width = r + '%'; }
    if (stat) {
      stat.textContent = total > 0 ? `${done} / ${total}` : '';
      stat.classList.toggle('progress-label--done', total > 0 && done === total);
    }
    if (score) score.innerHTML = buildScorePills(counts);
  });
}

export function renderClassifiersMode({ words, container, lang, random = Math.random, common = commonClassifiers(words) }: RenderClassifiersModeOptions): void {
  container.innerHTML = '';
  clearSummary('classifiers');
  setProgress(0, 0, 0);

  const queue = buildClassifierQuestions(words, random, common);
  if (queue.length === 0) {
    container.innerHTML = '<div class="ar-empty">'
      + '<p>No nouns with a known classifier in this word set.</p>'
      + '<p>Try a larger Words count, or make sure Nouns are on in Part of Speech.</p>'
      + '</div>';
    return;
  }

  const stopwatchEl = document.createElement('span');
  stopwatchEl.className = 'quiz-stopwatch';
  stopwatchEl.title = 'Time spent on this quiz';
  const stopwatch = createStopwatch(stopwatchEl);
  stopwatch.start();

  const results: (boolean | null)[] = queue.map(() => null);
  const picked: (string | null)[] = queue.map(() => null);
  let idx = 0;
  let correctCount = 0;
  let finished = false;

  // ── Layout (Articles' card) ──────────────────────────────────────────────

  const wrap = document.createElement('div');
  wrap.className = 'ar-wrap';

  const header = document.createElement('div');
  header.className = 'ar-header';
  const nav = document.createElement('div');
  nav.className = 'ar-nav';
  const prevBtn = document.createElement('button');
  prevBtn.type = 'button'; prevBtn.className = 'ar-nav-btn'; prevBtn.textContent = '← Back';
  const nextBtn = document.createElement('button');
  nextBtn.type = 'button'; nextBtn.className = 'ar-nav-btn'; nextBtn.textContent = 'Next →';
  nav.append(prevBtn, nextBtn);
  const giveUpBtn = document.createElement('button');
  giveUpBtn.type = 'button'; giveUpBtn.className = 'ar-giveup-btn recall-giveup-btn';
  giveUpBtn.textContent = 'Give Up';
  header.append(nav, stopwatchEl, giveUpBtn);

  const counter = document.createElement('div');
  counter.className = 'ar-counter';

  const card = document.createElement('div');
  card.className = 'ar-card';
  const wordEl = document.createElement('div');
  wordEl.className = 'ar-word';
  wordEl.lang = isoCode(lang.split('+')[0]);
  const meaningEl = document.createElement('div');
  meaningEl.className = 'ar-meaning';
  card.append(wordEl, meaningEl);

  const choicesRow = document.createElement('div');
  choicesRow.className = 'ar-choices';
  choicesRow.setAttribute('role', 'group');
  choicesRow.setAttribute('aria-label', 'Classifier');

  const feedback = document.createElement('div');
  feedback.className = 'ar-feedback';
  feedback.setAttribute('role', 'status');

  wrap.append(header, counter, card, choicesRow, feedback);
  container.appendChild(wrap);
  bindChoiceKeys(choicesRow, '.ar-choice');

  // ── One question ─────────────────────────────────────────────────────────

  function renderQuestion(i: number): void {
    const q = queue[i];
    const answered = results[i] !== null;
    counter.textContent = `${i + 1} / ${queue.length}`;
    prevBtn.disabled = i === 0;
    nextBtn.disabled = i >= queue.length - 1 && results.some(r => r === null);
    giveUpBtn.disabled = finished;

    wordEl.textContent = q.word.word;
    meaningEl.textContent = q.word.translation ?? '';
    card.className = 'ar-card';

    choicesRow.innerHTML = '';
    for (const choice of q.choices) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ar-choice';
      btn.textContent = choice.label;
      btn.lang = wordEl.lang;
      btn.disabled = finished || answered;
      btn.addEventListener('click', () => answer(i, choice.label));
      choicesRow.appendChild(btn);
    }
    if (answered || finished) showResult(i);
    else { feedback.textContent = ''; feedback.className = 'ar-feedback'; }
  }

  /** Mark the right button and the wrong pick, and say the noun counted once (and what else it takes). */
  function showResult(i: number): void {
    const q = queue[i];
    const right = results[i] === true;
    choicesRow.querySelectorAll<HTMLButtonElement>('.ar-choice').forEach(btn => {
      btn.disabled = true;
      if (takesClassifier(q.word, btn.textContent ?? '')) btn.classList.add('ar-choice--right');
      else if (btn.textContent === picked[i]) btn.classList.add('ar-choice--wrong');
    });
    const others = classifiersOf(q.word).slice(1);
    const said = countedOnce(q.word, lang) + (others.length ? ` (also ${others.join(', ')})` : '');
    feedback.textContent = results[i] === null ? `→ ${said}` : right ? `✓ ${said}` : `✗ ${said}`;
    feedback.className = 'ar-feedback' + (results[i] === null ? '' : right ? ' ok' : ' bad');
    card.classList.toggle('ar-card--right', right);
    card.classList.toggle('ar-card--wrong', results[i] === false);
  }

  function answer(i: number, label: string): void {
    if (finished || results[i] !== null) return;
    const right = takesClassifier(queue[i].word, label);
    results[i] = right;
    picked[i] = label;
    if (right) correctCount++;
    syncProgress();
    showResult(i);
    advanceLater(() => idx, advance, right ? 600 : 1600);
  }

  function advance(): void {
    if (finished) return;
    if (!results.some(r => r === null)) { finish(); return; }
    const next = results.findIndex((r, j) => r === null && j > idx);
    idx = next >= 0 ? next : results.findIndex(r => r === null);
    renderQuestion(idx);
  }

  function syncProgress(): void {
    setProgress(correctCount, queue.length, results.filter(r => r === false).length);
  }

  prevBtn.addEventListener('click', () => { if (idx > 0) { idx--; renderQuestion(idx); } });
  nextBtn.addEventListener('click', () => {
    if (idx < queue.length - 1) { idx++; renderQuestion(idx); }
    else if (results.every(r => r !== null)) finish();
  });
  giveUpBtn.addEventListener('click', finish);

  // ── End of the session ───────────────────────────────────────────────────

  function finish(): void {
    if (finished) return;
    finished = true;
    stopwatch.stop();
    giveUpBtn.disabled = true;
    renderQuestion(idx);

    const missed = queue.filter((_, i) => results[i] === false);
    saveSession(lang, {
      at: new Date().toISOString(),
      mode: 'classifiers',
      total: queue.length,
      correct: correctCount,
      unassisted: correctCount,
      hints: 0,
      revealed: 0,
      seconds: stopwatch.elapsedSeconds(),
      lang,
    });
    syncProgress();

    const retryHtml = missed.length > 0
      ? `<button type="button" class="summary-retry-btn">↺ Practice ${missed.length}</button>`
      : '';
    showSummary('classifiers',
      retryHtml
      + summaryChip('correct', `✓ ${correctCount} correct`)
      + summaryChip('missed', `✗ ${missed.length} missed`)
      + summaryChip('pct', `${percent(correctCount, queue.length)}%`),
      missed.length === 0 && correctCount === queue.length,
    );
    if (missed.length > 0) {
      document.querySelectorAll<HTMLButtonElement>('#classifiersArea .summary-retry-btn').forEach(btn => {
        // Retry keeps the whole quiz's classifiers as wrong options, not just the missed nouns'.
        btn.addEventListener('click', () => renderClassifiersMode({ container, lang, random, common, words: missed.map(q => q.word) }));
      });
    }
  }

  renderQuestion(idx);
  syncProgress();
}
