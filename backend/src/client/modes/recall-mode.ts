import { isCorrect }     from '../utils/utils.ts';
import { attachTooltips } from '../utils/word-tooltip.ts';
import type { Word }     from '../types.ts';
import { isInAnyList, getWordLists } from '../utils/word-lists.ts';
import { openListPicker }            from '../utils/list-picker.ts';

const LANG_LABELS: Record<string, string> = {
  spanish: 'Spanish', portuguese: 'Portuguese', italian: 'Italian', french: 'French',
};

interface RenderRecallModeOptions {
  words:     Word[];
  container: HTMLElement;
  columns?:  number;
  lang?:     string;
}

export interface RecallController {
  startTimer: (seconds: number, isHardStop: boolean) => void;
}

export function renderRecallMode({
  words,
  container,
  columns = 1,
  lang = 'spanish',
}: RenderRecallModeOptions): RecallController {
  container.innerHTML = '';

  // Clear any stale outer summary cards from a previous session
  ['recallSummaryTop', 'recallSummaryBottom'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.style.display = 'none'; el.innerHTML = ''; }
  });

  const cols = Math.max(1, Math.min(3, Number(columns) || 1));

  const recalled      = new Set<string>();
  let timerInterval: ReturnType<typeof setInterval> | null = null;
  let secondsLeft   = 0;
  let hardStop      = false;
  let finished      = false;

  const sorted = [...words].sort((a, b) => (a.rank || 9999) - (b.rank || 9999));

  const wrap = document.createElement('div');
  wrap.className = 'recall-wrap';

  const timerRow = document.createElement('div');
  timerRow.className = 'recall-timer-row';

  const timerDisplay = document.createElement('span');
  timerDisplay.className = 'recall-timer';

  const giveUpBtn = document.createElement('button');
  giveUpBtn.textContent = 'Give Up';
  giveUpBtn.className   = 'recall-giveup-btn';

  const sliderWrap = document.createElement('div');
  sliderWrap.className = 'recall-size-wrap';

  const iconSm = document.createElement('span');
  iconSm.className   = 'recall-size-icon';
  iconSm.textContent = 'A';

  const sizeSlider = document.createElement('input');
  sizeSlider.type      = 'range';
  sizeSlider.min       = '0';
  sizeSlider.max       = '3';
  sizeSlider.step      = '1';
  sizeSlider.value     = '0';
  sizeSlider.className = 'recall-size-slider';
  sizeSlider.setAttribute('aria-label', 'Text size');

  function applyScale(v: number): void {
    const scale = 1.15 + (v / 3) * 0.5;
    wrap.style.setProperty('--rs', scale.toFixed(3));
  }
  sizeSlider.addEventListener('input', () => applyScale(Number(sizeSlider.value)));
  applyScale(0);

  const iconLg = document.createElement('span');
  iconLg.className   = 'recall-size-icon lg';
  iconLg.textContent = 'A';

  sliderWrap.append(iconSm, sizeSlider, iconLg);
  timerRow.append(timerDisplay, sliderWrap, giveUpBtn);

  const inputRow = document.createElement('div');
  inputRow.className = 'recall-input-row';

  const inp = document.createElement('input');
  inp.type         = 'text';
  inp.placeholder  = 'Type a ' + (LANG_LABELS[lang] || 'word') + '…';
  inp.className    = 'recall-input';
  inp.autocomplete = 'off';

  const feedback = document.createElement('span');
  feedback.className = 'recall-feedback';

  inputRow.appendChild(inp);
  inputRow.appendChild(feedback);

  const scoreEl = document.createElement('div');
  scoreEl.className = 'recall-score';
  updateScore();

  const gridWrap = document.createElement('div');
  gridWrap.className = 'recall-grid-wrap';
  gridWrap.style.gridTemplateColumns = 'repeat(' + cols + ', 1fr)';

  // Chunked distribution: table 0 gets words 0…chunkSize-1,
  // table 1 gets words chunkSize…2*chunkSize-1, etc.
  // Each table reads top-to-bottom in order, so stacking on mobile is seamless.
  const chunkSize = Math.ceil(sorted.length / cols);

  for (let ci = 0; ci < cols; ci++) {
    const table = document.createElement('table');
    table.className = 'recall-table';

    for (let row = 0; row < chunkSize; row++) {
      const idx = ci * chunkSize + row;
      if (idx >= sorted.length) break;

      const w = sorted[idx];
      const tr = document.createElement('tr');

      const tdNum = document.createElement('td');
      tdNum.className   = 'recall-rank';
      tdNum.textContent = (w.rank || idx + 1) + '.';

      const tdWord = document.createElement('td');
      tdWord.className        = 'recall-cell';
      tdWord.dataset.word     = w.word;
      tdWord.dataset.wordJson = JSON.stringify(w);
      tdWord.textContent      = '';

      if (isInAnyList(lang, w.word)) {
        tdWord.classList.add('recall-cell--known');
      }

      tr.appendChild(tdNum);
      tr.appendChild(tdWord);
      table.appendChild(tr);
    }

    gridWrap.appendChild(table);
  }

  attachTooltips(gridWrap, { hideWordWhenUnrevealed: true });

  wrap.appendChild(timerRow);
  wrap.appendChild(inputRow);
  wrap.appendChild(scoreEl);
  wrap.appendChild(gridWrap);
  container.appendChild(wrap);

  inp.focus();
  updateProgress();

  inp.addEventListener('input', () => {
    const val = inp.value.trim();
    if (!val) return;

    const match = sorted.find(w =>
      w.word.toLowerCase() === val.toLowerCase() && !recalled.has(w.word)
    );

    if (match) {
      recalled.add(match.word);
      revealCell(match.word, 'recalled');
      updateScore();

      feedback.textContent = '✓ ' + match.word;
      feedback.className   = 'recall-feedback ok';
      inp.value = '';

      setTimeout(() => {
        feedback.textContent = '';
        feedback.className   = 'recall-feedback';
      }, 800);
      if (recalled.size === sorted.length) endSession();
    }
  });

  giveUpBtn.addEventListener('click', endSession);

  function revealCell(word: string, state: 'recalled' | 'missed'): void {
    const cell = gridWrap.querySelector<HTMLTableCellElement>(
      'td.recall-cell[data-word="' + CSS.escape(word) + '"]'
    );
    if (!cell) return;

    cell.textContent = word;
    cell.classList.remove('recalled', 'missed', 'recall-cell--known');
    cell.classList.add(state);

    if (state === 'recalled') {
      const btn       = document.createElement('button');
      btn.type        = 'button';
      btn.className   = 'recall-known-btn' + (isInAnyList(lang, word) ? ' known-btn--active' : '');
      btn.title       = isInAnyList(lang, word)
        ? 'In lists: ' + getWordLists(lang, word).join(', ')
        : 'Add to a list';
      btn.textContent = '★';

      btn.addEventListener('click', e => {
        e.stopPropagation();
        openListPicker({
          anchorEl: btn,
          lang,
          word,
          onClose: () => {
            const inAny = isInAnyList(lang, word);
            btn.classList.toggle('known-btn--active', inAny);
            btn.title = inAny
              ? 'In lists: ' + getWordLists(lang, word).join(', ')
              : 'Add to a list';
          },
        });
      });

      cell.appendChild(btn);
    }
  }

  function updateScore(): void {
    scoreEl.textContent = 'Recalled: ' + recalled.size + ' / ' + sorted.length;
    updateProgress();
  }

  function updateProgress(): void {
    const pct = sorted.length > 0 ? Math.round((recalled.size / sorted.length) * 100) : 0;

    const barTop      = document.getElementById('recallBarTop');
    const barBottom   = document.getElementById('recallBarBottom');
    const statsTop    = document.getElementById('recallStatsTop');
    const statsBottom = document.getElementById('recallStatsBottom');

    const statsText = recalled.size + '/' + sorted.length + ' recalled';

    if (barTop)      (barTop    as HTMLElement).style.width = pct + '%';
    if (barBottom)   (barBottom as HTMLElement).style.width = pct + '%';
    if (statsTop)    statsTop.textContent    = statsText;
    if (statsBottom) statsBottom.textContent = statsText;

    if (sorted.length > 0 && recalled.size === sorted.length) {
      giveUpBtn.disabled = true;
    }
  }

  function endSession(): void {
    if (finished) return;
    finished = true;
    if (timerInterval) clearInterval(timerInterval);
    inp.disabled       = true;
    giveUpBtn.disabled = true;

    sorted.forEach(w => {
      if (!recalled.has(w.word)) revealCell(w.word, 'missed');
    });

    const missed = sorted.length - recalled.size;
    const pct    = Math.round((recalled.size / sorted.length) * 100);

    const summaryHTML =
      '<span class="summary-correct">✓ ' + recalled.size + ' recalled</span>' +
      '<span class="summary-missed">✗ ' + missed + ' missed</span>' +
      '<span class="summary-pct">' + pct + '%</span>';

    // Clear the live score — results are shown in the outer summary cards below
    scoreEl.textContent = '';

    // Top and bottom outer summary cards
    ['recallSummaryTop', 'recallSummaryBottom'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.style.display = 'flex'; el.innerHTML = summaryHTML; }
    });
  }

  function startTimer(seconds: number, isHardStop: boolean): void {
    secondsLeft = seconds;
    hardStop    = isHardStop;
    updateTimerDisplay();

    timerInterval = setInterval(() => {
      secondsLeft--;
      updateTimerDisplay();

      if (secondsLeft <= 0) {
        clearInterval(timerInterval!);
        if (hardStop) {
          endSession();
        } else {
          timerDisplay.textContent = "Time's up!";
          timerDisplay.style.color = 'var(--danger)';
        }
      }
    }, 1000);
  }

  function updateTimerDisplay(): void {
    const m = Math.floor(secondsLeft / 60);
    const s = secondsLeft % 60;
    timerDisplay.textContent = m + ':' + s.toString().padStart(2, '0');
    timerDisplay.style.color = secondsLeft <= 30 ? 'var(--danger)' : 'var(--text-muted)';
  }

  return { startTimer };
}
