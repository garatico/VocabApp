// ── Imports ───────────────────────────────────────────────────────────────────

import { bindTableControls, resolveDirection } from './modes/table-controls.ts';
import { bindQuizControls }                    from './quiz/quiz-controls.ts';
import { bindStartHandler }                    from './start-handler.ts';
import { bindClassFilter, getSelectedClasses } from './filters/class-filter.ts';
import { initSectionCollapse }                from './filters/section-collapse.ts';
import { bindDomainFilter, getSelectedDomains, updateDomainFilter } from './filters/domain-filter.ts';
import { bindUIState, bindModeSwitch }          from './ui/ui-state.ts';
import { buildFilterUI, initListFilter }        from './filters/word-filters.ts';
import { loadWords }                            from './data/data-loader.ts';
import { initTheme }                            from './ui/theme-toggle.ts';
import { mountUI }                              from './ui/ui.ts';
import { initConjControls }                     from './modes/conjugation/controls.ts';
import type { Word }                            from './types.ts';
import { mustGet }                              from './utils/dom.ts';
import { renderMyLists }                        from './modes/my-lists-mode.ts';
import { refreshFilterSelect }                  from './utils/word-lists.ts';
import { Settings, bindSettings, applyFontSize } from './settings.ts';
import { initShortcuts }                         from './ui/shortcuts-overlay.ts';

// ── DOM refs ──────────────────────────────────────────────────────────────────

const langSelect      = document.getElementById('langSelect')      as HTMLSelectElement | null;
const sizeSelect      = document.getElementById('sizeSelect')      as HTMLSelectElement | null;
const startBtn        = mustGet<HTMLButtonElement>('startBtn');
const output          = mustGet('output');
const tableWrap       = mustGet('tableWrap');
const recallWrap      = mustGet('recallWrap');
const pictureWrap     = mustGet('pictureWrap');
const conjugationWrap = mustGet('conjugationWrap');
const myListsWrap     = document.getElementById('myListsWrap');  // optional — page may omit it

// Sections (hidden/shown by mode switch — mustGet throws if HTML template drifts)
const quizArea        = mustGet('quizArea');
const tableArea       = mustGet('tableArea');
const recallArea      = mustGet('recallArea');
const pictureArea     = mustGet('pictureArea');
const conjugationArea = mustGet('conjugationArea');
const myListsArea     = mustGet('myListsArea');
const settingsArea    = mustGet('settingsArea');

// ── Constants ─────────────────────────────────────────────────────────────────

const LANG_CODE: Record<string, string> = {
  spanish: 'es', portuguese: 'pt', italian: 'it', french: 'fr',
};

// ── Session state persistence (vq_ prefix = per-session UI state) ─────────────

const S = {
  get: (k: string)            => localStorage.getItem(k),
  set: (k: string, v: string) => localStorage.setItem(k, v),
};

function restoreSettings(): void {
  if (langSelect) langSelect.value = S.get('vq_lang') ?? 'spanish';
  if (sizeSelect) { const v = S.get('vq_size'); if (v) sizeSelect.value = v; }

  // Custom word count — the select restores itself above, but the number input
  // it reveals is display:none by default and starts empty, so without this a
  // refresh silently fell back to the default size.
  const sizeCustom = document.getElementById('sizeCustom') as HTMLInputElement | null;
  if (sizeCustom && sizeSelect?.value === 'custom') {
    sizeCustom.value         = S.get('vq_size_custom') ?? '';
    sizeCustom.style.display = 'inline-block';
  }
  const savedSizeMode = S.get('vq_size_mode');
  if (savedSizeMode) {
    document.querySelectorAll<HTMLElement>('#sizeModeToggle .sort-order-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.mode === savedSizeMode);
    });
  }

  // Sort order — scoped to avoid touching settings panel buttons
  const savedSort = S.get('vq_sort');
  if (savedSort) {
    document.querySelectorAll<HTMLElement>('#sortOrderToggle .sort-order-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.order === savedSort);
    });
  }

  // Direction
  const savedDir = S.get('vq_dir');
  if (savedDir) {
    document.querySelectorAll<HTMLElement>('#directionToggle .conj-toggle-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.direction === savedDir);
    });
  }
}

