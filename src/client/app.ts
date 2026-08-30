// ── Imports ───────────────────────────────────────────────────────────────────

import { bindTableControls, resolveDirection, syncTableStyleUI } from './modes/table-controls.ts';
import { initPWA } from './utils/pwa.ts';
import { bindStartHandler }                    from './start-handler.ts';
import { bindClassFilter, getSelectedClasses, syncUI as syncClassFilterUI } from './filters/class-filter.ts';
import { initSectionCollapse }                from './filters/section-collapse.ts';
import { bindDomainFilter, getSelectedDomains, updateDomainFilter, reloadDomainFilter } from './filters/domain-filter.ts';
import { bindUIState, bindModeSwitch, getCurrentMode } from './ui/ui-state.ts';
import { buildFilterUI, initListFilter, syncListFilterUI, filterWords } from './filters/word-filters.ts';
import { estimateConjugationSize } from './modes/conjugation/verb-filters.ts';
import { loadWords }                            from './data/data-loader.ts';
import { initTheme }                            from './ui/theme-toggle.ts';
import { mountUI }                              from './ui/ui.ts';
import { initConjControls, setSelectionChangeCallback } from './modes/conjugation/controls.ts';
import type { Word }                            from './types.ts';
import { readString, writeString, remove as removeKey } from './utils/storage.ts';
import { mustGet }                              from './utils/dom.ts';
import { renderMyLists }                        from './modes/my-lists-mode.ts';
import { renderHistory }                        from './modes/history-mode.ts';
import { renderAiChat }                          from './modes/ai-chat-mode.ts';
import { getTriviaQuestions }                    from './data/trivia-questions.ts';
import { getUserTriviaQuestions }                from './data/user-content.ts';
import { renderMyContent }                       from './modes/my-content-mode.ts';
import { LANGUAGES, isoCode, supportsConjugation,
         conjugationUnavailableReason }          from './data/languages.ts';
import { availableLanguages }                    from './data/vocab-source.ts';
import { refreshFilterSelect }                  from './utils/word-lists.ts';
import { Settings, bindSettings, applyFontSize, setOnFilterVisibilityChange, setOnUILanguageChange, refreshStreakReadouts } from './settings.ts';
import { onActivity } from './utils/streak.ts';
import { showToast } from './ui/toast.ts';
import { applyTranslations } from './i18n/index.ts';
import { initShortcuts }                         from './ui/shortcuts-overlay.ts';
import { openLanguagePicker, languagePickerLabel } from './ui/language-picker.ts';
import { openPresetPicker }                      from './ui/preset-picker.ts';
import { setExtraLanguagesApplyHook }            from './filters/presets.ts';
import { currentScope }                          from './filters/filter-scope.ts';
import { MULTI_LANG_MODES, setExtraLanguages }   from './filters/filter-lang.ts';

// ── DOM refs ──────────────────────────────────────────────────────────────────

const langSelect   = document.getElementById('langSelect')   as HTMLSelectElement | null;
const sizeSelect   = document.getElementById('sizeSelect')   as HTMLSelectElement | null;
const langPickerBtn = document.getElementById('langPickerBtn') as HTMLButtonElement | null;
const presetsBtn    = document.getElementById('presetsBtn')    as HTMLButtonElement | null;
const startBtn        = mustGet<HTMLButtonElement>('startBtn');
const output          = mustGet('output');
const tableWrap       = mustGet('tableWrap');
const pictureWrap     = mustGet('pictureWrap');
const triviaWrap      = mustGet('triviaWrap');
const guessBlankWrap  = mustGet('guessBlankWrap');
const sentenceScrambleWrap = mustGet('sentenceScrambleWrap');
const conjugationWrap = mustGet('conjugationWrap');
const myListsWrap     = document.getElementById('myListsWrap');  // optional — page may omit it
const historyWrap     = document.getElementById('historyWrap');  // optional — page may omit it
const chatWrap        = document.getElementById('chatWrap');     // optional — page may omit it
const myContentWrap   = document.getElementById('myContentWrap'); // optional — page may omit it

// Sections (hidden/shown by mode switch — mustGet throws if HTML template drifts)
const tableArea       = mustGet('tableArea');
const pictureArea     = mustGet('pictureArea');
const triviaArea      = mustGet('triviaArea');
const guessBlankArea  = mustGet('guessBlankArea');
const sentenceScrambleArea = mustGet('sentenceScrambleArea');
const conjugationArea = mustGet('conjugationArea');
const myListsArea     = mustGet('myListsArea');
const historyArea     = mustGet('historyArea');
const settingsArea    = mustGet('settingsArea');
const chatArea        = mustGet('chatArea');
const myContentArea   = mustGet('myContentArea');

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

