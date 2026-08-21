import { Quiz }                          from './quiz/quiz.ts';
import { renderRecallMode }               from './modes/recall-mode.ts';
import { renderPictureMode }              from './modes/picture-mode.ts';
import { renderConjugationMode }          from './modes/conjugation/index.ts';
import { startTableQuiz }                 from './modes/table-controls.ts';
import { setQuiz }                        from './quiz/quiz-controls.ts';
import { filterWords }                    from './filters/word-filters.ts';
import { hasVisual }                      from './data/visual-map.ts';
import { shuffleInPlace }                from './utils/shuffle.ts';
import { Settings }                       from './settings.ts';

import type { Word } from './types.ts';

interface StartHandlerElements {
  startBtn:        HTMLButtonElement;
  tableWrap:       HTMLElement;
  recallWrap:      HTMLElement;
  pictureWrap:     HTMLElement;
  conjugationWrap: HTMLElement | null;
  output:          HTMLElement;
}

interface StartHandlerOptions {
  getLang:            () => string;
  getFullLang:        () => string;
  getSize:            () => number;
  getSizeMode?:       () => string;
  getSelectedClasses?: () => string[];
  getSelectedDomains?: () => string[];
  getSortOrder?:      () => string;
  getCols:            (opts: { max: number; fallback: number }) => number;
  getDirection?:      () => string;
  getRecallTimer:     () => { seconds: number; isHardStop: boolean };
  onModeChange:       () => void;
  onSingleStart:      () => void;
  getBaseList:        () => Word[];
  getAllWords?:        () => Word[];
  elements:           StartHandlerElements;
}


