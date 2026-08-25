import type { Word } from '../types.ts';
import { saveSession, recordOutcome } from '../utils/session-history.ts';
import { speak }     from '../utils/tts.ts';
import { matchesAnswer, getGlosses, getPosLabel } from '../utils/utils.ts';
import { Settings, applyAutofillAttr } from '../settings.ts';
import type { Quiz } from './quiz.ts';
import { mustGet }   from '../utils/dom.ts';
import { createStopwatch } from '../ui/stopwatch.ts';

// ── Module state ───────────────────────────────────────────────────────────────

let quizInstance: Quiz | null       = null;
let getLangCode:  (() => string) | null = null;

// Session state — rebuilt each time the user hits Start Quiz in single mode
let deck:         Word[]      = [];   // in whatever order Quiz.words arrived in
let mastered:     Set<string> = new Set();
/** Every word whose card is done — correct, or (Flashcard style only) graded
 *  incorrect. mastered is a subset. Type Answer style never settles a card
 *  wrong; it just sits there until typed correctly or skipped past. */
let settled:      Set<string> = new Set();
let pageIndex     = 0;
let cardsPerScreen = 1;
let cardStyle: 'type' | 'flashcard' = 'type';
let sessionActive = false;
// Lazy — avoids touching `document` at module scope, so this file stays safe
// to import from a plain node test environment (see table-controls.ts's own
// getStopwatch() for the concrete case this guards against).
let stopwatch: ReturnType<typeof createStopwatch> | null = null;
function getStopwatch(): ReturnType<typeof createStopwatch> {
  if (!stopwatch) stopwatch = createStopwatch(document.getElementById('quizStopwatch'));
  return stopwatch;
}
let sessionSaved  = false;        // endSession also fires on Play Again

export function setQuiz(instance: Quiz): void {
  quizInstance = instance;
}

// ── Public API ─────────────────────────────────────────────────────────────────

