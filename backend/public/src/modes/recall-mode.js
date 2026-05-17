import { isCorrect }     from '../utils/utils.ts';
import { attachTooltips } from '../utils/word-tooltip.ts';

const LANG_LABELS = {
  spanish: 'Spanish', portuguese: 'Portuguese', italian: 'Italian', french: 'French',
};

export function renderRecallMode({ words, container, columns = 1, lang = 'spanish' }) {
  container.innerHTML = '';

  const cols = Math.max(1, Math.min(3, Number(columns) || 1));

  let recalled      = new Set();
  let timerInterval = null;
  let secondsLeft   = 0;
  let hardStop      = false;
  let finished      = false;

  const sorted = [...words].sort((a, b) => (a.rank || 9999) - (b.rank || 9999));

  // ── Layout ────────────────────────────────────────────
  const wrap = document.createElement('div');
  wrap.className = 'recall-wrap';

  const timerRow = document.createElement('div');
  timerRow.className = 'recall-timer-row';

  const timerDisplay = document.createElement('span');
  timerDisplay.className = 'recall-timer';

  const giveUpBtn = document.createElement('button');
  giveUpBtn.textContent = 'Give Up';
  giveUpBtn.className   = 'recall-giveup-btn';

  // ── Size slider ──────────────────────────────────────────
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

  // 4 stops: 1.15 → 1.32 → 1.48 → 1.65
  function applyScale(v) {
    const scale = 1.15 + (v / 3) * 0.5;
    wrap.style.setProperty('--rs', scale.toFixed(3));
  }
  sizeSlider.addEventListener('input', () => applyScale(Number(sizeSlider.value)));
  applyScale(0); // apply on first render

  const iconLg = document.createElement('span');
  iconLg.className   = 'recall-size-icon lg';
  iconLg.textContent = 'A';

  sliderWrap.append(iconSm, sizeSlider, iconLg);

  timerRow.append(timerDisplay, sliderWrap, giveUpBtn);

  const inputRow = document.createElement('div');
  inputRow.className = 'recall-input-row';

  const inp = document.createElement('input');
  inp.type         = 'text';
  inp.placeholder  = `Type a ${LANG_LABELS[lang] || 'word'}…`;
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
  gridWrap.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;

  // One table per column — keeps CSS grid stretching (each table fills 1fr).
  // Items are interleaved so the visual read order is row-major:
  //   col 0 gets sorted[0], sorted[cols], sorted[2*cols], …
  //   col 1 gets sorted[1], sorted[cols+1], sorted[2*cols+1], …
  // → reading left-to-right across columns: 1,2,3 / 4,5,6 / …
  const totalRows = Math.ceil(sorted.length / cols);

  for (let ci = 0; ci < cols; ci++) {
    const table = document.createElement('table');
    table.className = 'recall-table';

    for (let row = 0; row < totalRows; row++) {
      const idx = row * cols + ci;
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

      tr.appendChild(tdNum);
      tr.appendChild(tdWord);
      table.appendChild(tr);
    }

    gridWrap.appendChild(table);
  }

  attachTooltips(gridWrap);

  wrap.appendChild(timerRow);
  wrap.appendChild(inputRow);
  wrap.appendChild(scoreEl);
  wrap.appendChild(gridWrap);
  container.appendChild(wrap);

  inp.focus();

  // Initialize progress display
  updateProgress();

  // ── Input handler ──────────────────────────────────────
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

      feedback.textContent = `✓ ${match.word}`;
      feedback.style.color = 'var(--correct)';
      inp.value = '';

      setTimeout(() => { feedback.textContent = ''; }, 800);
      if (recalled.size === sorted.length) endSession();
    }
  });

  giveUpBtn.addEventListener('click', endSession);

  // ── Helpers ────────────────────────────────────────────
  function revealCell(word, state) {
    const cell = gridWrap.querySelector(`td.recall-cell[data-word="${CSS.escape(word)}"]`);
    if (!cell) return;
    cell.textContent = word;
    cell.classList.remove('recalled', 'missed');
    cell.classList.add(state);
  }

  function updateScore() {
    scoreEl.textContent = `Recalled: ${recalled.size} / ${sorted.length}`;
    updateProgress();
  }

  function updateProgress() {
    const pct = sorted.length > 0 ? Math.round((recalled.size / sorted.length) * 100) : 0;

    const barTop = document.getElementById('recallBarTop');
    const barBottom = document.getElementById('recallBarBottom');
    const statsTop = document.getElementById('recallStatsTop');
    const statsBottom = document.getElementById('recallStatsBottom');

    const statsText = `${recalled.size}/${sorted.length} recalled`;

    if (barTop) barTop.style.width = pct + '%';
    if (barBottom) barBottom.style.width = pct + '%';
    if (statsTop) statsTop.textContent = statsText;
    if (statsBottom) statsBottom.textContent = statsText;

    if (sorted.length > 0 && recalled.size === sorted.length) {
      giveUpBtn.disabled = true;
    }
  }

  function endSession() {
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

    scoreEl.innerHTML = `
      <div class="recall-summary">
        <span class="summary-correct">✓ ${recalled.size} recalled</span>
        <span class="summary-missed">✗ ${missed} missed</span>
        <span class="summary-pct">${pct}%</span>
      </div>
    `;
  }

  // ── Timer ──────────────────────────────────────────────
  function startTimer(seconds, isHardStop) {
    secondsLeft = seconds;
    hardStop    = isHardStop;
    updateTimerDisplay();

    timerInterval = setInterval(() => {
      secondsLeft--;
      updateTimerDisplay();

      if (secondsLeft <= 0) {
        clearInterval(timerInterval);
        if (hardStop) {
          endSession();
        } else {
          timerDisplay.textContent = "Time's up!";
          timerDisplay.style.color = 'var(--danger)';
        }
      }
    }, 1000);
  }

  function updateTimerDisplay() {
    const m = Math.floor(secondsLeft / 60);
    const s = secondsLeft % 60;
    timerDisplay.textContent = `${m}:${s.toString().padStart(2, '0')}`;
    timerDisplay.style.color = secondsLeft <= 30 ? 'var(--danger)' : 'var(--text-muted)';
  }

  return { startTimer };
}
