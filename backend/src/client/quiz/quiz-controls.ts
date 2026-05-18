import type { Word } from '../types.js';
import { speak }                              from '../utils/tts.js';
import { isCorrect, getPosLabel, getGlosses } from '../utils/utils.js';
import type { Quiz } from './quiz.js';

let quiz:        Quiz | null = null;
let getLangCode: (() => string) | null = null;

export function setQuiz(instance: Quiz): void {
  quiz = instance;
}

export function bindQuizControls({ getLang }: { getLang: () => string }): { showCurrent: () => void } {
  getLangCode = getLang;

  const wordEl     = document.getElementById('word')!;
  const posEl      = document.getElementById('pos');
  const hintEl     = document.getElementById('hint');
  const answerEl   = document.getElementById('answer')     as HTMLInputElement;
  const feedbackEl = document.getElementById('feedback')!;
  const barEl      = document.getElementById('bar')!;
  const statsEl    = document.getElementById('stats')!;
  const statsTopEl = document.getElementById('statsTop');
  const ttsBtn     = document.getElementById('ttsBtn')!;
  const btnCorrect = document.getElementById('btnCorrect')!;
  const btnSkip    = document.getElementById('btnSkip')!;
  const giveUpBtn  = document.getElementById('quizGiveUp');
  const exportBtn  = document.getElementById('exportBtn')!;
  const resetBtn   = document.getElementById('resetBtn')!;

  function showCurrent(): void {
    if (!quiz) return;
    const cur = quiz.current();
    wordEl.textContent = cur.word;
    if (posEl)  posEl.textContent  = getPosLabel(cur);
    if (hintEl) hintEl.textContent = cur.display ?? '';
    answerEl.value         = '';
    feedbackEl.textContent = '';
    updateStats();
    answerEl.focus();
  }

  function updateStats(): void {
    if (!quiz) return;
    const s             = quiz.stats();
    const uniqueCorrect = quiz.uniqueCorrectCount();
    const pct           = s.total ? Math.round((uniqueCorrect / s.total) * 100) : 0;
    (barEl as HTMLElement).style.width = pct + '%';
    const statsText = `Seen ${s.seen}/${s.total} • Correct ${s.correct} • Incorrect ${s.incorrect}`;
    statsEl.textContent = statsText;
    if (statsTopEl) statsTopEl.textContent = statsText;
    if (giveUpBtn) (giveUpBtn as HTMLButtonElement).disabled = (s.total > 0 && uniqueCorrect === s.total);
  }

  answerEl.addEventListener('input', () => {
    if (!quiz) return;
    const entry = quiz.current();
    if (!isCorrect(answerEl.value, entry)) return;
    feedbackEl.textContent = 'Correct ✓';
    (feedbackEl as HTMLElement).style.color = 'green';
    const key = entry.word;
    if (!quiz.state.seen[key]) quiz.state.seen[key] = { correct: 0, incorrect: 0 };
    quiz.state.seen[key].correct++;
    quiz.markCorrect();
    quiz.save();
    setTimeout(() => { quiz!.next(); showCurrent(); }, 450);
  });

  btnCorrect.addEventListener('click', () => { if (!quiz) return; quiz.markCorrect(); quiz.next(); showCurrent(); });
  btnSkip.addEventListener('click',    () => { if (!quiz) return; quiz.next(); showCurrent(); });

  giveUpBtn?.addEventListener('click', () => {
    if (!quiz) return;
    const entry   = quiz.current();
    const glosses = getGlosses(entry);
    feedbackEl.textContent = `Answer: ${glosses.join(' / ')}`;
    (feedbackEl as HTMLElement).style.color = 'var(--danger)';
    const key = entry.word;
    if (!quiz.state.seen[key]) quiz.state.seen[key] = { correct: 0, incorrect: 0 };
    quiz.state.seen[key].incorrect++;
    quiz.save();
    updateStats();
    setTimeout(() => { quiz!.next(); showCurrent(); }, 900);
  });

  ttsBtn.addEventListener('click', () => { if (!quiz) return; speak(quiz.current().word, getLangCode!()); });

  exportBtn.addEventListener('click', () => {
    if (!quiz) return;
    const blob = new Blob([JSON.stringify(quiz.export(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'quiz_progress.json'; a.click();
  });

  resetBtn.addEventListener('click', () => {
    if (!quiz) return;
    if (confirm('Reset progress for this list?')) { quiz.reset(); showCurrent(); }
  });

  return { showCurrent };
}
