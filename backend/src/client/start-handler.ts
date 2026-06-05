import { Quiz }                          from './quiz/quiz.ts';
import { loadWords }                      from './data/data-loader.ts';
import { renderTableMode }                from './modes/table-mode.ts';
import { renderRecallMode }               from './modes/recall-mode.ts';
import { renderPictureMode }              from './modes/picture-mode.ts';
import { renderConjugationMode }          from './modes/conjugation/index.ts';
import { setTableController }             from './modes/table-controls.ts';
import { setQuiz }                        from './quiz/quiz-controls.ts';
import { filterWords }                    from './filters/word-filters.ts';

export function bindStartHandler({
  getLang,
  getFullLang,
  getSize,
  getSizeMode,     // 'window' (literal top N) | 'fill' (always return N unknowns)
  getSelectedClasses,
  getSelectedDomains,
  getSortOrder,
  getCols,
  getDirection,
  getRecallTimer,
  onModeChange,
  onSingleStart,
  getBaseList,
  getAllWords,      // full unsized word list — used by picture mode
  elements: {
    startBtn,
    tableWrap,
    recallWrap,
    pictureWrap,
    conjugationWrap,
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

      // ── "N New" fill mode: compensate for words hidden by list filter ─────────
      // When fill mode is active, pull additional words from beyond the current
      // size window (preserving all other active filters) until we reach the
      // requested count. "Top N" mode keeps the current behaviour unchanged.
      const sizeMode      = getSizeMode ? getSizeMode() : 'window';
      const requestedSize = getSize();

      if (sizeMode === 'fill' && isFinite(requestedSize) && list.length < requestedSize) {
        const allWords    = getAllWords ? getAllWords() : [];
        const baseWordSet = new Set((getBaseList() as any[]).map(w => w.word));

        // Candidates: words ranked beyond the current window
        let extras: any[] = allWords.filter((w: any) => !baseWordSet.has(w.word));

        // Apply list filter (same as applied to the base list above)
        extras = filterWords(extras);

        // Apply domain filter
        if (selectedDomains.length > 0) {
          extras = extras.filter((w: any) => {
            const doms = w.domains || [];
            return doms.length === 0 || doms.some((d: string) => selectedDomains.includes(d));
          });
        }

        // Apply POS class filter
        const selectedClasses = getSelectedClasses ? getSelectedClasses() : [];
        if (selectedClasses.length > 0) {
          extras = extras.filter((w: any) => w.pos == null || selectedClasses.includes(w.pos));
        }

        const needed = requestedSize - list.length;
        list = [...list, ...extras.slice(0, needed)];
      }

      const sortOrder = getSortOrder ? getSortOrder() : 'frequency';
      if (sortOrder === 'random') {
        for (let i = list.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [list[i], list[j]] = [list[j], list[i]];
        }
      } else if (sortOrder === 'alpha') {
        list.sort((a, b) => (a.word || '').localeCompare(b.word || ''));
      }
      // 'frequency' keeps the existing rank-based order from loadAndBuildFilters

      setQuiz(new Quiz({ words: list, storageKey: `quick_quiz_state_${getFullLang ? getFullLang() : 'spanish'}` }));

      const currentMode = getCurrentMode();

      if (currentMode === 'table') {
        tableWrap.innerHTML = '';
        ['tableSummary', 'tableSummaryTop'].forEach(id => {
          const el = document.getElementById(id);
          if (el) { el.style.display = 'none'; el.innerHTML = ''; }
        });

        const tableController = renderTableMode({
          words: list,
          container: tableWrap,
          columns:   getCols({ max: 5, fallback: 2 }),
          direction: getDirection ? getDirection() : 'target-en',
          onComplete: () => {
            const correct = list.length;
            const html = `<span class="summary-correct">✓ ${correct} correct</span><span class="summary-pct">100%</span>`;
            ['tableSummary', 'tableSummaryTop'].forEach(id => {
              const el = document.getElementById(id);
              if (!el) return;
              el.style.display = 'flex';
              el.innerHTML = html;
              el.classList.add('quiz-summary--perfect');
            });
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
          lang: getFullLang ? getFullLang() : 'spanish',
        });

        if (seconds > 0) controller.startTimer(seconds, isHardStop);
      }

      if (currentMode === 'picture') {
        pictureWrap.innerHTML = '';
        const pictureSubMode = document.getElementById('pictureSubMode');
        const pictureMode = pictureSubMode?.querySelector('.conj-toggle-btn.active')?.dataset.mode ?? 'type';

        // Picture mode draws from the full word list (no size limit) so that
        // emoji/SVG words with ranks > the size slider are still reachable.
        // We still respect the POS class filter and the static domain filter.
        let pictureWords = getAllWords ? getAllWords() : list;

        const selectedClasses = getSelectedClasses ? getSelectedClasses() : [];
        if (selectedClasses.length > 0) {
          pictureWords = pictureWords.filter(w => w.pos == null || selectedClasses.includes(w.pos));
        }

        if (selectedDomains.length > 0) {
          pictureWords = pictureWords.filter(w => {
            const doms = w.domains || [];
            return doms.length === 0 || doms.some(d => selectedDomains.includes(d));
          });
        }

        renderPictureMode({
          words: pictureWords,
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
