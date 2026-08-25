// ── Imports ───────────────────────────────────────────────────────────────────

import { bindTableControls, resolveDirection } from './modes/table-controls.ts';
import { initPWA } from './utils/pwa.ts';
import { bindQuizControls }                    from './quiz/quiz-controls.ts';
import { bindStartHandler }                    from './start-handler.ts';
import { bindClassFilter, getSelectedClasses, syncUI as syncClassFilterUI } from './filters/class-filter.ts';
import { initSectionCollapse }                from './filters/section-collapse.ts';
import { bindDomainFilter, getSelectedDomains, updateDomainFilter, reloadDomainFilter } from './filters/domain-filter.ts';
import { bindUIState, bindModeSwitch }          from './ui/ui-state.ts';
import { buildFilterUI, initListFilter, syncListFilterUI } from './filters/word-filters.ts';
import { loadWords }                            from './data/data-loader.ts';
import { initTheme }                            from './ui/theme-toggle.ts';
import { mountUI }                              from './ui/ui.ts';
import { initConjControls }                     from './modes/conjugation/controls.ts';
import type { Word }                            from './types.ts';
import { readString, writeString, remove as removeKey } from './utils/storage.ts';
import { mustGet }                              from './utils/dom.ts';
import { renderMyLists }                        from './modes/my-lists-mode.ts';
import { renderHistory }                        from './modes/history-mode.ts';
import { LANGUAGES, isoCode, supportsConjugation,
         conjugationUnavailableReason }          from './data/languages.ts';
import { availableLanguages }                    from './data/vocab-source.ts';
import { refreshFilterSelect }                  from './utils/word-lists.ts';
import { Settings, bindSettings, applyFontSize } from './settings.ts';
import { initShortcuts }                         from './ui/shortcuts-overlay.ts';
import { openLanguagePicker, languagePickerLabel } from './ui/language-picker.ts';

// ── DOM refs ──────────────────────────────────────────────────────────────────

const langSelect   = document.getElementById('langSelect')   as HTMLSelectElement | null;
const sizeSelect   = document.getElementById('sizeSelect')   as HTMLSelectElement | null;
const langPickerBtn = document.getElementById('langPickerBtn') as HTMLButtonElement | null;
const startBtn        = mustGet<HTMLButtonElement>('startBtn');
const output          = mustGet('output');
const tableWrap       = mustGet('tableWrap');
const recallWrap      = mustGet('recallWrap');
const pictureWrap     = mustGet('pictureWrap');
const conjugationWrap = mustGet('conjugationWrap');
const myListsWrap     = document.getElementById('myListsWrap');  // optional — page may omit it
const historyWrap     = document.getElementById('historyWrap');  // optional — page may omit it

// Sections (hidden/shown by mode switch — mustGet throws if HTML template drifts)
const quizArea        = mustGet('quizArea');
const tableArea       = mustGet('tableArea');
const recallArea      = mustGet('recallArea');
const pictureArea     = mustGet('pictureArea');
const conjugationArea = mustGet('conjugationArea');
const myListsArea     = mustGet('myListsArea');
const historyArea     = mustGet('historyArea');
const settingsArea    = mustGet('settingsArea');

// ── Constants ─────────────────────────────────────────────────────────────────
// The language list and its per-language capabilities live in
// data/languages.ts — see isoCode / supportsConjugation below.

// ── Session state persistence (vq_ prefix = per-session UI state) ─────────────

