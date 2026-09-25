/**
 * resume-banner.ts — "you have an unfinished quiz" on launch.
 *
 * The saved quiz itself lives in utils/quiz-resume.ts and is written by
 * table-controls.ts; this is only the prompt that offers it back. It reuses the
 * update toast's look (.pwa-update-toast) rather than adding a second banner
 * style for the same job.
 */

import { loadResume, clearResume, answeredCount, resolveWords } from '../utils/quiz-resume.ts';
import { loadWords } from '../data/data-loader.ts';
import { resumeTableQuiz } from '../modes/table-controls.ts';
import { showToast } from './toast.ts';
import { logger } from '../utils/logger.ts';
import type { Word } from '../types.ts';

/** Bring the saved quiz back to life. Returns false if it could not be rebuilt. */
async function resume(): Promise<boolean> {
  const saved = loadResume();
  if (!saved) return false;

  // Every language the quiz touched — a Compare-mode quiz mixes several.
  const langs = new Set<string>([saved.lang, ...saved.words.map(w => w.language).filter((l): l is string => !!l)]);
  const vocab = new Map<string, Word[]>();
  for (const lang of langs) vocab.set(lang, await loadWords(lang));

  const { words, missing } = resolveWords(saved.words, vocab, saved.lang);
  if (words.length === 0) { clearResume(); return false; }

  // The quiz renders into the Standard-style table; make sure that's what's
  // showing, and that we're on the Table tab.
  document.querySelector<HTMLElement>('.mode-tab[data-mode="table"]')?.click();
  document.querySelector<HTMLElement>('#tableStyleToggle [data-style="standard"]')?.click();

  resumeTableQuiz(words, saved);
  if (missing > 0) {
    showToast(`${missing} word${missing === 1 ? ' is' : 's are'} no longer in the vocabulary and was skipped.`, 'warning', 6000);
  }
  return true;
}

/** Call once at startup, after the app has finished building its UI. */
export function offerResume(): void {
  const saved = loadResume();
  if (!saved) return;
  const answered = answeredCount(saved);
  if (answered === 0) { clearResume(); return; }

  const bar = document.createElement('div');
  bar.className = 'pwa-update-toast resume-banner';
  bar.setAttribute('role', 'status');

  const msg = document.createElement('span');
  msg.textContent = `Unfinished quiz — ${answered} of ${saved.words.length} answered.`;

  const go = document.createElement('button');
  go.type = 'button';
  go.className = 'pwa-update-btn';
  go.textContent = 'Resume';
  go.addEventListener('click', () => {
    go.disabled = true;
    resume()
      .then(ok => { if (!ok) showToast('That quiz could not be restored.', 'error', 4000); })
      .catch(err => { logger.warn('resume failed', err); showToast('That quiz could not be restored.', 'error', 4000); })
      .finally(() => bar.remove());
  });

  const discard = document.createElement('button');
  discard.type = 'button';
  discard.className = 'pwa-update-dismiss';
  discard.title = 'Discard it';
  discard.setAttribute('aria-label', 'Discard the unfinished quiz');
  discard.textContent = '×';
  discard.addEventListener('click', () => { clearResume(); bar.remove(); });

  bar.append(msg, go, discard);
  document.body.appendChild(bar);
}