export function bindStartHandler({
  getLang: _getLang,
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
}: StartHandlerOptions) {
  // Helper function to get current mode from tab buttons
  function getCurrentMode() {
    const activeTab = document.querySelector('.mode-tab.active');
    return activeTab ? (activeTab as HTMLElement).dataset.mode : 'table';
  }

  startBtn.addEventListener('click', async () => {
    startBtn.disabled    = true;
    startBtn.textContent = 'Loading…';

    try {
      // Apply current filter checkbox state to the base list —
      // do NOT rebuild the filter UI here so user selections are preserved.
      const fullLang = getFullLang ? getFullLang() : 'spanish';
      let list = filterWords(getBaseList());

      // Conjugation mode only ever shows verbs, but the size window was being
      // applied to words of every part of speech first — so "Top 100" handed
      // conjugation 100 mixed words, of which ~13 were verbs. Narrow the pool
      // up front so the requested size means what it says.
      const modeAtStart = getCurrentMode();
      const verbsOnly   = modeAtStart === 'conjugation';
      if (verbsOnly) list = list.filter(w => w.pos === 'verb');

      // Same problem, same fix: picture mode discards every word without a
      // photo, SVG or emoji, so "Top 100" was producing however many of the
      // top 100 happened to be illustrated rather than 100 pictures.
      const visualsOnly = modeAtStart === 'picture';
      if (visualsOnly) list = list.filter(w => hasVisual(fullLang, w.word));

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
        const baseWordSet = new Set(getBaseList().map(w => w.word));

        // Candidates: words ranked beyond the current window
        let extras: Word[] = allWords.filter(w => !baseWordSet.has(w.word));
        if (verbsOnly)   extras = extras.filter(w => w.pos === 'verb');
        if (visualsOnly) extras = extras.filter(w => hasVisual(fullLang, w.word));

        // Apply list filter (same as applied to the base list above)
        extras = filterWords(extras);

        // Apply domain filter
        if (selectedDomains.length > 0) {
          extras = extras.filter(w => {
            const doms = w.domains || [];
            return doms.length === 0 || doms.some((d: string) => selectedDomains.includes(d));
          });
        }

        // Apply POS class filter
        const selectedClasses = getSelectedClasses ? getSelectedClasses() : [];
        if (selectedClasses.length > 0) {
          extras = extras.filter(w => w.pos == null || selectedClasses.includes(w.pos));
        }

        const needed = requestedSize - list.length;
        list = [...list, ...extras.slice(0, needed)];
      }

      // Same top-up for plain "Top N": narrowing to verbs or to illustrated
      // words always leaves the list short, since both are a minority of any
      // frequency window.
      if ((verbsOnly || visualsOnly) && isFinite(requestedSize) && list.length < requestedSize) {
        const allWords = getAllWords ? getAllWords() : [];
        const have     = new Set(list.map(w => w.word));
        let extras     = allWords.filter(w => !have.has(w.word)
                          && (verbsOnly  ? w.pos === 'verb'        : true)
                          && (visualsOnly ? hasVisual(fullLang, w.word) : true));
        extras = filterWords(extras);
        if (selectedDomains.length > 0) {
          extras = extras.filter(w => {
            const doms = w.domains || [];
            return doms.length === 0 || doms.some((d: string) => selectedDomains.includes(d));
          });
        }
        list = [...list, ...extras.slice(0, requestedSize - list.length)];
      }

      // Hard cap. Everything above only ever *adds* words — the top-up blocks
      // exist to compensate for narrowing filters. Without this the requested
      // size was a floor rather than a limit, which is why "Top 1" in picture
      // mode handed back every illustrated word it could find.
      if (isFinite(requestedSize) && list.length > requestedSize) {
        list = list.slice(0, requestedSize);
      }

      const sortOrder = getSortOrder ? getSortOrder() : 'frequency';
      if (sortOrder === 'random') {
        shuffleInPlace(list);
      } else if (sortOrder === 'alpha') {
        list.sort((a, b) => (a.word || '').localeCompare(b.word || ''));
      }
      // 'frequency' keeps the existing rank-based order from loadAndBuildFilters

      setQuiz(new Quiz({
        words:      list,
        storageKey: `quick_quiz_state_${fullLang}`,
        tolerance:  Settings.getTypoToleranceRatio(),
      }));

      const currentMode = modeAtStart;

      if (currentMode === 'table') {
        tableWrap.innerHTML = '';
        ['tableSummary', 'tableSummaryTop'].forEach(id => {
          const el = document.getElementById(id);
          if (el) { el.style.display = 'none'; el.innerHTML = ''; }
        });

        startTableQuiz({
          words:     list,
          columns:   getCols({ max: 5, fallback: 2 }),
          direction: (getDirection ? getDirection() : 'target-en') as import('./modes/table-mode.ts').TableDirection,
          lang:      fullLang,
          // Completion is shown by the progress bar itself now — it fills and
          // its in-bar label reads 100%. A separate block that existed only to
          // repeat "100%" was redundant.
          onComplete: () => { /* nothing extra to show */ }
        });
      }

      if (currentMode === 'recall') {
        recallWrap.innerHTML = '';
        const { seconds, isHardStop } = getRecallTimer();

        const controller = renderRecallMode({
          words: list,
          container: recallWrap,
          columns: getCols({ max: 3, fallback: 1 }),
          lang: fullLang,
        });

        if (seconds > 0) controller.startTimer(seconds, isHardStop);
      }

      if (currentMode === 'picture') {
        pictureWrap.innerHTML = '';
        const pictureSubMode = document.getElementById('pictureSubMode');
        const pictureMode = (pictureSubMode?.querySelector('.conj-toggle-btn.active') as HTMLElement | null)?.dataset.mode ?? 'type';

        // Use the list built above. It has already been narrowed to words that
        // actually have a visual, topped up from beyond the size window so the
        // count is reachable, and capped at the requested size.
        //
        // It used to ignore `list` and re-read getAllWords() here — which is
        // why every fix to the size handling above had no effect: "Top 1"
        // computed a one-word list and then threw it away.
        renderPictureMode({
          words: list,
          container: pictureWrap,
          lang: fullLang,
          mode: (pictureMode ?? 'type') as 'type' | 'click' | 'flashcard',
          // Click mode needs 3 decoys per question and the quiz set may be
          // smaller than that. Decoys are never scored, so they come from
          // every illustrated word in the language rather than the quiz set.
          distractorWords: (getAllWords ? getAllWords() : []).filter(w => hasVisual(fullLang, w.word)),
        });
      }

      if (currentMode === 'conjugation' && conjugationWrap) {
        conjugationWrap.innerHTML = '';
        renderConjugationMode({
          words: list,
          container: conjugationWrap,
          lang: fullLang,
        });
      }

      onModeChange();
      if (currentMode === 'single') onSingleStart();

    } catch (err) {
      output.style.display = 'block';
      output.textContent   = 'Error: ' + (err as Error).message;
    } finally {
      startBtn.disabled    = false;
      startBtn.textContent = 'Start Quiz';
    }
  });
}
