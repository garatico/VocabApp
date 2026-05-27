import { bindTableControls, resolveDirection } from './modes/table-controls.ts';
import { bindQuizControls }                   from './quiz/quiz-controls.ts';
import { bindStartHandler }                   from './start-handler.ts';
import { bindClassFilter, getSelectedClasses } from './filters/class-filter.ts';
import { bindDomainFilter, getSelectedDomains } from './filters/domain-filter.ts';
import { bindUIState, bindModeSwitch }         from './ui/ui-state.ts';
import { buildFilterUI }                      from './filters/word-filters.ts';
import { loadWords }                          from './data/data-loader.ts';
import { initTheme }                          from './ui/theme-toggle.ts';
import { mountUI }                            from './ui/ui.ts';
import { initializeFilterToggle }             from './filters/filter-toggle.ts';
import { renderPictureMode }                  from './modes/picture-mode.ts';
import { initConjControls }                   from './modes/conjugation/controls.ts';
import { renderMyLists }                      from './modes/my-lists-mode.ts';
import { refreshFilterSelect }                from './utils/word-lists.ts';

initTheme();

const langSelect     = document.getElementById('langSelect');
const sizeSelect     = document.getElementById('sizeSelect');
const startBtn       = document.getElementById('startBtn');
const quizArea         = document.getElementById('quizArea');
const tableArea        = document.getElementById('tableArea');
const tableWrap        = document.getElementById('tableWrap');
const recallArea       = document.getElementById('recallArea');
const recallWrap       = document.getElementById('recallWrap');
const pictureArea      = document.getElementById('pictureArea');
const pictureWrap      = document.getElementById('pictureWrap');
const conjugationArea  = document.getElementById('conjugationArea');
const conjugationWrap  = document.getElementById('conjugationWrap');
const myListsArea      = document.getElementById('myListsArea');
const myListsWrap      = document.getElementById('myListsWrap');
const recallTimer    = document.getElementById('recallTimer');
const recallHardStop = document.getElementById('recallHardStop');
const colsSelect     = document.getElementById('colsSelect');
const output         = document.getElementById('output');

const langMap = {
  spanish:    'es',
  portuguese: 'pt',
  italian:    'it',
  french:     'fr'
};

const { updateModeUI } = bindModeSwitch({
  quizArea, tableArea, recallArea, pictureArea, conjugationArea,
  extraAreas: { mylists: myListsArea },
  onActivate: {
    conjugation: () => initConjControls(langSelect?.value || 'spanish'),
  },
});

const { showCurrent } = bindQuizControls({
  getLang: () => langMap[langSelect.value] || 'es',
});

// Word list state
// allWordsByLang: cache of full sorted lists per language
// currentBaseList: the sliced list filters are applied against;
//   only rebuilt when language, size, or class selection changes
const allWordsByLang = {};
let currentBaseList  = [];

async function loadAndBuildFilters(lang) {
  if (!allWordsByLang[lang]) {
    const raw = await loadWords(lang);
    allWordsByLang[lang] = raw.slice().sort((a, b) => (a.rank || 9999) - (b.rank || 9999));
  }

  const sorted   = allWordsByLang[lang];
  const isMax    = sizeSelect.value === 'max';
  const size     = isMax             ? Infinity
                 : sizeSelect.value === 'custom'
                   ? Number(document.getElementById('sizeCustom').value) || 100
                   : Number(sizeSelect.value) || 100;
  const selected = getSelectedClasses();
  const baseList = selected.length === 0
    ? (isMax ? sorted.slice() : sorted.slice(0, size))
    : sorted.filter(w => w.pos == null || selected.includes(w.pos)).slice(0, size);

  currentBaseList = baseList;
  buildFilterUI(sorted, baseList);
}

function getRecallTimerValue() {
  const val     = recallTimer.value;
  const seconds = val === '0'      ? 0
                : val === 'custom' ? (Number(document.getElementById('recallTimerCustom').value) || 5) * 60
                : Number(val);
  return { seconds, isHardStop: recallHardStop.value === 'true' };
}

bindStartHandler({
  getLang: () => langMap[langSelect.value] || 'es',
  getFullLang: () => langSelect.value,
  getSize: () => sizeSelect.value === 'max'    ? Infinity
               : sizeSelect.value === 'custom' ? Number(document.getElementById('sizeCustom').value) || 100
               :                                 Number(sizeSelect.value) || 100,
  getSelectedClasses,
  getSelectedDomains,
  getSortOrder: () => {
    const active = document.querySelector('#sortOrderToggle .sort-order-btn.active');
    return (active?.dataset.order ?? 'frequency');
  },
  getCols:      ({ max, fallback }) => Math.max(1, Math.min(max, Number(colsSelect.value) || fallback)),
  getDirection: resolveDirection,
  getRecallTimer: getRecallTimerValue,
  onModeChange: updateModeUI,
  onSingleStart: showCurrent,
  getBaseList: () => currentBaseList,
  getAllWords:  () => allWordsByLang[langSelect.value] || [],
  elements: { startBtn, tableWrap, recallWrap, pictureWrap, conjugationWrap, output },
});

// Rebuild base list when structural filters change
if (langSelect) {
  langSelect.addEventListener('change', () => {
    localStorage.setItem('vq_lang', langSelect.value);
    loadAndBuildFilters(langSelect.value);
    refreshFilterSelect(langSelect.value);
    const activeTab = document.querySelector('.mode-tab.active');
    if (activeTab?.dataset.mode === 'conjugation') {
      initConjControls(langSelect.value);
    }
  });
}
if (sizeSelect) {
  sizeSelect.addEventListener('change', () => {
    localStorage.setItem('vq_size', sizeSelect.value);
    loadAndBuildFilters(langSelect.value);
  });
}
const sizeCustom = document.getElementById('sizeCustom');
if (sizeCustom) {
  sizeCustom.addEventListener('input', () => loadAndBuildFilters(langSelect.value));
}
const classFilter = document.getElementById('classFilter');
if (classFilter) {
  classFilter.addEventListener('change', () => loadAndBuildFilters(langSelect.value));
}

const sortOrderToggle = document.getElementById('sortOrderToggle');
if (sortOrderToggle) {
  sortOrderToggle.addEventListener('click', e => {
    const btn = e.target.closest('.sort-order-btn');
    if (!btn) return;
    sortOrderToggle.querySelectorAll('.sort-order-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
}

(async function initUI() {
  mountUI();

  if (langSelect) {
    langSelect.value = localStorage.getItem('vq_lang') ?? 'spanish';
  }
  if (sizeSelect) {
    const savedSize = localStorage.getItem('vq_size');
    if (savedSize) sizeSelect.value = savedSize;
  }
  bindUIState();
  bindClassFilter();
  bindDomainFilter();
  bindTableControls();
  initializeFilterToggle();

  const pictureSubMode = document.getElementById('pictureSubMode');
  if (pictureSubMode) {
    pictureSubMode.addEventListener('click', e => {
      const btn = e.target.closest('.conj-toggle-btn');
      if (!btn) return;
      pictureSubMode.querySelectorAll('.conj-toggle-btn')
        .forEach(b => b.classList.toggle('active', b === btn));
    });
  }

  if (myListsWrap) renderMyLists(myListsWrap as HTMLElement);

  updateModeUI();
  await loadAndBuildFilters(langSelect?.value ?? 'spanish');
})();