// ── Word list state ───────────────────────────────────────────────────────────

const allWordsByLang: Record<string, Word[]> = {};
let currentBaseList: Word[] = [];

async function loadAndBuildFilters(lang: string): Promise<void> {
  if (!allWordsByLang[lang]) {
    const raw = await loadWords(lang);
    allWordsByLang[lang] = raw.slice().sort((a, b) => (a.rank || 9999) - (b.rank || 9999));
  }

  const sorted   = allWordsByLang[lang];
  const isMax    = sizeSelect?.value === 'max';
  const size     = isMax
    ? Infinity
    : sizeSelect?.value === 'custom'
      ? Number((document.getElementById('sizeCustom') as HTMLInputElement)?.value) || 100
      : Number(sizeSelect?.value) || 100;

  const selected = getSelectedClasses();
  currentBaseList = selected.length === 0
    ? (isMax ? sorted.slice() : sorted.slice(0, size))
    : sorted.filter((w) => w.pos == null || selected.includes(w.pos)).slice(0, size);

  buildFilterUI(sorted, currentBaseList);

  // Compute domain counts from loaded vocabulary and update filter pills
  const domainCounts = new Map<string, number>();
  for (const w of sorted) {
    for (const d of (w.domains ?? [])) {
      domainCounts.set(d, (domainCounts.get(d) ?? 0) + 1);
    }
  }
  const sortedCounts = [...domainCounts.entries()]
    .map(([domain, count]) => ({ domain, count }))
    .filter(x => x.count > 0)
    .sort((a, b) => b.count - a.count);
  updateDomainFilter(sortedCounts);
}

function getRecallTimerValue() {
  return {
    seconds:    Settings.getRecallSeconds(),
    isHardStop: Settings.getHardStop(),
  };
}

// ── Core module bindings ──────────────────────────────────────────────────────

initTheme();

const { updateModeUI } = bindModeSwitch({
  quizArea, tableArea, recallArea, pictureArea, conjugationArea,
  extraAreas: { mylists: myListsArea, settings: settingsArea },
  onActivate: {
    conjugation: () => initConjControls(langSelect?.value || 'spanish'),
  },
});

const { showCurrent } = bindQuizControls({
  getLang: () => LANG_CODE[langSelect?.value ?? 'spanish'] || 'es',
});

bindStartHandler({
  getLang:     () => LANG_CODE[langSelect?.value ?? 'spanish'] || 'es',
  getFullLang: () => langSelect?.value ?? 'spanish',
  getSize: () => sizeSelect?.value === 'max'
    ? Infinity
    : sizeSelect?.value === 'custom'
      ? Number((document.getElementById('sizeCustom') as HTMLInputElement)?.value) || 100
      : Number(sizeSelect?.value) || 100,
  getSelectedClasses,
  getSelectedDomains,
  getSortOrder: () => {
    const active = document.querySelector<HTMLElement>('#sortOrderToggle .sort-order-btn.active');
    return active?.dataset.order ?? 'frequency';
  },
  getSizeMode: () => {
    const active = document.querySelector<HTMLElement>('#sizeModeToggle .sort-order-btn.active');
    return (active?.dataset.mode ?? 'window') as 'window' | 'fill';
  },
  getCols: ({ max, fallback }: { max: number; fallback: number }) =>
    Math.max(1, Math.min(max, Settings.getTableCols() || fallback)),
  getDirection:   resolveDirection,
  getRecallTimer: getRecallTimerValue,
  onModeChange:   updateModeUI,
  onSingleStart:  showCurrent,
  getBaseList:    () => currentBaseList,
  getAllWords:     () => allWordsByLang[langSelect?.value ?? 'spanish'] || [],
  elements:       { startBtn, tableWrap, recallWrap, pictureWrap, conjugationWrap, output },
});

// ── Event listeners ───────────────────────────────────────────────────────────

langSelect?.addEventListener('change', () => {
  S.set('vq_lang', langSelect.value);
  void loadAndBuildFilters(langSelect.value);
  refreshFilterSelect(langSelect.value);
  if (document.querySelector('.mode-tab.active')?.getAttribute('data-mode') === 'conjugation') {
    initConjControls(langSelect.value);
  }
});

