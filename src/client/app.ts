// ── Imports ───────────────────────────────────────────────────────────────────

import { bindTableControls, resolveDirection } from './modes/table-controls.ts';
import { initPWA } from './utils/pwa.ts';
import { bindQuizControls }                    from './quiz/quiz-controls.ts';
import { bindStartHandler }                    from './start-handler.ts';
import { bindClassFilter, getSelectedClasses } from './filters/class-filter.ts';
import { initSectionCollapse }                from './filters/section-collapse.ts';
import { bindDomainFilter, getSelectedDomains, updateDomainFilter } from './filters/domain-filter.ts';
import { bindUIState, bindModeSwitch }          from './ui/ui-state.ts';
import { buildFilterUI, initListFilter, syncListFilterUI } from './filters/word-filters.ts';
import { loadWords }                            from './data/data-loader.ts';
import { initTheme }                            from './ui/theme-toggle.ts';
import { mountUI }                              from './ui/ui.ts';
import { initConjControls }                     from './modes/conjugation/controls.ts';
import type { Word }                            from './types.ts';
import { mustGet }                              from './utils/dom.ts';
import { renderMyLists }                        from './modes/my-lists-mode.ts';
import { LANGUAGES, isoCode, supportsConjugation,
         conjugationUnavailableReason }          from './data/languages.ts';
import { availableLanguages }                    from './data/vocab-source.ts';
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
// The language list and its per-language capabilities live in
// data/languages.ts — see isoCode / supportsConjugation below.

// ── Session state persistence (vq_ prefix = per-session UI state) ─────────────

const S = {
  get: (k: string)            => localStorage.getItem(k),
  set: (k: string, v: string) => localStorage.setItem(k, v),
};

/**
 * Rebuild the language dropdown from LANGUAGES so the markup and the code
 * can't disagree about which languages exist.
 *
 * `withData` is the set of languages the database actually has rows for. A
 * language in LANGUAGES but not in that set is offered greyed out and labelled
 * — German exists in the app before it has been mined, and "German (no data
 * yet)" is a better answer than an error on selection. Null means we couldn't
 * find out, in which case everything stays enabled.
 */
function buildLanguageOptions(withData: string[] | null = null): void {
  if (!langSelect) return;
  const previous = langSelect.value;
  const have     = withData ? new Set(withData) : null;

  langSelect.innerHTML = '';
  for (const lang of LANGUAGES) {
    const missing   = have !== null && !have.has(lang.name);
    const opt       = document.createElement('option');
    opt.value       = lang.name;
    opt.textContent = missing ? `${lang.label} — no data yet` : lang.label;
    opt.disabled    = missing;
    langSelect.appendChild(opt);
  }

  // Don't leave a disabled language selected — a saved choice can outlive the
  // data, and the DB gets rebuilt from scratch often enough for that to happen.
  const stillValid = Boolean(previous) && (have === null || have.has(previous));
  langSelect.value = stillValid ? previous : (LANGUAGES[0]?.name ?? 'spanish');
}

/**
 * Ask the server (or the bundled manifest) which languages have data and mark
 * the rest. Runs after the first render so the dropdown isn't waiting on it.
 */
async function markEmptyLanguages(): Promise<void> {
  const have = await availableLanguages();
  if (!have) return;                       // couldn't tell — leave everything on
  const before = langSelect?.value;
  buildLanguageOptions(have);
  if (langSelect && langSelect.value !== before) {
    // The saved language has no data; we fell back to the first one.
    S.set('vq_lang', langSelect.value);
    syncConjugationAvailability();
    void loadAndBuildFilters(langSelect.value);
  }
}

/**
 * Conjugation mode needs conjugation data, and German has none — see
 * data/languages.ts. Disable the tab rather than letting it open onto an empty
 * grid, and say why on hover instead of leaving it mysteriously dead.
 */
function syncConjugationAvailability(): void {
  const lang = langSelect?.value ?? 'spanish';
  const tab  = document.querySelector<HTMLButtonElement>('.mode-tab[data-mode="conjugation"]');
  if (!tab) return;

  const available = supportsConjugation(lang);
  tab.disabled = !available;
  tab.classList.toggle('mode-tab--unavailable', !available);
  tab.title = available ? '' : conjugationUnavailableReason(lang);

  // Switching to a language that can't do the mode you're in shouldn't strand
  // you on a dead tab.
  if (!available && document.querySelector('.mode-tab.active')?.getAttribute('data-mode') === 'conjugation') {
    document.querySelector<HTMLElement>('.mode-tab[data-mode="table"]')?.click();
  }
}

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

  // Picture quiz style
  const savedPicStyle = S.get('vq_picture_style');
  if (savedPicStyle) {
    document.querySelectorAll<HTMLElement>('#pictureSubMode .conj-toggle-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.mode === savedPicStyle);
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
  getLang: () => isoCode(langSelect?.value),
});

bindStartHandler({
  getLang:     () => isoCode(langSelect?.value),
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
  syncConjugationAvailability();
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
  if (!tab?.dataset.mode) return;
  S.set('vq_mode', tab.dataset.mode);
  // The list filter is stored per mode, so the controls are now showing the
  // previous tab's setting. Repaint the header and re-tick the checkboxes
  // against the mode we just moved to.
  const lang = langSelect?.value ?? 'spanish';
  refreshFilterSelect(lang);
  syncListFilterUI(lang);
});

// Picture sub-mode toggle. The box collapses, so the chosen style is echoed
// into the header summary — otherwise a folded box says nothing at all.
function syncPictureStyleSummary(): void {
  const active = document.querySelector<HTMLElement>('#pictureSubMode .conj-toggle-btn.active');
  const label  = document.getElementById('pictureStyleSummary');
  if (label) label.textContent = active?.textContent ?? '';
}

document.getElementById('pictureSubMode')?.addEventListener('click', e => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>('.conj-toggle-btn');
  if (!btn) return;
  document.querySelectorAll('#pictureSubMode .conj-toggle-btn')
    .forEach(b => b.classList.toggle('active', b === btn));
  if (btn.dataset.mode) S.set('vq_picture_style', btn.dataset.mode);
  syncPictureStyleSummary();
});

// ── Init ──────────────────────────────────────────────────────────────────────

void (async function init(): Promise<void> {
  mountUI();
  initPWA();              // service worker + offline indicator (production only)
  applyFontSize();        // apply saved font size before anything renders
  buildLanguageOptions(); // must precede restoreSettings — it sets .value
  restoreSettings();
  syncConjugationAvailability();
  bindUIState();
  bindClassFilter();
  bindDomainFilter();
  initSectionCollapse();
  bindTableControls();
  bindSettings();
  initShortcuts();
  initListFilter(langSelect?.value ?? 'spanish');
  syncPictureStyleSummary();

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
  // After the first render — greys out languages the database has no rows for.
  void markEmptyLanguages();
})();
