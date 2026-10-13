/**
 * articles-mode.ts — which article does this noun take? der/die/das, de/het,
 * el/la, le/la, il/lo/la, o/a.
 *
 * Gender is the part of a noun that a translation quiz never asks about: Table
 * accepts "Haus" for *house* whether or not the learner knows it is *das* Haus.
 * VocabApp-Data carries a gender for most nouns in all six gendered languages
 * (German and Dutch neuter since 2026-10), so this drills it directly: one noun
 * at a time, one button per article, number keys 1–3, instant feedback.
 *
 * Like Sentence Scramble it takes the filtered `words` list every real mode
 * does (start-handler.ts narrows it to nouns with a single known article and
 * tops it up to the requested size), so Words/POS/Lists/Domains apply. A miss
 * is not a missed *meaning*, so it does not go into the Words to Review tally
 * (`recordOutcome`); the session still goes into History.
 */
import { saveSession } from '../utils/session-history.ts';
import { showSummary, clearSummary, summaryChip, percent } from '../ui/quiz-summary.ts';
import { buildScorePills, scorePct } from '../ui/score-pills.ts';
import { createStopwatch } from '../ui/stopwatch.ts';
import { bindChoiceKeys } from '../ui/choice-keys.ts';
import { articleChoices, genderKey, withDefiniteArticle, type ArticleChoice } from '../utils/utils.ts';
import { advanceLater } from '../utils/advance-later.ts';
import { isoCode } from '../data/languages.ts';
import type { Word } from '../types.ts';
import '../styles-lazy/articles.css';

interface RenderArticlesModeOptions {
  words:     Word[];
  container: HTMLElement;
  lang:      string;
}

interface ArticleQuestion { word: Word; choices: ArticleChoice[] }

/** The quiz's questions, in the order given: every word that has a single known article. */
export function buildArticleQuestions(words: readonly Word[], lang: string): ArticleQuestion[] {
  const out: ArticleQuestion[] = [];
  for (const word of words) {
    const choices = articleChoices(word, lang);
    if (choices) out.push({ word, choices });
  }
  return out;
}

function setProgress(correct: number, total: number, missed: number): void {
  const counts = { correct, revealed: 0, missed, left: Math.max(0, total - correct - missed), total };
  const g = scorePct(correct, total), r = scorePct(missed, total);
  const done = correct + missed;
  (['Top', 'Bottom'] as const).forEach(pos => {
    const green = document.getElementById(`articlesBar${pos}`);
    const red   = document.getElementById(`articlesBar${pos}Missed`);
    const stat  = document.getElementById(`articlesStats${pos}`);
    const score = document.getElementById(`articlesScore${pos}`);
    if (green) green.style.width = g + '%';
    if (red)   { red.style.left = g + '%'; red.style.width = r + '%'; }
    if (stat) {
      stat.textContent = total > 0 ? `${done} / ${total}` : '';
      stat.classList.toggle('progress-label--done', total > 0 && done === total);
    }
    if (score) score.innerHTML = buildScorePills(counts);
  });
}

export function renderArticlesMode({ words, container, lang }: RenderArticlesModeOptions): void {
  container.innerHTML = '';
  clearSummary('articles');
  setProgress(0, 0, 0);

  // In the order Start built (the Order control: frequency, rarest, shuffle, trouble…).
  const queue = buildArticleQuestions(words, lang);
  if (queue.length === 0) {
    container.innerHTML = '<div class="ar-empty">'
      + '<p>No nouns with a known article in this word set.</p>'
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

  // ── Layout ───────────────────────────────────────────────────────────────

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
  choicesRow.setAttribute('aria-label', 'Article');

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
      btn.textContent = choice.article;
      btn.lang = wordEl.lang;
      btn.disabled = finished || answered;
      btn.addEventListener('click', () => answer(i, choice.article));
      choicesRow.appendChild(btn);
    }
    if (answered || finished) showResult(i);
    else { feedback.textContent = ''; feedback.className = 'ar-feedback'; }
  }

  /** Mark the right button (in the noun's gender colour) and the wrong pick, and say the noun with its article. */
  function showResult(i: number): void {
    const q = queue[i];
    const right = results[i] === true;
    const key = genderKey(q.word);
    choicesRow.querySelectorAll<HTMLButtonElement>('.ar-choice').forEach(btn => {
      btn.disabled = true;
      const choice = q.choices.find(c => c.article === btn.textContent);
      if (choice?.correct) {
        btn.classList.add('ar-choice--right');
        if (key) btn.classList.add(`gender-word-bg--${key}`);
      } else if (btn.textContent === picked[i]) {
        btn.classList.add('ar-choice--wrong');
      }
    });
    const said = withDefiniteArticle(q.word, lang);
    feedback.textContent = results[i] === null ? `→ ${said}` : right ? `✓ ${said}` : `✗ ${said}`;
    feedback.className = 'ar-feedback' + (results[i] === null ? '' : right ? ' ok' : ' bad');
    card.classList.toggle('ar-card--right', right);
    card.classList.toggle('ar-card--wrong', results[i] === false);
  }

  function answer(i: number, article: string): void {
    if (finished || results[i] !== null) return;
    const right = queue[i].choices.some(c => c.correct && c.article === article);
    results[i] = right;
    picked[i] = article;
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
    renderQuestion(idx);   // Back/Next stay usable, to look over the answers

    const missed = queue.filter((_, i) => results[i] === false);
    saveSession(lang, {
      at: new Date().toISOString(),
      mode: 'articles',
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
    showSummary('articles',
      retryHtml
      + summaryChip('correct', `✓ ${correctCount} correct`)
      + summaryChip('missed', `✗ ${missed.length} missed`)
      + summaryChip('pct', `${percent(correctCount, queue.length)}%`),
      missed.length === 0 && correctCount === queue.length,
    );
    if (missed.length > 0) {
      document.querySelectorAll<HTMLButtonElement>('#articlesArea .summary-retry-btn').forEach(btn => {
        btn.addEventListener('click', () => renderArticlesMode({ container, lang, words: missed.map(q => q.word) }));
      });
    }
  }

  renderQuestion(idx);
  syncProgress();
}