// ── Word pool mode: Top N / Rank Range / Level ──────────────────────────────
//
// Three ways to pick which words are in play, selected via #poolModeToggle.
// Top N (the original behaviour) stays the default; Rank Range and Level are
// each just another way to narrow the same rank-sorted pool before the
// Part-of-Speech filter and every downstream filter (List/Domain/Class) run.

export type PoolMode = 'topn' | 'range' | 'band';

function getPoolMode(): PoolMode {
  const active = document.querySelector<HTMLElement>('#poolModeToggle .sort-order-btn.active');
  const v = active?.dataset.pool;
  return v === 'range' || v === 'band' ? v : 'topn';
}

function getRankRange(): { from: number; to: number } {
  const fromEl = document.getElementById('rankFrom') as HTMLInputElement | null;
  const toEl   = document.getElementById('rankTo')   as HTMLInputElement | null;
  const from = Math.max(1, Number(fromEl?.value) || 1);
  const to   = Math.max(1, Number(toEl?.value) || from);
  return from <= to ? { from, to } : { from: to, to: from };
}

function getSelectedBands(): string[] {
  return Array.from(document.querySelectorAll<HTMLElement>('#bandChips .pos-chip.active'))
    .map(b => b.dataset.band)
    .filter((b): b is string => !!b);
}

/** Apply the "Rank Range" pool mode and the Part-of-Speech filter to one sorted pool. */
// My Content words (data/user-content.ts's toWord()) are given rank 0 — no
// real vocabulary word has a rank below 1 — specifically so they can be
// recognized here and let through regardless of which pool mode is active.
// Without this, a user-added word satisfied Top N (rank 0 sorts first) but
// silently failed both Rank Range (0 is below every "from") and Level (no
// frequency.band at all), which are just as much the "put my word in the
// pool" a learner asked for as Top N is.
function isUserAdded(w: Word): boolean { return w.rank === 0; }

function rangeSlice(sorted: Word[], from: number, to: number, selected: string[]): Word[] {
  const inRange = sorted.filter(w => isUserAdded(w) || (w.rank != null && w.rank >= from && w.rank <= to));
  return selected.length === 0 ? inRange : inRange.filter(w => w.pos == null || selected.includes(w.pos));
}

/** Apply the "Level" (CEFR band) pool mode and the Part-of-Speech filter to one sorted pool. */
function bandSlice(sorted: Word[], bands: string[], selected: string[]): Word[] {
  if (bands.length === 0) return [];
  const inBand = sorted.filter(w => isUserAdded(w) || (w.frequency?.band && bands.includes(w.frequency.band)));
  return selected.length === 0 ? inBand : inBand.filter(w => w.pos == null || selected.includes(w.pos));
}

function syncPoolModeUI(): void {
  const mode = getPoolMode();
  const topNRow      = document.getElementById('topNRow');
  const rankRangeRow = document.getElementById('rankRangeRow');
  const bandRow       = document.getElementById('bandRow');
  if (topNRow)      topNRow.style.display      = mode === 'topn'  ? '' : 'none';
  if (rankRangeRow) rankRangeRow.style.display = mode === 'range' ? '' : 'none';
  if (bandRow)       bandRow.style.display       = mode === 'band'  ? '' : 'none';
}

// ── Conjugation: live pre-quiz card-count estimate ──────────────────────────
//
// Conjugation multiplies verbs × tenses into cards, and with every tense
// selected that can run into the tens of thousands (~56k for "Max" Spanish
// verbs × every tense) before the grid ever renders. This mirrors the verb
// pool start-handler.ts is about to build (verb-only, isOwnInfinitive,
// hasAnyForms, Regularity, then capped/topped-up to #conjSizeSelect's
// target) so the number shown here matches what Start Quiz would actually
// build, not just an approximation of it.

const CONJ_CARD_WARNING_THRESHOLD = 2000;