export function bindQuizControls({ getLang }: { getLang: () => string }): { showCurrent: () => void } {
  getLangCode = getLang;

  // DOM refs (mustGet throws immediately if the element is absent)
  const quizWrap    = mustGet<HTMLElement>('quizWrap');
  const barEl       = mustGet<HTMLElement>('bar');
  const statsEl     = mustGet<HTMLElement>('stats');
  const statsTopEl  = document.getElementById('statsTop')     as HTMLElement | null;
  const endBtn      = mustGet<HTMLButtonElement>('resetBtn');
  const prevBtn     = mustGet<HTMLButtonElement>('quizPrev');
  const nextBtn     = mustGet<HTMLButtonElement>('quizNext');
  const counterEl   = mustGet<HTMLElement>('quizCounter');

  // ── Paging ───────────────────────────────────────────────────────────────────

  function pageCount(): number {
    return Math.max(1, Math.ceil(deck.length / cardsPerScreen));
  }

  function pageWords(): Word[] {
    const start = pageIndex * cardsPerScreen;
    return deck.slice(start, start + cardsPerScreen);
  }

  // ── Stats ──────────────────────────────────────────────────────────────────

  function updateStats(): void {
    const total = deck.length;
    const done  = mastered.size;
    const pct   = total ? Math.round((done / total) * 100) : 0;
    barEl.style.width = pct + '%';
    const text = `Mastered ${done} / ${total}`;
    statsEl.textContent = text;
    if (statsTopEl) statsTopEl.textContent = text;
  }

  function updateNav(): void {
    if (deck.length === 0) { counterEl.textContent = ''; return; }
    const start = pageIndex * cardsPerScreen + 1;
    const end   = Math.min(start + cardsPerScreen - 1, deck.length);
    const range = start === end ? `${start}` : `${start}–${end}`;
    counterEl.textContent = `${range} / ${deck.length}`;
    prevBtn.disabled = !sessionActive || pageIndex === 0;
    nextBtn.disabled = !sessionActive || pageIndex >= pageCount() - 1;
  }

  // ── Card building ────────────────────────────────────────────────────────────

  function metaText(word: Word): string {
    const parts: string[] = [];
    if (Settings.getSingleShowPos() && word.pos) parts.push(getPosLabel(word));
    if (Settings.getSingleShowBand() && word.frequency?.band) parts.push(word.frequency.band);
    if (Settings.getSingleShowDomain()) {
      const domain = word.domains?.[0];
      if (domain && domain !== 'general') parts.push(domain.replace(/_/g, ' '));
    }
    return parts.join(' · ');
  }

  /** Word settled (mastered.add for correct; settled.add either way), then
   *  check whether the page — and the whole deck — is done. */
  function settleWord(word: Word, correct: boolean): void {
    if (correct) mastered.add(word.word);
    settled.add(word.word);
    updateStats();
    updateNav();

    if (settled.size === deck.length) {
      setTimeout(() => { if (sessionActive) endSession(); }, 500);
      return;
    }
    if (pageWords().every(w => settled.has(w.word)) && pageIndex < pageCount() - 1) {
      setTimeout(() => { if (sessionActive) goToPage(pageIndex + 1); }, 500);
    }
  }

  function buildTypeCard(word: Word): HTMLElement {
    const card = document.createElement('div');
    card.className = 'quiz-card';
    card.dataset.word = word.word;

    const head = document.createElement('div');
    head.className = 'quiz-card-head';
    const wordEl = document.createElement('div');
    wordEl.className = 'word';
    wordEl.textContent = word.word;
    const ttsBtn = document.createElement('button');
    ttsBtn.type = 'button';
    ttsBtn.className = 'quiz-card-tts';
    ttsBtn.setAttribute('aria-label', 'Listen to pronunciation');
    ttsBtn.textContent = '\u{1F50A}';
    ttsBtn.addEventListener('click', () => {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      void speak(word.word, getLangCode!());
    });
    head.append(wordEl, ttsBtn);

    const metaEl = document.createElement('div');
    metaEl.className = 'word-meta';
    metaEl.textContent = metaText(word);

    const inp = document.createElement('input');
    inp.type = 'text';
    inp.className = 'quiz-card-input';
    inp.placeholder = 'Type the translation…';
    applyAutofillAttr(inp);

    const feedbackEl = document.createElement('div');
    feedbackEl.className = 'quiz-card-feedback';

    const actions = document.createElement('div');
    actions.className = 'quiz-card-actions';
    const correctBtn = document.createElement('button');
    correctBtn.type = 'button';
    correctBtn.textContent = 'Mark Correct';
    const revealBtn = document.createElement('button');
    revealBtn.type = 'button';
    revealBtn.textContent = 'Reveal Answer';
    actions.append(correctBtn, revealBtn);

    function finish(): void {
      inp.disabled = true;
      correctBtn.disabled = true;
      card.classList.add('correct');
      settleWord(word, true);
    }

    // The target word is shown and the learner types the English, so this is
    // the `target-en` direction — same matcher, same Flexible/Strict setting
    // as Table and Picture mode.
    inp.addEventListener('input', () => {
      if (!sessionActive || settled.has(word.word)) return;
      if (!matchesAnswer(inp.value, word, 'target-en', Settings.getMatchMode())) return;
      feedbackEl.textContent = '✓ Correct!';
      feedbackEl.className   = 'quiz-card-feedback ok';
      finish();
    });

    inp.addEventListener('keydown', (e: KeyboardEvent) => {
      if (!sessionActive || inp.value !== '') return;
      if (e.key === 'ArrowLeft')  { e.preventDefault(); goToPage(pageIndex - 1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); goToPage(pageIndex + 1); }
    });

    correctBtn.addEventListener('click', () => {
      if (!sessionActive || settled.has(word.word)) return;
      feedbackEl.textContent = '';
      finish();
    });

    revealBtn.addEventListener('click', () => {
      if (!sessionActive) return;
      const glosses = getGlosses(word);
      feedbackEl.textContent = `Answer: ${glosses.length > 0 ? glosses.join(' / ') : '—'}`;
      feedbackEl.className   = 'quiz-card-feedback bad';
    });

    // Paging back to an already-correct card rebuilds it from scratch, same
    // as every other card — what the learner actually typed lived on the old
    // input element and is gone, but showing the answer beats a blank,
    // disabled box that looks like the card forgot it was ever answered.
    if (mastered.has(word.word)) {
      const glosses = getGlosses(word);
      inp.value = glosses.length > 0 ? glosses.join(' / ') : word.translation ?? '';
      inp.disabled = true;
      correctBtn.disabled = true;
      feedbackEl.textContent = '✓ Correct!';
      feedbackEl.className   = 'quiz-card-feedback ok';
    }

    card.append(head, metaEl, inp, feedbackEl, actions);
    return card;
  }

  function buildFlashcard(word: Word): HTMLElement {
    const card = document.createElement('div');
    card.className = 'quiz-card';
    card.dataset.word = word.word;

    const head = document.createElement('div');
    head.className = 'quiz-card-head';
    const wordEl = document.createElement('div');
    wordEl.className = 'word';
    wordEl.textContent = word.word;
    const ttsBtn = document.createElement('button');
    ttsBtn.type = 'button';
    ttsBtn.className = 'quiz-card-tts';
    ttsBtn.setAttribute('aria-label', 'Listen to pronunciation');
    ttsBtn.textContent = '\u{1F50A}';
    ttsBtn.addEventListener('click', () => {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      void speak(word.word, getLangCode!());
    });
    head.append(wordEl, ttsBtn);

    const metaEl = document.createElement('div');
    metaEl.className = 'word-meta';
    metaEl.textContent = metaText(word);

    const flipBtn = document.createElement('button');
    flipBtn.type = 'button';
    flipBtn.className = 'quiz-card-flip-btn';
    flipBtn.textContent = 'Show Answer';

    const answerEl = document.createElement('div');
    answerEl.className = 'quiz-card-answer';
    answerEl.hidden = true;
    const glosses = getGlosses(word);
    answerEl.textContent = glosses.length > 0 ? glosses.join(' / ') : '—';

    const gradeRow = document.createElement('div');
    gradeRow.className = 'quiz-card-grade-row';
    gradeRow.hidden = true;
    const correctBtn = document.createElement('button');
    correctBtn.type = 'button';
    correctBtn.className = 'quiz-card-grade-btn quiz-card-grade-btn--correct';
    correctBtn.textContent = '✓ Correct';
    const incorrectBtn = document.createElement('button');
    incorrectBtn.type = 'button';
    incorrectBtn.className = 'quiz-card-grade-btn quiz-card-grade-btn--incorrect';
    incorrectBtn.textContent = '✗ Incorrect';
    gradeRow.append(correctBtn, incorrectBtn);

    flipBtn.addEventListener('click', () => {
      if (!sessionActive) return;
      flipBtn.hidden   = true;
      answerEl.hidden  = false;
      gradeRow.hidden  = false;
    });

    function grade(correct: boolean): void {
      if (!sessionActive || settled.has(word.word)) return;
      correctBtn.disabled   = true;
      incorrectBtn.disabled = true;
      card.classList.add(correct ? 'correct' : 'incorrect');
      settleWord(word, correct);
    }
    correctBtn.addEventListener('click', () => grade(true));
    incorrectBtn.addEventListener('click', () => grade(false));

    // Paging back to an already-graded card rebuilds it from scratch, same as
    // every other card — restore the flipped, graded state rather than
    // showing the front again as if it had never been answered.
    if (settled.has(word.word)) {
      flipBtn.hidden = true;
      answerEl.hidden = false;
      gradeRow.hidden = false;
      correctBtn.disabled   = true;
      incorrectBtn.disabled = true;
    }

    card.append(head, metaEl, flipBtn, answerEl, gradeRow);
    return card;
  }

  // ── Page rendering ───────────────────────────────────────────────────────────

  function renderPage(): void {
    quizWrap.innerHTML = '';
    quizWrap.classList.toggle('quiz-cards-grid--multi', cardsPerScreen > 1);
    ['quizSummaryTop', 'quizSummaryBottom'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.style.display = 'none'; el.innerHTML = ''; }
    });

    for (const word of pageWords()) {
      const card = cardStyle === 'flashcard' ? buildFlashcard(word) : buildTypeCard(word);
      if (mastered.has(word.word)) card.classList.add('correct');
      else if (settled.has(word.word)) card.classList.add('incorrect');
      quizWrap.appendChild(card);
    }

    updateNav();
    updateStats();
    quizWrap.querySelector<HTMLInputElement>('.quiz-card-input:not(:disabled)')?.focus();
  }

  function goToPage(index: number): void {
    if (deck.length === 0) return;
    pageIndex = Math.min(Math.max(0, index), pageCount() - 1);
    renderPage();
  }

  // ── Session lifecycle ───────────────────────────────────────────────────────

  function endSession(): void {
    sessionActive = false;
    prevBtn.disabled = true;
    nextBtn.disabled = true;

    const total  = deck.length;
    const done   = mastered.size;

    // Feed the shared history and miss tally, like every other mode. Guarded
    // because endSession also runs when the user hits Play Again.
    getStopwatch().stop();
    if (!sessionSaved && total > 0) {
      sessionSaved = true;
      // The language selector is the source of truth here; this module is
      // handed words rather than a language.
      const lang = (document.getElementById('langSelect') as HTMLSelectElement | null)?.value
                ?? 'spanish';
      const correctWords = deck.filter(w => mastered.has(w.word)).map(w => w.word);
      const missedWords  = deck.filter(w => !mastered.has(w.word)).map(w => w.word);
      recordOutcome(lang, missedWords, correctWords);
      saveSession(lang, {
        at: new Date().toISOString(),
        mode: 'single',
        total,
        correct: done,
        unassisted: done,   // single-word mode has no per-word hint concept
        hints: 0,
        revealed: 0,
        seconds: getStopwatch().elapsedSeconds(),
        lang,
      });
    }
    const missed = total - done;
    const pct    = total ? Math.round((done / total) * 100) : 0;

    quizWrap.innerHTML = '';
    const endMsg = document.createElement('div');
    endMsg.className = 'word';
    endMsg.textContent = done === total ? 'All mastered! 🎉' : 'Session ended';
    quizWrap.appendChild(endMsg);
    counterEl.textContent = '';

    const summaryHTML =
      `<span class="summary-correct">✓ ${done} mastered</span>` +
      (missed > 0 ? `<span class="summary-missed">✗ ${missed} not yet mastered</span>` : '') +
      `<span class="summary-pct">${pct}%</span>`;
    ['quizSummaryTop', 'quizSummaryBottom'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.style.display = 'flex'; el.innerHTML = summaryHTML; }
    });

    barEl.style.width = pct + '%';
    const summary = `${done} / ${total} mastered (${pct}%)`;
    statsEl.textContent = summary;
    if (statsTopEl) statsTopEl.textContent = summary;

    // List of unmastered words shown under the summary
    const unmastered = deck.filter(w => !mastered.has(w.word));
    if (unmastered.length > 0) {
      const feedbackEl = document.createElement('div');
      feedbackEl.className = 'quiz-card-feedback';
      const label = document.createElement('span');
      label.className   = 'recall-missed-label';
      label.textContent = 'Not yet mastered: ';
      feedbackEl.appendChild(label);
      unmastered.forEach((w, i) => {
        const chip = document.createElement('span');
        chip.className   = 'recall-missed-chip';
        chip.textContent = w.word;
        feedbackEl.appendChild(chip);
        if (i < unmastered.length - 1) feedbackEl.appendChild(document.createTextNode(' '));
      });
      quizWrap.appendChild(feedbackEl);
    }

    endBtn.textContent = 'Play Again';
    endBtn.disabled    = false;
  }

  function startSession(words: Word[]): void {
    // Not reshuffled — start-handler.ts already put `words` in whatever order
    // the Order setting picked (frequency, rarest, A-Z, trouble, or an actual
    // shuffle). Reshuffling here used to silently override every option but
    // Shuffle itself, which is why this always looked the same regardless.
    deck           = [...words];
    mastered       = new Set();
    settled        = new Set();
    cardsPerScreen = Settings.getSingleCardsPerScreen();
    cardStyle      = Settings.getSingleCardStyle();
    getStopwatch().start();
    sessionSaved   = false;
    pageIndex      = 0;
    sessionActive  = true;
    endBtn.textContent = 'End Quiz';
    endBtn.disabled    = false;
    renderPage();
  }

  // ── Buttons: Prev / Next page ───────────────────────────────────────────────

  prevBtn.addEventListener('click', () => goToPage(pageIndex - 1));
  nextBtn.addEventListener('click', () => goToPage(pageIndex + 1));

  // ── Button: End Quiz / Play Again ───────────────────────────────────────────

  endBtn.addEventListener('click', () => {
    if (sessionActive) {
      endSession();
    } else if (deck.length > 0) {
      startSession(deck);   // Play Again with same words
    }
  });

  // ── Entry point (called by start-handler when single mode starts) ────────────

  function showCurrent(): void {
    if (quizInstance && quizInstance.words.length > 0) {
      startSession(quizInstance.words);
    }
  }

  return { showCurrent };
}