const S = {
  get: (k: string)            => readString(k),
  set: (k: string, v: string) => { writeString(k, v); },
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
function buildLanguageOptions(withData: string[] | null = null, select: HTMLSelectElement | null = langSelect): void {
  if (!select) return;
  const previous = select.value;
  const have     = withData ? new Set(withData) : null;

  select.innerHTML = '';
  for (const lang of LANGUAGES) {
    const missing   = have !== null && !have.has(lang.name);
    const opt       = document.createElement('option');
    opt.value       = lang.name;
    opt.textContent = missing ? `${lang.label} — no data yet` : lang.label;
    opt.disabled    = missing;
    select.appendChild(opt);
  }

  // Don't leave a disabled language selected — a saved choice can outlive the
  // data, and the DB gets rebuilt from scratch often enough for that to happen.
  const stillValid = Boolean(previous) && (have === null || have.has(previous));
  select.value = stillValid ? previous : (LANGUAGES[0]?.name ?? 'spanish');
}

/**
 * Extra languages merged into the primary in Table mode's word pool — the
 * "+ Languages" picker's selection. Persisted sorted (by LANGUAGES order) so
 * the same set always produces the same storage-key string regardless of
 * check order — see getFullLang below.
 */
let extraLanguages = new Set<string>();

/** Which languages the database actually has rows for — see markEmptyLanguages. */
let dataAvailableLanguages: string[] | null = null;

function updateLangPickerButton(): void {
  if (!langPickerBtn) return;
  // Filtered, not the raw set — if the primary language changes to match a
  // checked extra, that extra silently drops out and the label should say so.
  const active = new Set(LANGUAGES.map(l => l.name).filter(n => n !== langSelect?.value && extraLanguages.has(n)));
  langPickerBtn.textContent = languagePickerLabel(active);
  langPickerBtn.classList.toggle('lang-picker-btn--active', active.size > 0);
}

/** Modes that know how to render/score a mixed-language word list. */
const MULTI_LANG_MODES = new Set(['table', 'recall', 'conjugation']);

/**
 * The extra languages currently in effect. Gated on the active tab rather
 * than just the picker's own state, since a selection made on one of the
 * multi-language modes stays in `extraLanguages` (just visually hidden) if
 * the user switches to a mode that doesn't support a merge without clearing
 * it.
 */
function getExtraLanguages(): string[] {
  const activeMode = document.querySelector('.mode-tab.active')?.getAttribute('data-mode');
  if (!activeMode || !MULTI_LANG_MODES.has(activeMode)) return [];
  const primary = langSelect?.value;
  return LANGUAGES
    .map(l => l.name)
    .filter(name => name !== primary && extraLanguages.has(name));
}

/**
 * Ask the server (or the bundled manifest) which languages have data and mark
 * the rest. Runs after the first render so the dropdown isn't waiting on it.
 */
async function markEmptyLanguages(): Promise<void> {
  const have = await availableLanguages();
  if (!have) return;                       // couldn't tell — leave everything on
  dataAvailableLanguages = have;
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

  // Extra languages (Table mode's "+ Languages" picker). A saved choice that
  // matches the restored primary language is dropped — comparing a language
  // with itself is meaningless, and the primary could have changed since.
  const savedExtras = S.get('vq_extra_langs');
  extraLanguages = new Set(
    (savedExtras ? savedExtras.split(',') : []).filter(name => name && name !== langSelect?.value),
  );
  updateLangPickerButton();

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

async function ensureLoaded(lang: string): Promise<Word[]> {
  if (!allWordsByLang[lang]) {
    const raw = await loadWords(lang);
    allWordsByLang[lang] = raw.slice().sort((a, b) => (a.rank || 9999) - (b.rank || 9999));
  }
  return allWordsByLang[lang];
}

/** Apply the "Words" size control and the Part-of-Speech filter to one sorted pool. */
function sizedSlice(sorted: Word[], size: number, isMax: boolean, selected: string[]): Word[] {
  return selected.length === 0
    ? (isMax ? sorted.slice() : sorted.slice(0, size))
    : sorted.filter((w) => w.pos == null || selected.includes(w.pos)).slice(0, size);
}

async function loadAndBuildFilters(lang: string): Promise<void> {
  const primarySorted = await ensureLoaded(lang);

  const isMax    = sizeSelect?.value === 'max';
  const size     = isMax
    ? Infinity
    : sizeSelect?.value === 'custom'
      ? Number((document.getElementById('sizeCustom') as HTMLInputElement)?.value) || 100
      : Number(sizeSelect?.value) || 100;
  const selected = getSelectedClasses();

  const extras = getExtraLanguages();
  let sorted: Word[];

  if (extras.length > 0) {
    const allLangs = [lang, ...extras];
    const pools     = [primarySorted, ...await Promise.all(extras.map(ensureLoaded))];
    // Tag each word with its source language so table mode (and mastery,
    // history, TTS, list-picker within it) can tell merged languages' words
    // apart. allWordsByLang itself is left untagged — only these merged-pool
    // copies carry `.language`.
    const tagged = allLangs.map((l, i) => pools[i].map(w => ({ ...w, language: l })));
    sorted = tagged.flat();

    // Split the configured size evenly across however many languages are
    // active rather than concatenating full lists — "Top 1000" merged should
    // still read like "Top 1000", not "Top 1000 per language".
    const share = isMax ? Infinity : Math.max(1, Math.floor(size / allLangs.length));
    currentBaseList = tagged.flatMap(pool => sizedSlice(pool, share, isMax, selected));
  } else {
    sorted = primarySorted;
    currentBaseList = sizedSlice(sorted, size, isMax, selected);
  }

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
  extraAreas: { mylists: myListsArea, settings: settingsArea, history: historyArea },
  onActivate: {
    conjugation: () => initConjControls(langSelect?.value || 'spanish', getExtraLanguages()),
    // Re-rendered fresh on every visit so a session finished elsewhere always
    // shows up, and so does a list created elsewhere — e.g. a cross-language
    // list started from the star button on a word in Table or Recall mode,
    // which My Lists' own state has no way to hear about otherwise.
    history: () => { if (historyWrap) renderHistory(historyWrap, langSelect?.value ?? 'spanish'); },
    mylists: () => { if (myListsWrap) renderMyLists(myListsWrap as HTMLElement); },
  },
});

const { showCurrent } = bindQuizControls({
  getLang: () => isoCode(langSelect?.value),
});

bindStartHandler({
  getLang:     () => isoCode(langSelect?.value),
  // A merged multi-language session gets a combined identifier so its own
  // top-level quiz-state storage key doesn't collide with any single
  // language's key. Every actual mastery/history/list write still goes to
  // the real per-word language — see table-controls.ts's recordMastery.
  getFullLang: () => {
    const primary = langSelect?.value ?? 'spanish';
    const extras   = getExtraLanguages();
    return extras.length > 0 ? [primary, ...extras].join('+') : primary;
  },
  getExtraLanguages,
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
  // The size-window top-up logic (start-handler.ts) pulls from here when a
  // narrowing filter — verbs-only, illustrated-only — leaves the sized list
  // short. Needs the same per-word `.language` tagging loadAndBuildFilters
  // already gives `currentBaseList`, or a top-up word in a merged session
  // falls back to the render's own (possibly combined) `lang` prop instead
  // of its real language — table-controls.ts and conjugation/index.ts both
  // read `w.language ?? lang` for mastery/history and per-verb tense
  // filtering, and a bogus combined fallback breaks both silently.
  getAllWords: () => {
    const primary = langSelect?.value ?? 'spanish';
    const extras  = getExtraLanguages();
    if (extras.length === 0) return allWordsByLang[primary] || [];
    return [primary, ...extras].flatMap(l => (allWordsByLang[l] || []).map(w => ({ ...w, language: l })));
  },
  elements:       { startBtn, tableWrap, recallWrap, pictureWrap, conjugationWrap, output },
});

// ── Event listeners ───────────────────────────────────────────────────────────

langSelect?.addEventListener('change', () => {
  S.set('vq_lang', langSelect.value);
  syncConjugationAvailability();
  updateLangPickerButton();
  void loadAndBuildFilters(langSelect.value);
  refreshFilterSelect(langSelect.value);
  if (document.querySelector('.mode-tab.active')?.getAttribute('data-mode') === 'conjugation') {
    initConjControls(langSelect.value, getExtraLanguages());
  }
});

langPickerBtn?.addEventListener('click', () => {
  openLanguagePicker({
    anchorEl:  langPickerBtn,
    exclude:   langSelect?.value ?? 'spanish',
    selected:  extraLanguages,
    available: dataAvailableLanguages ? new Set(dataAvailableLanguages) : null,
    onChange: updated => {
      extraLanguages = updated;
      S.set('vq_extra_langs', [...extraLanguages].join(','));
      updateLangPickerButton();
      void loadAndBuildFilters(langSelect?.value ?? 'spanish');
      // Rebuild the tense chip union live if the picker was opened from the
      // Conjugation tab, so a newly-added language's tenses show up without
      // waiting for the next Start Quiz.
      if (document.querySelector('.mode-tab.active')?.getAttribute('data-mode') === 'conjugation') {
        initConjControls(langSelect?.value ?? 'spanish', getExtraLanguages());
      }
    },
  });
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
  // Lists, Part of Speech and Domains are all stored per mode, so the controls
  // are now showing the previous tab's settings. Each has to re-read the bucket
  // for the mode we just moved to; unlinked modes genuinely differ.
  const lang = langSelect?.value ?? 'spanish';
  refreshFilterSelect(lang);
  syncListFilterUI(lang);
  syncClassFilterUI();
  reloadDomainFilter();
  // getExtraLanguages() is gated on the active tab, so the base word pool
  // needs rebuilding on every switch into or out of Table mode — the picker's
  // own selection doesn't change, only whether it currently applies.
  void loadAndBuildFilters(lang);
});

// ── Conjugation view (Grid / Full Conjugation) ────────────────────────────────
//
// Bound here as well as inside conjugation mode, because the toggle lives in
// the controls bar and can be clicked before a quiz has started — at which
// point nothing in conjugation/index.ts is listening yet. Without this the
// button did not light up and the choice was never stored, so Start Quiz used
// whatever was last saved: the control said one thing and the quiz did another.
//
// This handler owns the stored value and the active class. The one in
// conjugation mode owns rebuilding the cards, and only runs while a quiz is on
// screen.
function syncConjViewToggle(): void {
  const stored = readString('vq_conj_view') === 'full' ? 'full' : 'grid';
  document.querySelectorAll<HTMLElement>('#conjViewToggle .conj-toggle-btn')
    .forEach(b => b.classList.toggle('active', b.dataset.view === stored));
}

document.getElementById('conjViewToggle')?.addEventListener('click', e => {
  const btn = (e.target as Element).closest<HTMLElement>('.conj-toggle-btn');
  if (!btn?.dataset.view) return;
  writeString('vq_conj_view', btn.dataset.view === 'full' ? 'full' : 'grid');
  syncConjViewToggle();
});

// Picture sub-mode toggle — now an always-visible control-group (see
// #pictureStyleGroup in index.html), not a collapsible box, so there is no
// header summary to keep in sync any more.
document.getElementById('pictureSubMode')?.addEventListener('click', e => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>('.conj-toggle-btn');
  if (!btn) return;
  document.querySelectorAll('#pictureSubMode .conj-toggle-btn')
    .forEach(b => b.classList.toggle('active', b === btn));
  if (btn.dataset.mode) S.set('vq_picture_style', btn.dataset.mode);
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
  syncConjViewToggle();

  // ── Onboarding card ────────────────────────────────────────────────────────
  const onboardingCard    = document.getElementById('onboardingCard');
  const onboardingDismiss = document.getElementById('onboardingDismiss');
  const showOnboardingBtn = document.getElementById('settingShowOnboarding');

  function showOnboarding(): void {
    onboardingCard?.removeAttribute('hidden');
  }
  function dismissOnboarding(): void {
    onboardingCard?.setAttribute('hidden', '');
    writeString('s_onboarding_seen', '1');
  }

  // Off by default — reachable any time from Settings' "Show onboarding".
  onboardingDismiss?.addEventListener('click', dismissOnboarding);
  showOnboardingBtn?.addEventListener('click', () => {
    removeKey('s_onboarding_seen');
    showOnboarding();
    // Switch back to table mode so the card is visible
    const tableTab = document.querySelector<HTMLElement>('.mode-tab[data-mode="table"]');
    tableTab?.click();
  });

  // Restore active mode tab (must happen after bindModeSwitch set up click handlers)
  const savedMode = S.get('vq_mode');
  if (savedMode && savedMode !== 'mylists' && savedMode !== 'settings' && savedMode !== 'history') {
    const tab = document.querySelector<HTMLElement>(`.mode-tab[data-mode="${savedMode}"]`);
    tab?.click();
  } else if (savedMode !== 'table') {
    // We didn't click a tab, so the page is showing whatever ui-state.ts and
    // index.html both default to — Table. vq_mode drives currentScope() for
    // every filter's chain/bucket logic, so leaving it pointed at the mode we
    // declined to restore desyncs "what's on screen" from "what the filters
    // think is on screen": the chain button reads and writes the stale mode's
    // bucket while the visible tab is Table.
    S.set('vq_mode', 'table');
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