function refreshConjEstimate(): void {
  const el = document.getElementById('conjSizeEstimate');
  if (!el) return;

  const lang = langSelect?.value ?? 'spanish';
  if (getCurrentMode() !== 'conjugation' || !supportsConjugation(lang)) {
    el.textContent = '';
    return;
  }

  const conjSizeSelect = document.getElementById('conjSizeSelect') as HTMLSelectElement | null;
  const requested = conjSizeSelect?.value === 'max' ? Infinity : Number(conjSizeSelect?.value) || 100;

  const extras   = getExtraLanguages();
  const fullLang = extras.length > 0 ? [lang, ...extras].join('+') : lang;
  const pool     = filterWords(getAllWordsForCurrentLang());
  const estimate = estimateConjugationSize(pool, fullLang, extras, requested, Settings.getConjRegularityScope());

  const verbs = estimate.verbs;
  const cards = estimate.cards;

  el.textContent = `≈ ${verbs.toLocaleString()} verb${verbs === 1 ? '' : 's'} × `
    + `${estimate.tenses} tense${estimate.tenses === 1 ? '' : 's'} = ${cards.toLocaleString()} cards`;
  el.classList.toggle('conj-size-estimate--warning', cards > CONJ_CARD_WARNING_THRESHOLD);
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
  const conjSizeSelect = document.getElementById('conjSizeSelect') as HTMLSelectElement | null;
  if (conjSizeSelect) { const v = S.get('vq_conj_size'); if (v) conjSizeSelect.value = v; }
  const conjRandomTableSize = document.getElementById('conjRandomTableSize') as HTMLSelectElement | null;
  if (conjRandomTableSize) { const v = S.get('vq_conj_random_table_size'); if (v) conjRandomTableSize.value = v; }
  const conjRandomTableSizeCustom = document.getElementById('conjRandomTableSizeCustom') as HTMLInputElement | null;
  if (conjRandomTableSizeCustom && conjRandomTableSize?.value === 'custom') {
    conjRandomTableSizeCustom.value         = S.get('vq_conj_random_table_size_custom') ?? '';
    conjRandomTableSizeCustom.style.display = 'inline-block';
  }

  // Extra languages (Table mode's "+ Languages" picker). A saved choice that
  // matches the restored primary language is dropped — comparing a language
  // with itself is meaningless, and the primary could have changed since.
  const savedExtras = S.get('vq_extra_langs');
  extraLanguages = new Set(
    (savedExtras ? savedExtras.split(',') : []).filter(name => name && name !== langSelect?.value),
  );
  setExtraLanguages(extraLanguages);
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

  // Word pool mode (Top N / Rank Range / Level) and its own inputs
  const savedPoolMode = S.get('vq_pool_mode');
  if (savedPoolMode) {
    document.querySelectorAll<HTMLElement>('#poolModeToggle .sort-order-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.pool === savedPoolMode);
    });
  }
  const rankFrom = document.getElementById('rankFrom') as HTMLInputElement | null;
  const rankTo   = document.getElementById('rankTo')   as HTMLInputElement | null;
  const savedFrom = S.get('vq_rank_from');
  const savedTo   = S.get('vq_rank_to');
  if (rankFrom && savedFrom) rankFrom.value = savedFrom;
  if (rankTo && savedTo)     rankTo.value   = savedTo;
  const savedBands = new Set((S.get('vq_bands') ?? '').split(',').filter(Boolean));
  document.querySelectorAll<HTMLElement>('#bandChips .pos-chip').forEach(b => {
    b.classList.toggle('active', !!b.dataset.band && savedBands.has(b.dataset.band));
  });
  syncPoolModeUI();

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

  // Trivia answer style
  const savedTriviaStyle = S.get('vq_trivia_style');
  if (savedTriviaStyle) {
    document.querySelectorAll<HTMLElement>('#triviaSubMode .conj-toggle-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.mode === savedTriviaStyle);
    });
  }

  // Trivia category
  const savedTriviaCategory = S.get('vq_trivia_category');
  if (savedTriviaCategory) {
    document.querySelectorAll<HTMLElement>('#triviaCategory .conj-toggle-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.category === savedTriviaCategory);
    });
  }

  // Trivia difficulty
  const savedTriviaDifficulty = S.get('vq_trivia_difficulty');
  if (savedTriviaDifficulty) {
    document.querySelectorAll<HTMLElement>('#triviaDifficulty .conj-toggle-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.difficulty === savedTriviaDifficulty);
    });
  }

  // Trivia reading difficulty / reading length
  const savedTriviaReadingDifficulty = S.get('vq_trivia_reading_difficulty');
  if (savedTriviaReadingDifficulty) {
    document.querySelectorAll<HTMLElement>('#triviaReadingDifficulty .conj-toggle-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.readingDifficulty === savedTriviaReadingDifficulty);
    });
  }
  const savedTriviaReadingLength = S.get('vq_trivia_reading_length');
  if (savedTriviaReadingLength) {
    document.querySelectorAll<HTMLElement>('#triviaReadingLength .conj-toggle-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.readingLength === savedTriviaReadingLength);
    });
  }

  // Guess the Blank difficulty
  const savedGbDifficulty = S.get('vq_guess_blank_difficulty');
  if (savedGbDifficulty) {
    document.querySelectorAll<HTMLElement>('#guessBlankDifficulty .conj-toggle-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.difficulty === savedGbDifficulty);
    });
  }

  // Conjugation Card Match pairing style
  const savedMatchPairing = S.get('vq_conj_match_pairing');
  if (savedMatchPairing) {
    document.querySelectorAll<HTMLElement>('#conjMatchStyleToggle .conj-toggle-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.pairing === savedMatchPairing);
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
    // `??`, not `||`: a My Content word's rank is 0 (see data/user-content.ts's
    // toWord()) specifically so it sorts first — `||` treats 0 as falsy and
    // sent it to the very back instead, alongside genuinely unranked words.
    allWordsByLang[lang] = raw.slice().sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999));
  }
  return allWordsByLang[lang];
}

