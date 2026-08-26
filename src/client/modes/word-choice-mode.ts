/**
 * word-choice-mode.ts — multiple-choice quiz built from the vocabulary itself
 * ("what does this word mean?" / "which word means this?").
 *
 * PARKED — not currently wired to any tab. This was the first take on a
 * "Trivia" mode, before "Trivia" turned out to mean general-knowledge
 * questions (history, pop culture — see trivia-mode.ts and
 * data/trivia-questions.ts) rather than a vocabulary quiz. Kept because the
 * mechanic here — one MC question at a time, four options, lock-on-answer,
 * auto-advance, decoy pool for small quiz sets — is a reasonable shape for a
 * future "quiz yourself on this word list" mode; it just isn't Trivia.
 *
 * Each question shows one word (in the target language, or its meaning,
 * depending on direction) and four answer choices, one correct. This is the
 * text equivalent of Picture mode's "click" sub-mode (picture-mode.ts's
 * renderClickMode) — same one-question-at-a-time flow, same lock-on-answer
 * and auto-advance — with words standing in for pictures.
 *
 * Direction reuses Table mode's TableDirection ('target-en' | 'en-target' |
 * 'mixed') via the shared #directionToggle control, so this mode and "Table"
 * mean the same thing when they say "direction" instead of each inventing
 * their own vocabulary for it.
 */
import type { Word } from '../types.ts';
import { getGlosses } from '../utils/utils.ts';
import { shuffle } from '../utils/shuffle.ts';
import { saveSession, recordOutcome } from '../utils/session-history.ts';
import { showSummary, clearSummary, summaryChip, percent } from '../ui/quiz-summary.ts';
import { buildScorePills, scorePct } from '../ui/score-pills.ts';
import { createStopwatch } from '../ui/stopwatch.ts';
import { languageInfo } from '../data/languages.ts';

export type WordChoiceDirection = 'target-en' | 'en-target' | 'mixed';

interface RenderWordChoiceModeOptions {
  words:            Word[];
  container:        HTMLElement;
  lang?:            string;
  direction?:       WordChoiceDirection;
  /**
   * Extra words to draw distractors from when the quiz set itself is too
   * small to fill four options without repeats — mirrors Picture mode's
   * `distractorWords`. Never scored.
   */
  distractorWords?: Word[];
}

interface Question {
  word:    Word;
  dir:     'target-en' | 'en-target';
  options: { text: string; correct: boolean }[];
}

function meaningOf(w: Word): string {
  const glosses = getGlosses(w);
  return glosses.length > 0 ? glosses[0] : (w.translation ?? w.word);
}

function setProgress(correct: number, total: number, missed = 0): void {
  const counts = { correct, revealed: 0, missed, left: Math.max(0, total - correct - missed), total };
  const pct = (n: number): number => scorePct(n, total);
  const g = pct(correct), r = pct(missed);
  const done = correct + missed;

  (['Top', 'Bottom'] as const).forEach(pos => {
    const green = document.getElementById(`wordChoiceBar${pos}`);
    const red   = document.getElementById(`wordChoiceBar${pos}Missed`);
    const stat  = document.getElementById(`wordChoiceStats${pos}`);
    const score = document.getElementById(`wordChoiceScore${pos}`);

    if (green) (green as HTMLElement).style.width = g + '%';
    if (red)   { (red as HTMLElement).style.left = g + '%'; (red as HTMLElement).style.width = r + '%'; }
    if (stat) {
      stat.textContent = total > 0 ? `${done} / ${total}` : '';
      stat.classList.toggle('progress-label--done', total > 0 && done === total);
    }
    if (score) score.innerHTML = buildScorePills(counts);
  });
}

