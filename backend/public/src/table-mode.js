import { isCorrect, getGlosses } from './utils.js';
import { attachTooltips }        from './word-tooltip.js';

export function renderTableMode({ words, container, columns = 3 }) {
  if (!(container instanceof HTMLElement)) {
    throw new Error('renderTableMode: container element required');
  }

  columns = Math.max(1, Math.min(5, Number(columns) || 3));

  function revealText(entry) {
    return entry.display ?? getGlosses(entry).join(' / ') ?? entry.word;
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
    return results;
  }

  buildTable();
  return { checkAll, giveUp, buildTable, words };
}