/** Every word already loaded for the active language(s) — unsized, unfiltered. */
function getAllWordsForCurrentLang(): Word[] {
  const primary = langSelect?.value ?? 'spanish';
  const extras  = getExtraLanguages();
  if (extras.length === 0) return allWordsByLang[primary] || [];
  return [primary, ...extras].flatMap(l => (allWordsByLang[l] || []).map(w => ({ ...w, language: l })));
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
  const poolMode = getPoolMode();

  /** One pool (already rank-sorted) → the base list, per the active pool mode. */
  function poolSlice(pool: Word[], share: number): Word[] {
    if (poolMode === 'range') {
      const { from, to } = getRankRange();
      return rangeSlice(pool, from, to, selected);
    }
    if (poolMode === 'band') {
      return bandSlice(pool, getSelectedBands(), selected);
    }
    return sizedSlice(pool, share, isMax, selected);
  }

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
    // still read like "Top 1000", not "Top 1000 per language". Rank Range and
    // Level aren't a count to split — each language's pool is filtered by the
    // same range/band independently instead.
    const share = isMax ? Infinity : Math.max(1, Math.floor(size / allLangs.length));
    currentBaseList = tagged.flatMap(pool => poolSlice(pool, share));
  } else {
    sorted = primarySorted;
    currentBaseList = poolSlice(sorted, size);
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

  // Trivia doesn't draw from `sorted`/`list` at all — its Domains pills come
  // from the trivia question bank instead (updateTriviaDomainFilter), so the
  // vocabulary-count repaint above would be wrong there. Checked once, here,
  // at the end of the one function every filter-rebuild path already funnels
  // through, rather than after each of that function's call sites — a
  // caller that forgets to ask for it is no longer possible, whereas asking
  // each caller to remember already left more than one that didn't.
  if (getCurrentMode() === 'trivia') updateTriviaDomainFilter();

  refreshConjEstimate();
}

/**
 * Trivia's own domain-count computation, mirroring loadAndBuildFilters'
 * word-domain counting above — but counting the trivia question bank
 * (data/trivia-questions.ts's `domains` field) instead of vocabulary words,
 * since Trivia doesn't draw from `list` at all. Called from the end of
 * loadAndBuildFilters() itself (see above) whenever Trivia is the active
 * mode, and from onActivate.trivia below for the one path that doesn't go
 * through loadAndBuildFilters — activating the tab without a language change.
 */
function updateTriviaDomainFilter(): void {
  const lang = langSelect?.value ?? 'spanish';
  const domainCounts = new Map<string, number>();
  for (const q of [...getTriviaQuestions(lang), ...getUserTriviaQuestions(lang)]) {
    for (const d of q.domains ?? []) {
      domainCounts.set(d, (domainCounts.get(d) ?? 0) + 1);
    }
  }
  const sortedCounts = [...domainCounts.entries()]
    .map(([domain, count]) => ({ domain, count }))
    .filter(x => x.count > 0)
    .sort((a, b) => b.count - a.count);
  updateDomainFilter(sortedCounts);
}

// ── Core module bindings ──────────────────────────────────────────────────────

initTheme();
setSelectionChangeCallback(refreshConjEstimate);

