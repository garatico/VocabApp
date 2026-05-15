import { bindTableControls }                  from './table-controls.js';
import { bindQuizControls }                   from './quiz-controls.js';
import { bindStartHandler }                   from './start-handler.js';
import { bindClassFilter, getSelectedClasses } from './class-filter.js';
import { bindDomainFilter, getSelectedDomains } from './features/filters/domain-filter.js';
import { bindUIState, bindModeSwitch }         from './ui-state.js';
import { buildFilterUI }                      from './word-filters.js';
import { loadWords }                          from './data-loader.js';
import { initTheme } from './theme-toggle.js';
import { mountUI } from './ui.js';
import { initializeFilterToggle } from './filter-toggle.js';
import { renderPictureMode }                  from './picture-mode.js';

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

const { updateModeUI } = bindModeSwitch({ quizArea, tableArea, recallArea, pictureArea, conjugationArea });

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
  const size     = sizeSelect.value === 'custom'
                   ? Number(document.getElementById('sizeCustom').value) || 100
                   : Number(sizeSelect.value) || 100;
  const selected = getSelectedClasses();
  const baseList = selected.length === 0
    ? sorted.slice(0, size)
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
  getSize: () => sizeSelect.value === 'custom'
                 ? Number(document.getElementById('sizeCustom').value) || 100
                 : Number(sizeSelect.value) || 100,
  getSelectedClasses,
  getSelectedDomains,
  getRandomize: () => document.getElementById('randomizeWords').checked,
  getCols: ({ max, fallback }) => Math.max(1, Math.min(max, Number(colsSelect.value) || fallback)),
  getRecallTimer: getRecallTimerValue,
  onModeChange: updateModeUI,
  onSingleStart: showCurrent,
  getBaseList: () => currentBaseList,
  elements: { startBtn, tableWrap, recallWrap, pictureWrap, conjugationWrap, output },
});

// Rebuild base list when structural filters change
if (langSelect) {
  langSelect.addEventListener('change', () => loadAndBuildFilters(langSelect.value));
}
if (sizeSelect) {
  sizeSelect.addEventListener('change', () => loadAndBuildFilters(langSelect.value));
}
const sizeCustom = document.getElementById('sizeCustom');
if (sizeCustom) {
  sizeCustom.addEventListener('input', () => loadAndBuildFilters(langSelect.value));
}
// Rebuild when part-of-speech filter changes
const classFilter = document.getElementById('classFilter');
if (classFilter) {
  classFilter.addEventListener('change', () => loadAndBuildFilters(langSelect.value));
}

(async function initUI() {
  mountUI();

  if (langSelect) { langSelect.value = 'spanish'; }
  bindUIState();
  bindClassFilter();
  bindDomainFilter();
  bindTableControls();
  initializeFilterToggle();
  updateModeUI();
  await loadAndBuildFilters(langSelect?.value ?? 'spanish');
})();
