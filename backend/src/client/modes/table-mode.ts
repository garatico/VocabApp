import type { Word } from '../types.js';
import { isCorrect, isReverseCorrect, getGlosses, buildGlossDisplay } from '../utils/utils.ts';
import { attachTooltips }        from '../utils/word-tooltip.ts';

export type TableDirection = 'target-en' | 'en-target' | 'mixed';

export interface CheckResult {
  word?:     string;
  ok:        boolean;
  expected?: string;
}

export interface TableController {
  checkAll:        () => CheckResult[];
  giveUp:          () => CheckResult[];
  buildTable:      () => void;
  words:           Word[];
  checkAllComplete: () => boolean;
}

interface RenderTableModeOptions {
  words:       Word[];
  container:   HTMLElement;
  columns?:    number;
  direction?:  TableDirection;
  onComplete?: (() => void) | null;
}

export function renderTableMode({
  words,
  container,
  columns   = 3,
  direction = 'target-en',
  onComplete = null,
}: RenderTableModeOptions): TableController {
  if (!(container instanceof HTMLElement)) {
    throw new Error('renderTableMode: container element required');
  }

  const cols = Math.max(1, Math.min(5, Number(columns) || 3));

  /** Resolve the direction for a single entry (handles 'mixed' by picking randomly). */
  function entryDir(_entry: Word): 'target-en' | 'en-target' {
    if (direction === 'mixed') return Math.random() < 0.5 ? 'target-en' : 'en-target';
    return direction;
  }

  /** The text shown in the label cell (what the user is prompted with). */
  function labelText(entry: Word, dir: 'target-en' | 'en-target'): string {
    return dir === 'en-target' ? buildGlossDisplay(entry) : entry.word;
  }

  /** The text revealed when the user answers correctly or gives up. */
  function revealText(entry: Word, dir: 'target-en' | 'en-target'): string {
    return dir === 'en-target' ? entry.word : buildGlossDisplay(entry);
  }

  /** Check whether the user's input is correct for a given direction. */
  function checkInput(input: string, entry: Word, dir: 'target-en' | 'en-target'): boolean {
    return dir === 'en-target'
      ? isReverseCorrect(input, entry)
      : isCorrect(input, entry);
  }

  function checkAllComplete(): boolean {
    const allInputs = Array.from(container.querySelectorAll<HTMLInputElement>('input[data-word]'));
    return allInputs.length > 0 && allInputs.every(inp => inp.disabled);
  }

  function updateProgress(): void {
    const allInputs = Array.from(container.querySelectorAll<HTMLInputElement>('input[data-word]'));
    const correct   = allInputs.filter(inp => inp.disabled).length;
    const total     = allInputs.length;
    const pct       = total > 0 ? Math.round((correct / total) * 100) : 0;
    const statsText = `${correct}/${total} answered`;

    const barTop      = document.getElementById('tableBarTop');
    const barBottom   = document.getElementById('tableBarBottom');
    const statsTop    = document.getElementById('tableStatsTop');
    const statsBottom = document.getElementById('tableStatsBottom');

    if (barTop)     barTop.style.width      = pct + '%';
    if (barBottom)  barBottom.style.width   = pct + '%';
    if (statsTop)   statsTop.textContent    = statsText;
    if (statsBottom) statsBottom.textContent = statsText;

    const giveUpBtn = document.getElementById('tableReset') as HTMLButtonElement | null;
    if (giveUpBtn) giveUpBtn.disabled = (pct === 100);
  }

  function buildTable(): void {
    container.innerHTML = '';
    const table       = document.createElement('table');
    const pairsPerRow = cols;

    for (let i = 0; i < words.length; i += pairsPerRow) {
      const tr = document.createElement('tr');

      for (let j = 0; j < pairsPerRow; j++) {
        const w       = words[i + j];
        const tdWord  = document.createElement('td');
        const tdInput = document.createElement('td');
        tdWord.classList.add('word-cell');
        tdInput.classList.add('input-cell');

        if (!w) {
          tr.appendChild(tdWord);
          tr.appendChild(tdInput);
          continue;
        }

        const dir = entryDir(w);

        const wordDiv = document.createElement('div');
        wordDiv.textContent = labelText(w, dir);
        wordDiv.classList.add('spanish-word');
        wordDiv.dataset.wordJson = JSON.stringify(w);
        tdWord.appendChild(wordDiv);

        const inp        = document.createElement('input');
        inp.type         = 'text';
        inp.dataset.word = w.word;
        inp.dataset.dir  = dir;
        inp.placeholder  = dir === 'en-target' ? 'Type in target language…' : 'Type translation…';

        inp.addEventListener('input', () => {
          if (checkInput(inp.value, w, dir)) {
            inp.value    = revealText(w, dir);
            inp.disabled = true;
            inp.classList.add('correct');

            const allInputs  = Array.from(container.querySelectorAll<HTMLInputElement>('input[data-word]'));
            const currentIdx = allInputs.indexOf(inp);
            const next       = allInputs.slice(currentIdx + 1).find(i => !i.disabled);
            if (next) next.focus();

            updateProgress();

            if (checkAllComplete() && onComplete) {
              const cb = onComplete;
              setTimeout(() => cb(), 300);
            }
          } else {
            inp.classList.remove('correct');
          }
        });

        tdInput.appendChild(inp);
        tr.appendChild(tdWord);
        tr.appendChild(tdInput);
      }

      table.appendChild(tr);
    }

    container.appendChild(table);
    attachTooltips(container);
    updateProgress();
  }

  function checkAll(): CheckResult[] {
    const results: CheckResult[] = [];
    container.querySelectorAll<HTMLInputElement>('input[data-word]').forEach(inp => {
      const entry = words.find(w => w.word === inp.dataset.word);
      if (!entry) return;
      const dir = (inp.dataset.dir ?? 'target-en') as 'target-en' | 'en-target';
      const ok  = checkInput(inp.value, entry, dir);
      inp.classList.remove('correct', 'incorrect');
      if (ok) {
        inp.value    = revealText(entry, dir);
        inp.disabled = true;
        inp.classList.add('correct');
      } else {
        inp.classList.add('incorrect');
      }
      results.push({ word: inp.dataset.word, ok, expected: revealText(entry, dir) });
    });
    return results;
  }

  function giveUp(): CheckResult[] {
    const results: CheckResult[] = [];
    container.querySelectorAll<HTMLInputElement>('input[data-word]').forEach(inp => {
      if (inp.classList.contains('correct')) { results.push({ ok: true }); return; }
      const entry = words.find(w => w.word === inp.dataset.word);
      if (!entry) return;
      const dir = (inp.dataset.dir ?? 'target-en') as 'target-en' | 'en-target';
      inp.value    = revealText(entry, dir);
      inp.disabled = true;
      inp.classList.remove('correct');
      inp.classList.add('incorrect');
      results.push({ ok: false });
    });
    updateProgress();
    return results;
  }

  buildTable();
  return { checkAll, giveUp, buildTable, words, checkAllComplete };
}
