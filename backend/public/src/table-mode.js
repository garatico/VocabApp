import { isCorrect, getGlosses } from './utils.js';
import { attachTooltips }        from './word-tooltip.js';

export function renderTableMode({ words, container, columns = 3, onComplete = null }) {
  if (!(container instanceof HTMLElement)) {
    throw new Error('renderTableMode: container element required');
  }

  columns = Math.max(1, Math.min(5, Number(columns) || 3));

  function revealText(entry) {
    return entry.display ?? getGlosses(entry).join(' / ') ?? entry.word;
  }

  function checkAllComplete() {
    const allInputs = Array.from(container.querySelectorAll('input[data-word]'));
    return allInputs.length > 0 && allInputs.every(inp => inp.disabled);
  }

  function updateProgress() {
    const allInputs = Array.from(container.querySelectorAll('input[data-word]'));
    const correct = allInputs.filter(inp => inp.disabled).length;
    const total = allInputs.length;
    const pct = total > 0 ? Math.round((correct / total) * 100) : 0;

    // Update progress bars and stats
    const barTop = document.getElementById('tableBarTop');
    const barBottom = document.getElementById('tableBarBottom');
    const statsTop = document.getElementById('tableStatsTop');
    const statsBottom = document.getElementById('tableStatsBottom');

    const statsText = `${correct}/${total} answered`;

    if (barTop) barTop.style.width = pct + '%';
    if (barBottom) barBottom.style.width = pct + '%';
    if (statsTop) statsTop.textContent = statsText;
    if (statsBottom) statsBottom.textContent = statsText;

    // Grey out Give Up when all words are correct
    const giveUpBtn = document.getElementById('tableReset');
    if (giveUpBtn) giveUpBtn.disabled = (pct === 100);
  }

  function buildTable() {
    container.innerHTML = '';
    const table       = document.createElement('table');
    const pairsPerRow = Math.max(1, Math.min(5, Number(columns) || 3));

    for (let i = 0; i < words.length; i += pairsPerRow) {
      const tr = document.createElement('tr');

      for (let j = 0; j < pairsPerRow; j++) {
        const w = words[i + j];

        const tdWord  = document.createElement('td');
        tdWord.classList.add('word-cell');
        const tdInput = document.createElement('td');
        tdInput.classList.add('input-cell');

        if (!w) {
          tr.appendChild(tdWord);
          tr.appendChild(tdInput);
          continue;
        }

        const wordDiv = document.createElement('div');
        wordDiv.textContent = w.word;
        wordDiv.classList.add('spanish-word');
        wordDiv.dataset.wordJson = JSON.stringify(w);  // ← tooltip data
        tdWord.appendChild(wordDiv);

        const inp        = document.createElement('input');
        inp.type         = 'text';
        inp.dataset.word = w.word;

        inp.addEventListener('input', () => {
          if (isCorrect(inp.value, w)) {
            inp.value    = revealText(w);
            inp.disabled = true;
            inp.classList.add('correct');

            const allInputs  = Array.from(container.querySelectorAll('input[data-word]'));
            const currentIdx = allInputs.indexOf(inp);
            const next       = allInputs.slice(currentIdx + 1).find(i => !i.disabled);
            if (next) next.focus();

            // Update progress
            updateProgress();

            // Check if all words are now complete
            if (checkAllComplete() && onComplete) {
              setTimeout(() => onComplete(), 300);
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
    attachTooltips(container);  // ← attach after table is in the DOM
    updateProgress();  // Initialize progress bars and stats
  }

  function checkAll() {
    const results = [];
    container.querySelectorAll('input[data-word]').forEach((inp) => {
      const entry = words.find(w => w.word === inp.dataset.word);
      if (!entry) return;
      const ok = isCorrect(inp.value, entry);
      inp.classList.remove('correct', 'incorrect');
      if (ok) { inp.value = revealText(entry); inp.disabled = true; inp.classList.add('correct'); }
      else      inp.classList.add('incorrect');
      results.push({ word: inp.dataset.word, ok, expected: revealText(entry) });
    });
    return results;
  }

  function giveUp() {
    const results = [];
    container.querySelectorAll('input[data-word]').forEach((inp) => {
      if (inp.classList.contains('correct')) {
        results.push({ ok: true });
        return;
      }
      const entry = words.find(w => w.word === inp.dataset.word);
      if (!entry) return;
      inp.value    = revealText(entry);
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