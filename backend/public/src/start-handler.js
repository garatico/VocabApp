import { Quiz }                          from './quiz.js';
import { loadWords }                      from './data-loader.js';
import { renderTableMode }                from './table-mode.js';
import { renderRecallMode }               from './recall-mode.js';
import { setTableController }             from './table-controls.js';
import { setQuiz }                        from './quiz-controls.js';
import { filterWords }                    from './word-filters.js';

export function bindStartHandler({
  getLang,
  getSize,
  getSelectedClasses,
  getSelectedDomains,
  getRandomize,
  getCols,
  getRecallTimer,
  onModeChange,
  onSingleStart,
  getBaseList,     // NEW: returns the current baseList maintained by main.js
  elements: {
    startBtn,
    tableWrap,
    recallWrap,
    modeSelect,
    output,
  }
}) {
  startBtn.addEventListener('click', async () => {
    startBtn.disabled    = true;
    startBtn.textContent = 'Loading…';

    try {
      // Apply current filter checkbox state to the base list —
      // do NOT rebuild the filter UI here so user selections are preserved.
      let list = filterWords(getBaseList());

      // Apply domain filter from the HTML #domainFilter checkboxes
      const selectedDomains = getSelectedDomains ? getSelectedDomains() : [];
      if (selectedDomains.length > 0) {
        list = list.filter(w =>
          (w.domains || []).some(d => selectedDomains.includes(d))
        );
      }


      if (getRandomize()) {
        for (let i = list.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [list[i], list[j]] = [list[j], list[i]];
        }
      }

      setQuiz(new Quiz({ words: list }));

      if (modeSelect.value === 'table') {
        tableWrap.innerHTML = '';
        const summary = document.getElementById('tableSummary');
        if (summary) { summary.style.display = 'none'; summary.innerHTML = ''; }

        setTableController(renderTableMode({
          words: list,
          container: tableWrap,
          columns: getCols({ max: 5, fallback: 3 }),
        }));
      }

      if (modeSelect.value === 'recall') {
        recallWrap.innerHTML = '';
        const { seconds, isHardStop } = getRecallTimer();

        const controller = renderRecallMode({
          words: list,
          container: recallWrap,
          columns: getCols({ max: 3, fallback: 1 }),
        });

        if (seconds > 0) controller.startTimer(seconds, isHardStop);
      }

      onModeChange();
      if (modeSelect.value === 'single') onSingleStart();

    } catch (err) {
      output.style.display = 'block';
      output.textContent   = 'Error: ' + err.message;
    } finally {
      startBtn.disabled    = false;
      startBtn.textContent = 'Start Quiz';
    }
  });
}