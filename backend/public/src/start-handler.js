import { Quiz }                          from './quiz/quiz.js';
import { loadWords }                      from './data/data-loader.ts';
import { renderTableMode }                from './modes/table-mode.js';
import { renderRecallMode }               from './modes/recall-mode.js';
import { renderPictureMode }              from './modes/picture-mode.js';
import { renderConjugationMode }          from './modes/conjugation/index.ts';
import { setTableController }             from './modes/table-controls.js';
import { setQuiz }                        from './quiz/quiz-controls.js';
import { filterWords }                    from './filters/word-filters.ts';

export function bindStartHandler({
  getLang,
  getFullLang,
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
    pictureWrap,
    conjugationWrap,
    modeSelect,
    output,
  }
}) {
  // Helper function to get current mode from tab buttons
  function getCurrentMode() {
    const activeTab = document.querySelector('.mode-tab.active');
    return activeTab ? activeTab.dataset.mode : 'table';
  }

  startBtn.addEventListener('click', async () => {
    startBtn.disabled    = true;
    startBtn.textContent = 'Loading…';

    try {
      // Apply current filter checkbox state to the base list —
      // do NOT rebuild the filter UI here so user selections are preserved.
      let list = filterWords(getBaseList());

      // Apply domain filter from the HTML #domainFilter checkboxes.
      // Words with no domain data pass through unconditionally — domain
      // assignments only exist for Spanish, so filtering on them must not
      // eliminate words from other languages.
      const selectedDomains = getSelectedDomains ? getSelectedDomains() : [];
      if (selectedDomains.length > 0) {
        list = list.filter(w => {
          const domains = w.domains || [];
          return domains.length === 0 || domains.some(d => selectedDomains.includes(d));
        });
      }


      if (getRandomize()) {
        for (let i = list.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [list[i], list[j]] = [list[j], list[i]];
        }
      }

      setQuiz(new Quiz({ words: list }));

      const currentMode = getCurrentMode();

      if (currentMode === 'table') {
        tableWrap.innerHTML = '';
        const summary = document.getElementById('tableSummary');
        if (summary) { summary.style.display = 'none'; summary.innerHTML = ''; }

        const tableController = renderTableMode({
          words: list,
          container: tableWrap,
          columns: getCols({ max: 5, fallback: 3 }),
          onComplete: () => {
            // Show final score
            const correct = list.length;
            const pct = 100;
            if (summary) {
              summary.style.display = 'flex';
              summary.innerHTML = `
                <span class="summary-correct">✓ ${correct} correct</span>
                <span class="summary-pct">${pct}%</span>
              `;
            }
          }
        });
        setTableController(tableController);
      }

      if (currentMode === 'recall') {
        recallWrap.innerHTML = '';
        const { seconds, isHardStop } = getRecallTimer();

        const controller = renderRecallMode({
          words: list,
          container: recallWrap,
          columns: getCols({ max: 3, fallback: 1 }),
        });

        if (seconds > 0) controller.startTimer(seconds, isHardStop);
      }

      if (currentMode === 'picture') {
        pictureWrap.innerHTML = '';
        const pictureSubMode = document.getElementById('pictureSubMode');
        const pictureMode = pictureSubMode?.querySelector('.conj-toggle-btn.active')?.dataset.mode ?? 'type';
        renderPictureMode({
          words: list,
          container: pictureWrap,
          lang: getFullLang ? getFullLang() : 'spanish',
          mode: pictureMode,
        });
      }

      if (currentMode === 'conjugation' && conjugationWrap) {
        conjugationWrap.innerHTML = '';
        renderConjugationMode({
          words: list,
          container: conjugationWrap,
          lang: getFullLang ? getFullLang() : 'spanish',
        });
      }

      onModeChange();
      if (currentMode === 'single') onSingleStart();

    } catch (err) {
      output.style.display = 'block';
      output.textContent   = 'Error: ' + err.message;
    } finally {
      startBtn.disabled    = false;
      startBtn.textContent = 'Start Quiz';
    }
  });
}