// A saved Testing Profile's "+ Languages" selection has to reach this
// module's own `extraLanguages` (the merged-pool copy — distinct from
// filter-lang.ts's, which only drives the Lists filter's display) and the
// picker button's label, the same three things langPickerBtn's own onChange
// below updates. presets.ts can't call any of this directly without an
// app.ts → presets.ts → app.ts cycle, so it exposes a hook instead.
setExtraLanguagesApplyHook(langs => {
  extraLanguages = new Set(langs.filter(name => name !== (langSelect?.value ?? 'spanish')));
  setExtraLanguages(extraLanguages);
  S.set('vq_extra_langs', [...extraLanguages].join(','));
  updateLangPickerButton();
  void loadAndBuildFilters(langSelect?.value ?? 'spanish');
  if (document.querySelector('.mode-tab.active')?.getAttribute('data-mode') === 'conjugation') {
    initConjControls(langSelect?.value ?? 'spanish', getExtraLanguages());
  }
});

const { updateModeUI } = bindModeSwitch({
  tableArea, pictureArea, conjugationArea,
  extraAreas: {
    mylists: myListsArea, settings: settingsArea, history: historyArea,
    trivia: triviaArea, guessBlank: guessBlankArea, chat: chatArea,
    myContent: myContentArea, sentenceScramble: sentenceScrambleArea,
  },
  onActivate: {
    table: syncTableStyleUI,
    conjugation: () => {
      initConjControls(langSelect?.value || 'spanish', getExtraLanguages());
      syncConjViewToggle();
      refreshConjEstimate();
    },
    // Re-rendered fresh on every visit so a session finished elsewhere always
    // shows up, and so does a list created elsewhere — e.g. a cross-language
    // list started from the star button on a word in Table mode, which My
    // Lists' own state has no way to hear about otherwise.
    history: () => { if (historyWrap) renderHistory(historyWrap, langSelect?.value ?? 'spanish'); },
    mylists: () => { if (myListsWrap) renderMyLists(myListsWrap as HTMLElement); },
    // Built fresh per visit like History — cheap, and avoids keeping a stale
    // chat session's DOM alive underneath a tab that's dev/desktop-only anyway.
    chat: () => { if (chatWrap) renderAiChat(chatWrap, langSelect?.value ?? 'spanish'); },
    trivia: updateTriviaDomainFilter,
    // Built fresh per visit like History/My Lists — cheap, and a word/trivia
    // question/picture added elsewhere in this same session (there isn't
    // one yet, but a future entry point would be) always shows up.
    myContent: () => { if (myContentWrap) renderMyContent(myContentWrap, langSelect?.value ?? 'spanish'); },
    settings: refreshStreakReadouts,
  },
});

// Fired from inside session-history.ts's saveSession(), for any mode, any
// language — a celebration toast belongs here rather than in every mode's
// own "session ended" handler. Also refreshes the Settings tab's readouts
// in case it's already open when a session elsewhere finishes.
onActivity(({ streak, streakIncrementedJustNow, goalHitJustNow }) => {
  if (streakIncrementedJustNow) showToast(`🔥 ${streak}-day streak!`, 'success');
  if (goalHitJustNow) showToast('🎯 Daily goal reached!', 'success');
  refreshStreakReadouts();
});

// A "hide this filter app-wide" Settings toggle needs the currently-visible
// mode's filter boxes re-synced immediately, not just on the next tab
// switch — same updateModeUI() a tab click already runs. `false` skips the
// active-tab scrollIntoView() that a real tab click wants — the active tab
// isn't changing here, it's the Settings tab itself, sitting in the top nav,
// and scrolling it into view mid-click is what yanked the page back up.
setOnFilterVisibilityChange(() => updateModeUI(false));

