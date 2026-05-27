import type { Word } from '../types.js';
import { speak }     from '../utils/tts.js';
import { isCorrect, getPosLabel, getGlosses } from '../utils/utils.js';
import type { Quiz } from './quiz.js';

// ── Module state ───────────────────────────────────────────────────────────────

let quizInstance: Quiz | null       = null;
let getLangCode:  (() => string) | null = null;

// Session state — rebuilt each time the user hits Start Quiz in single mode
let deck:         Word[]      = [];   // shuffled word list for this session
let mastered:     Set<string> = new Set();
let currentIndex  = 0;
let sessionActive = false;

export function setQuiz(instance: Quiz): void {
  quizInstance = instance;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fisherYates<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Public API ─────────────────────────────────────────────────────────────────

export function bindQuizControls({ getLang }: { getLang: () => string }): { showCurrent: () => void } {
  getLangCode = getLang;

  // DOM refs
  const wordEl      = document.getElementById('word')!        as HTMLElement;
  const answerEl    = document.getElementById('answer')!      as HTMLInputElement;
  const feedbackEl  = document.getElementById('feedback')!    as HTMLElement;
  const barEl       = document.getElementById('bar')!         as HTMLElement;
  const statsEl     = document.getElementById('stats')!       as HTMLElement;
  const statsTopEl  = document.getElementById('statsTop')     as HTMLElement | null;
  const ttsBtn      = document.getElementById('ttsBtn')!      as HTMLButtonElement;
  const btnCorrect  = document.getElementById('btnCorrect')!  as HTMLButtonElement;
  const revealBtn   = document.getElementById('quizGiveUp')   as HTMLButtonElement | null;
  const endBtn      = document.getElementById('resetBtn')!    as HTMLButtonElement;
  const prevBtn     = document.getElementById('quizPrev')!    as HTMLButtonElement;
  const nextBtn     = document.getElementById('quizNext')!    as HTMLButtonElement;
  const counterEl   = document.getElementById('quizCounter')! as HTMLElement;

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

  function updateCounter(): void {
    if (deck.length === 0) { counterEl.textContent = ''; return; }
    const word      = deck[currentIndex];
    const isMastered = mastered.has(word.word);
    counterEl.textContent = `${currentIndex + 1} / ${deck.length}${isMastered ? ' ✓' : ''}`;
    counterEl.style.color = isMastered ? 'var(--correct, green)' : '';
  }

  // ── Word display ────────────────────────────────────────────────────────────

  function showCurrentWord(): void {
    if (deck.length === 0) return;
    const word = deck[currentIndex];
    wordEl.textContent     = word.word;
    answerEl.value         = '';
    answerEl.disabled      = false;
    feedbackEl.textContent = '';
    feedbackEl.className   = 'feedback';
    ['quizSummaryTop', 'quizSummaryBottom'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.style.display = 'none'; el.innerHTML = ''; }
    });
    updateCounter();
    updateStats();
    answerEl.focus();
  }

  // ── Navigation ──────────────────────────────────────────────────────────────

  function goTo(index: number): void {
    currentIndex = (index + deck.length) % deck.length;
    showCurrentWord();
  }

  // ── Session lifecycle ───────────────────────────────────────────────────────

  function setControlsDisabled(disabled: boolean): void {
    answerEl.disabled  = disabled;
    btnCorrect.disabled = disabled;
    if (revealBtn) revealBtn.disabled = disabled;
    prevBtn.disabled   = disabled;
    nextBtn.disabled   = disabled;
  }

  function endSession(): void {
    sessionActive = false;
    setControlsDisabled(true);

    const total  = deck.length;
    const done   = mastered.size;
    const missed = total - done;
    const pct    = total ? Math.round((done / total) * 100) : 0;

    wordEl.textContent     = done === total ? 'All mastered! 🎉' : 'Session ended';
    answerEl.value         = '';
    counterEl.textContent  = '';

    feedbackEl.textContent = '';
    feedbackEl.className   = 'feedback';

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

    endBtn.textContent = 'Play Again';
    endBtn.disabled    = false;
  }

  function startSession(words: Word[]): void {
    deck          = fisherYates([...words]);
    mastered      = new Set();
    currentIndex  = 0;
    sessionActive = true;
    endBtn.textContent = 'End Quiz';
    endBtn.disabled    = false;
    setControlsDisabled(false);
    showCurrentWord();
  }

  // ── Input: auto-check on each keystroke ────────────────────────────────────

  answerEl.addEventListener('input', () => {
    if (!sessionActive || deck.length === 0) return;
    const word = deck[currentIndex];
    if (!isCorrect(answerEl.value, word)) return;

    mastered.add(word.word);
    feedbackEl.textContent = '✓ Correct!';
    feedbackEl.className   = 'feedback ok';
    answerEl.disabled      = true;
    updateCounter();
    updateStats();

    // Auto-advance to next word after a short pause
    setTimeout(() => {
      if (!sessionActive) return;
      if (mastered.size === deck.length) { endSession(); return; }
      goTo(currentIndex + 1);
    }, 500);
  });

  // ── Button: Mark Correct ────────────────────────────────────────────────────

  btnCorrect.addEventListener('click', () => {
    if (!sessionActive || deck.length === 0) return;
    const word = deck[currentIndex];
    mastered.add(word.word);
    updateCounter();
    updateStats();
    if (mastered.size === deck.length) { endSession(); return; }
    goTo(currentIndex + 1);
  });

  // ── Button: Reveal Answer ───────────────────────────────────────────────────

  revealBtn?.addEventListener('click', () => {
    if (!sessionActive || deck.length === 0) return;
    const word    = deck[currentIndex];
    const glosses = getGlosses(word);
    const answer  = glosses.length > 0 ? glosses.join(' / ') : '—';
    feedbackEl.textContent = `Answer: ${answer}`;
    feedbackEl.className   = 'feedback bad';
  });

  // ── Buttons: Prev / Next ────────────────────────────────────────────────────

  prevBtn.addEventListener('click', () => {
    if (deck.length === 0) return;
    goTo(currentIndex - 1);
  });

  nextBtn.addEventListener('click', () => {
    if (deck.length === 0) return;
    goTo(currentIndex + 1);
  });

  // Keyboard: left/right arrow keys for navigation when input is empty
  answerEl.addEventListener('keydown', (e: KeyboardEvent) => {
    if (!sessionActive || deck.length === 0) return;
    if (e.key === 'ArrowLeft' && answerEl.value === '') {
      e.preventDefault();
      goTo(currentIndex - 1);
    } else if (e.key === 'ArrowRight' && answerEl.value === '') {
      e.preventDefault();
      goTo(currentIndex + 1);
    }
  });

  // ── Button: End Quiz / Play Again ───────────────────────────────────────────

  endBtn.addEventListener('click', () => {
    if (sessionActive) {
      endSession();
    } else if (deck.length > 0) {
      startSession(deck);   // Play Again with same words
    }
  });

  // ── Button: TTS ─────────────────────────────────────────────────────────────

  ttsBtn.addEventListener('click', () => {
    if (deck.length === 0) return;
    speak(deck[currentIndex].word, getLangCode!());
  });

  // ── Entry point (called by start-handler when single mode starts) ────────────

  function showCurrent(): void {
    if (quizInstance && quizInstance.words.length > 0) {
      startSession(quizInstance.words);
    }
  }

  return { showCurrent };
}