sizeSelect?.addEventListener('change', () => {
  S.set('vq_size', sizeSelect.value);
  void loadAndBuildFilters(langSelect?.value ?? 'spanish');
});

const sizeCustomInput = document.getElementById('sizeCustom') as HTMLInputElement | null;
sizeCustomInput?.addEventListener('input', () => {
  S.set('vq_size_custom', sizeCustomInput.value);
  void loadAndBuildFilters(langSelect?.value ?? 'spanish');
});

document.getElementById('classFilter')
  ?.addEventListener('change', () => loadAndBuildFilters(langSelect?.value ?? 'spanish'));

// Size mode toggle (Top N vs N New)
document.getElementById('sizeModeToggle')?.addEventListener('click', e => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>('.sort-order-btn');
  if (!btn) return;
  document.querySelectorAll('#sizeModeToggle .sort-order-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  if (btn.dataset.mode) S.set('vq_size_mode', btn.dataset.mode);
});

// Sort order — scoped to #sortOrderToggle to avoid clearing settings buttons
document.getElementById('sortOrderToggle')?.addEventListener('click', e => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>('.sort-order-btn');
  if (!btn) return;
  document.querySelectorAll('#sortOrderToggle .sort-order-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  if (btn.dataset.order) S.set('vq_sort', btn.dataset.order);
});

// Direction
document.getElementById('directionToggle')?.addEventListener('click', e => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>('.conj-toggle-btn');
  if (btn?.dataset.direction) S.set('vq_dir', btn.dataset.direction);
});

// Active mode tab
document.querySelector('.mode-tabs')?.addEventListener('click', e => {
  const tab = (e.target as HTMLElement).closest<HTMLElement>('.mode-tab');
  if (tab?.dataset.mode) S.set('vq_mode', tab.dataset.mode);
});

// Picture sub-mode toggle
document.getElementById('pictureSubMode')?.addEventListener('click', e => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>('.conj-toggle-btn');
  if (!btn) return;
  document.querySelectorAll('#pictureSubMode .conj-toggle-btn')
    .forEach(b => b.classList.toggle('active', b === btn));
});

// ── Init ──────────────────────────────────────────────────────────────────────

void (async function init(): Promise<void> {
  mountUI();
  applyFontSize();        // apply saved font size before anything renders
  restoreSettings();
  bindUIState();
  bindClassFilter();
  bindDomainFilter();
  initSectionCollapse();
  bindTableControls();
  bindSettings();
  initShortcuts();
  initListFilter(langSelect?.value ?? 'spanish');

  // ── Onboarding card ────────────────────────────────────────────────────────
  const onboardingCard    = document.getElementById('onboardingCard');
  const onboardingDismiss = document.getElementById('onboardingDismiss');
  const showOnboardingBtn = document.getElementById('settingShowOnboarding');

  function showOnboarding(): void {
    onboardingCard?.removeAttribute('hidden');
  }
  function dismissOnboarding(): void {
    onboardingCard?.setAttribute('hidden', '');
    localStorage.setItem('s_onboarding_seen', '1');
  }

  if (!localStorage.getItem('s_onboarding_seen')) showOnboarding();
  onboardingDismiss?.addEventListener('click', dismissOnboarding);
  showOnboardingBtn?.addEventListener('click', () => {
    localStorage.removeItem('s_onboarding_seen');
    showOnboarding();
    // Switch back to table mode so the card is visible
    const tableTab = document.querySelector<HTMLElement>('.mode-tab[data-mode="table"]');
    tableTab?.click();
  });

  // Restore active mode tab (must happen after bindModeSwitch set up click handlers)
  const savedMode = S.get('vq_mode');
  if (savedMode && savedMode !== 'mylists' && savedMode !== 'settings') {
    const tab = document.querySelector<HTMLElement>(`.mode-tab[data-mode="${savedMode}"]`);
    tab?.click();
  }

  if (myListsWrap) renderMyLists(myListsWrap as HTMLElement);

  // Admin tab is hidden by default — only shown in dev builds
  if (import.meta.env.DEV) {
    document.querySelector<HTMLElement>('a.admin-tab')?.removeAttribute('hidden');
  }

  updateModeUI();
    await loadAndBuildFilters(langSelect?.value ?? 'spanish');
})();