// Apply the saved UI language to the static chrome on load, and again live
// whenever the App language setting changes — see i18n/index.ts.
applyTranslations();
setOnUILanguageChange(() => applyTranslations());

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
  // Conjugation reads its own verb-scaled control (#conjSizeSelect) instead
  // of the vocabulary-wide Words control — see ui-state.ts, which swaps the
  // two controls' visibility. Rank Range and Level pool modes already produce
  // the exact final pool in currentBaseList (see loadAndBuildFilters's
  // poolSlice) — Infinity/'window' tells start-handler.ts's top-up/hard-cap
  // logic (written for Top N's "count" semantics) to leave that pool alone
  // rather than reslicing it.
  getSize: () => {
    if (getCurrentMode() === 'conjugation') {
      const conjSizeSelect = document.getElementById('conjSizeSelect') as HTMLSelectElement | null;
      return conjSizeSelect?.value === 'max' ? Infinity : Number(conjSizeSelect?.value) || 100;
    }
    if (getPoolMode() !== 'topn') return Infinity;
    return sizeSelect?.value === 'max'
      ? Infinity
      : sizeSelect?.value === 'custom'
        ? Number((document.getElementById('sizeCustom') as HTMLInputElement)?.value) || 100
        : Number(sizeSelect?.value) || 100;
  },
  getSelectedClasses,
  getSelectedDomains,
  getSortOrder: () => {
    const active = document.querySelector<HTMLElement>('#sortOrderToggle .sort-order-btn.active');
    return active?.dataset.order ?? 'frequency';
  },
  getSizeMode: () => {
    if (getCurrentMode() === 'conjugation') return 'window';
    if (getPoolMode() !== 'topn') return 'window';
    const active = document.querySelector<HTMLElement>('#sizeModeToggle .sort-order-btn.active');
    return (active?.dataset.mode ?? 'window') as 'window' | 'fill';
  },
  getCols: ({ max, fallback }: { max: number; fallback: number }) =>
    Math.max(1, Math.min(max, Settings.getTableCols() || fallback)),
  getDirection:   resolveDirection,
  onModeChange:   updateModeUI,
  getBaseList:    () => currentBaseList,
  // The size-window top-up logic (start-handler.ts) pulls from here when a
  // narrowing filter — verbs-only, illustrated-only — leaves the sized list
  // short. Needs the same per-word `.language` tagging loadAndBuildFilters
  // already gives `currentBaseList`, or a top-up word in a merged session
  // falls back to the render's own (possibly combined) `lang` prop instead
  // of its real language — table-controls.ts and conjugation/index.ts both
  // read `w.language ?? lang` for mastery/history and per-verb tense
  // filtering, and a bogus combined fallback breaks both silently.
  getAllWords: getAllWordsForCurrentLang,
  elements:       { startBtn, tableWrap, pictureWrap, triviaWrap, guessBlankWrap, sentenceScrambleWrap, conjugationWrap, output },
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

presetsBtn?.addEventListener('click', () => {
  openPresetPicker({
    anchorEl: presetsBtn,
    mode:     currentScope(),
    // applyPreset() already repaints the filter panels it touched
    // (refreshFilterSelect/syncListFilterUI); this just refreshes the one
    // thing outside them that also depends on the filter selection.
    onApply:  refreshConjEstimate,
  });
});