export function renderWordChoiceMode({
  words,
  container,
  lang = 'spanish',
  direction = 'target-en',
  distractorWords = [],
}: RenderWordChoiceModeOptions): void {
  container.innerHTML = '';
  clearSummary('wordChoice');
  setProgress(0, 0);

  if (words.length === 0) {
    container.innerHTML = `
      <div class="tv-empty">
        <p>❓ No words available for a quiz round.</p>
        <p>Try selecting a different language or expanding the word count.</p>
      </div>`;
    return;
  }

  const stopwatchEl = document.createElement('span');
  stopwatchEl.className = 'quiz-stopwatch';
  stopwatchEl.title = 'Time spent on this quiz';
  const stopwatch = createStopwatch(stopwatchEl);
  stopwatch.start();
  let finished = false;

  // Decoy pool: the quiz words plus any extra distractor words, deduped by
  // spelling — a small quiz (e.g. "Top 5") would otherwise run out of unique
  // wrong answers well before four options are filled.
  const seen = new Set<string>();
  const pool: Word[] = [...words, ...distractorWords]
    .filter(w => (seen.has(w.word) ? false : (seen.add(w.word), true)));

  function buildQuestion(w: Word): Question {
    const dir: 'target-en' | 'en-target' =
      direction === 'mixed' ? (Math.random() < 0.5 ? 'target-en' : 'en-target') : direction;
    const correctText = dir === 'target-en' ? meaningOf(w) : w.word;

    const usedTexts = new Set<string>([correctText]);
    const distractors: string[] = [];
    for (const o of shuffle(pool.filter(o => o.word !== w.word))) {
      if (distractors.length >= 3) break;
      const text = dir === 'target-en' ? meaningOf(o) : o.word;
      if (usedTexts.has(text)) continue;
      usedTexts.add(text);
      distractors.push(text);
    }

    const options = shuffle([
      { text: correctText, correct: true },
      ...distractors.map(text => ({ text, correct: false })),
    ]);
    return { word: w, dir, options };
  }

  const queue = shuffle(words).map(buildQuestion);
  const results: ({ chosenIdx: number; right: boolean } | null)[] = queue.map(() => null);
  let idx = 0;
  let correctCount = 0;

  function syncProgress(): void {
    setProgress(correctCount, queue.length, results.filter(r => r !== null && !r.right).length);
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
  const promptWord = document.createElement('div');
  promptWord.className = 'tv-prompt-word';
  const promptSub = document.createElement('div');
  promptSub.className = 'tv-prompt-sub';
  prompt.append(promptWord, promptSub);

  const optionsGrid = document.createElement('div');
  optionsGrid.className = 'tv-options';

  const feedback = document.createElement('div');
  feedback.className = 'tv-feedback';

  wrap.append(header, counter, prompt, optionsGrid, feedback);
  container.appendChild(wrap);

  // ── Question rendering ──────────────────────────────────────────────────

  const targetLabel = languageInfo(lang.split('+')[0]).label;

  function renderQuestion(i: number): void {
    const q     = queue[i];
    const prior = results[i];

    counter.textContent = `${i + 1} / ${queue.length}`;
    prevBtn.disabled = i === 0;
    nextBtn.disabled = i >= queue.length - 1 && results.some(r => r === null);
    giveUpBtn.disabled = finished;

    feedback.textContent = '';
    feedback.className = 'tv-feedback';

    if (q.dir === 'target-en') {
      promptWord.textContent = q.word.word;
      promptSub.textContent  = 'What does this word mean?';
    } else {
      promptWord.textContent = meaningOf(q.word);
      promptSub.textContent  = `What is the ${targetLabel} word for this?`;
    }

    optionsGrid.innerHTML = '';
    q.options.forEach((opt, oi) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tv-option';
      btn.textContent = opt.text;

      if (prior) {
        btn.disabled = true;
        if (oi === prior.chosenIdx) btn.classList.add(prior.right ? 'tv-option--correct' : 'tv-option--wrong');
        else if (opt.correct)       btn.classList.add('tv-option--reveal');
      } else if (finished) {
        btn.disabled = true;
      } else {
        btn.addEventListener('click', () => selectOption(i, oi));
      }
      optionsGrid.appendChild(btn);
    });

    if (prior) {
      const correctText = q.options.find(o => o.correct)?.text ?? '';
      feedback.textContent = prior.right ? '✓ Correct!' : `✗ The answer was "${correctText}"`;
      feedback.classList.add(prior.right ? 'ok' : 'bad');
    }
  }

  function selectOption(i: number, oi: number): void {
    if (results[i] || finished) return;
    const opt = queue[i].options[oi];
    results[i] = { chosenIdx: oi, right: opt.correct };
    if (opt.correct) correctCount++;
    syncProgress();
    renderQuestion(i);

    const delay = opt.correct ? 650 : 1400;
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

    const correctWords = queue.filter((_, i) => results[i]?.right).map(q => q.word.word);
    const missedWords  = queue.filter((_, i) => !results[i]?.right).map(q => q.word.word);

    recordOutcome(lang, missedWords, correctWords);
    saveSession(lang, {
      at: new Date().toISOString(),
      mode: 'wordChoice',
      total: queue.length,
      correct: correctCount,
      unassisted: correctCount,
      hints: 0,
      revealed: 0,
      seconds: stopwatch.elapsedSeconds(),
      lang,
    });

    syncProgress();
    showSummary('wordChoice',
      summaryChip('correct', `✓ ${correctCount} correct`) +
      summaryChip('missed',  `✗ ${missedWords.length} missed`) +
      summaryChip('pct',     `${percent(correctCount, queue.length)}%`),
      queue.length > 0 && missedWords.length === 0,
    );
  }

  renderQuestion(idx);
  syncProgress();
}