langPickerBtn?.addEventListener('click', () => {
  openLanguagePicker({
    anchorEl:  langPickerBtn,
    exclude:   langSelect?.value ?? 'spanish',
    selected:  extraLanguages,
    available: dataAvailableLanguages ? new Set(dataAvailableLanguages) : null,
    onChange: updated => {
      extraLanguages = updated;
      setExtraLanguages(extraLanguages);
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

const conjSizeSelectEl = document.getElementById('conjSizeSelect') as HTMLSelectElement | null;
conjSizeSelectEl?.addEventListener('change', () => {
  S.set('vq_conj_size', conjSizeSelectEl.value);
  refreshConjEstimate();
});

const conjRandomTableSizeEl       = document.getElementById('conjRandomTableSize') as HTMLSelectElement | null;
const conjRandomTableSizeCustomEl = document.getElementById('conjRandomTableSizeCustom') as HTMLInputElement | null;
conjRandomTableSizeEl?.addEventListener('change', () => {
  S.set('vq_conj_random_table_size', conjRandomTableSizeEl.value);
  if (conjRandomTableSizeCustomEl) {
    conjRandomTableSizeCustomEl.style.display = conjRandomTableSizeEl.value === 'custom' ? 'inline-block' : 'none';
    if (conjRandomTableSizeEl.value === 'custom') conjRandomTableSizeCustomEl.focus();
  }
});
conjRandomTableSizeCustomEl?.addEventListener('input', () => {
  S.set('vq_conj_random_table_size_custom', conjRandomTableSizeCustomEl.value);
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

// Pool mode toggle (Top N / Rank Range / Level)
document.getElementById('poolModeToggle')?.addEventListener('click', e => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>('.sort-order-btn');
  if (!btn?.dataset.pool) return;
  document.querySelectorAll('#poolModeToggle .sort-order-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  S.set('vq_pool_mode', btn.dataset.pool);
  syncPoolModeUI();
  void loadAndBuildFilters(langSelect?.value ?? 'spanish');
});

// Rank Range inputs
['rankFrom', 'rankTo'].forEach(id => {
  document.getElementById(id)?.addEventListener('change', () => {
    const { from, to } = getRankRange();
    S.set('vq_rank_from', String(from));
    S.set('vq_rank_to', String(to));
    if (getPoolMode() === 'range') void loadAndBuildFilters(langSelect?.value ?? 'spanish');
  });
});

// Level (CEFR band) chips — independent multi-select, unlike the segmented toggles above
document.getElementById('bandChips')?.addEventListener('click', e => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.pos-chip');
  if (!btn?.dataset.band) return;
  btn.classList.toggle('active');
  S.set('vq_bands', getSelectedBands().join(','));
  if (getPoolMode() === 'band') void loadAndBuildFilters(langSelect?.value ?? 'spanish');
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
  // (loadAndBuildFilters() itself repaints Trivia's Domains pills correctly
  // once this resolves — see its own trailing getCurrentMode() check.)
  void loadAndBuildFilters(lang);
});

// ── Conjugation view (Grid / Full Conjugation / One at a Time / Card Match) ───
//
// Bound here as well as inside conjugation mode, because the toggle lives in
// the controls bar and can be clicked before a quiz has started — at which
// point nothing in conjugation/index.ts is listening yet. Without this the
// button did not light up and the choice was never stored, so Start Quiz used
// whatever was last saved: the control said one thing and the quiz did another.
//
// This handler owns the stored value and the active class. The one in
// conjugation mode owns rebuilding the cards, and only runs while a quiz is on
// screen. One at a Time and Card Match are rendered by their own modules
// entirely (see start-handler.ts) — nothing in conjugation/index.ts ever sees
// those two values.
const CONJ_VIEWS = new Set(['grid', 'full', 'oneatatime', 'randomtable', 'cardmatch']);

function syncConjViewToggle(): void {
  const raw = readString('vq_conj_view');
  const stored = raw && CONJ_VIEWS.has(raw) ? raw : 'grid';
  document.querySelectorAll<HTMLElement>('#conjViewToggle .conj-toggle-btn')
    .forEach(b => b.classList.toggle('active', b.dataset.view === stored));
  const onConjTab = document.querySelector('.mode-tab.active')?.getAttribute('data-mode') === 'conjugation';

  // Match's pairing-style picker only means anything in Card Match view.
  const matchGroup = document.getElementById('conjMatchStyleGroup');
  if (matchGroup) {
    matchGroup.style.display = stored === 'cardmatch' && onConjTab ? '' : 'none';
  }

  // Target/Both/English only means anything in Grid/Full — one-at-a-time-
  // mode.ts, random-table-mode.ts and card-match-mode.ts never show an
  // English gloss to switch, so the control had no effect there.
  const displayGroup = document.getElementById('conjDisplayGroup');
  if (displayGroup) {
    displayGroup.style.display = (stored === 'grid' || stored === 'full') && onConjTab ? '' : 'none';
  }

  // The "how many blanks" sample-size control only means anything in Random
  // Table — every other view drills the full verb×tense×form cross product,
  // no sampling involved.
  const randomTableSizeGroup = document.getElementById('conjRandomTableSizeGroup');
  if (randomTableSizeGroup) {
    randomTableSizeGroup.style.display = stored === 'randomtable' && onConjTab ? '' : 'none';
  }
}

document.getElementById('conjViewToggle')?.addEventListener('click', e => {
  const btn = (e.target as Element).closest<HTMLElement>('.conj-toggle-btn');
  if (!btn?.dataset.view || !CONJ_VIEWS.has(btn.dataset.view)) return;
  writeString('vq_conj_view', btn.dataset.view);
  syncConjViewToggle();
});

// Settings side nav — expand the target section if it's currently
// collapsed, so jumping to it doesn't land on a header with nothing under
// it. The actual scroll is the browser's own #anchor behaviour; this only
// handles the part that isn't already true of a plain link.
document.querySelector('.settings-nav')?.addEventListener('click', e => {
  const link = (e.target as Element).closest<HTMLAnchorElement>('.settings-nav-link');
  if (!link) return;
  const targetId = link.getAttribute('href')?.slice(1);
  const section = targetId ? document.getElementById(targetId) : null;
  const collapseBtn = section?.querySelector<HTMLButtonElement>('.settings-collapse-btn');
  if (collapseBtn?.getAttribute('aria-expanded') === 'false') collapseBtn.click();
});

document.getElementById('conjMatchStyleToggle')?.addEventListener('click', e => {
  const btn = (e.target as Element).closest<HTMLElement>('.conj-toggle-btn');
  if (!btn?.dataset.pairing) return;
  document.querySelectorAll('#conjMatchStyleToggle .conj-toggle-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  writeString('vq_conj_match_pairing', btn.dataset.pairing);
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

// Trivia answer-style toggle (Type the Answer / Multiple Choice).
document.getElementById('triviaSubMode')?.addEventListener('click', e => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>('.conj-toggle-btn');
  if (!btn) return;
  document.querySelectorAll('#triviaSubMode .conj-toggle-btn')
    .forEach(b => b.classList.toggle('active', b === btn));
  if (btn.dataset.mode) S.set('vq_trivia_style', btn.dataset.mode);
});

// Trivia category toggle (All / History / Pop Culture).
document.getElementById('triviaCategory')?.addEventListener('click', e => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>('.conj-toggle-btn');
  if (!btn) return;
  document.querySelectorAll('#triviaCategory .conj-toggle-btn')
    .forEach(b => b.classList.toggle('active', b === btn));
  if (btn.dataset.category) S.set('vq_trivia_category', btn.dataset.category);
});

// Trivia difficulty toggle (All / Easy / Medium / Hard).
document.getElementById('triviaDifficulty')?.addEventListener('click', e => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>('.conj-toggle-btn');
  if (!btn) return;
  document.querySelectorAll('#triviaDifficulty .conj-toggle-btn')
    .forEach(b => b.classList.toggle('active', b === btn));
  if (btn.dataset.difficulty) S.set('vq_trivia_difficulty', btn.dataset.difficulty);
});

// Trivia reading-difficulty toggle (All / Easy / Medium / Hard).
document.getElementById('triviaReadingDifficulty')?.addEventListener('click', e => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>('.conj-toggle-btn');
  if (!btn) return;
  document.querySelectorAll('#triviaReadingDifficulty .conj-toggle-btn')
    .forEach(b => b.classList.toggle('active', b === btn));
  if (btn.dataset.readingDifficulty) S.set('vq_trivia_reading_difficulty', btn.dataset.readingDifficulty);
});

// Trivia reading-length toggle (All / Short / Long).
document.getElementById('triviaReadingLength')?.addEventListener('click', e => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>('.conj-toggle-btn');
  if (!btn) return;
  document.querySelectorAll('#triviaReadingLength .conj-toggle-btn')
    .forEach(b => b.classList.toggle('active', b === btn));
  if (btn.dataset.readingLength) S.set('vq_trivia_reading_length', btn.dataset.readingLength);
});

// Guess the Blank difficulty toggle (All / Easy / Medium / Hard).
document.getElementById('guessBlankDifficulty')?.addEventListener('click', e => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>('.conj-toggle-btn');
  if (!btn) return;
  document.querySelectorAll('#guessBlankDifficulty .conj-toggle-btn')
    .forEach(b => b.classList.toggle('active', b === btn));
  if (btn.dataset.difficulty) S.set('vq_guess_blank_difficulty', btn.dataset.difficulty);
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
  const savedTab = savedMode
    ? document.querySelector<HTMLElement>(`.mode-tab[data-mode="${savedMode}"]`)
    : null;
  if (savedTab && savedMode !== 'mylists' && savedMode !== 'settings' && savedMode !== 'history' && savedMode !== 'chat' && savedMode !== 'myContent') {
    savedTab.click();
  } else if (savedMode !== 'table') {
    // Covers both "we intentionally skip restoring mylists/settings/history/chat"
    // and "the saved mode no longer has a tab at all" — e.g. 'recall' or
    // 'doubleRecall' from before those tabs were folded into Table.
    // We didn't click a tab, so the page is showing whatever ui-state.ts and
    // index.html both default to — Table. vq_mode drives currentScope() for
    // every filter's chain/bucket logic, so leaving it pointed at the mode we
    // declined to restore desyncs "what's on screen" from "what the filters
    // think is on screen": the chain button reads and writes the stale mode's
    // bucket while the visible tab is Table.
    S.set('vq_mode', 'table');
  }

  if (myListsWrap) renderMyLists(myListsWrap as HTMLElement);

  // Admin and AI Chat tabs are hidden by default — only shown in dev builds.
  // AI Chat additionally stays hidden on narrow/mobile viewports regardless
  // of dev mode — see mode-tabs.css's `.chat-tab` media query — since a
  // local model is desktop-hardware territory.
  if (import.meta.env.DEV) {
    document.querySelector<HTMLElement>('a.admin-tab')?.removeAttribute('hidden');
    document.querySelector<HTMLElement>('.chat-tab')?.removeAttribute('hidden');
  }

  updateModeUI();
  await loadAndBuildFilters(langSelect?.value ?? 'spanish');
  // After the first render — greys out languages the database has no rows for.
  void markEmptyLanguages();
})();
