/**
 * my-content-mode.ts — "My Content" tab: a lite, client-only admin panel.
 *
 * Lets a learner add their own vocabulary words, trivia questions and
 * picture-quiz pictures, and edit or hide parts of real vocabulary words, all
 * stored in this browser's localStorage via data/user-content.ts — never
 * written to the real SQLite database, and never sent anywhere. This is
 * deliberately separate from the real admin panel (admin.html /
 * src/client/admin/*, src/server/routes/admin*), which is
 * dev+localhost+auth gated and writes the actual database; nothing here
 * touches that code path.
 *
 * Every add form is multi-language: one row per app language (LANGUAGES), so
 * adding "cat" can fill in gato/chat/gatto/Katze/kat/猫 in one pass rather
 * than repeating the whole form once per language — and each row is always
 * labeled by language, so it's never ambiguous which language an entry (new
 * or already-added) belongs to. Only rows actually filled in produce an
 * entry; the rest are just left blank.
 *
 * Rebuilt fresh on every visit to the tab (see app.ts's onActivate.myContent),
 * the same way History and My Lists are — cheap, and it means an edit made
 * and then navigated away from is never shown stale. Each section's own
 * collapse state and the search/pictures/word-editor sub-panels' overrides
 * lists still update in place rather than going through that rebuild — see
 * buildSection and the "…rebuilds itself in place" comments below — since a
 * full rebuild on every keystroke-adjacent change would also collapse
 * sections and clear whatever search was in progress.
 */

import { getUserTriviaQuestions, addUserTriviaQuestion, removeUserTriviaQuestion, updateUserTriviaQuestion, getUserGuessBlankQuestions, addUserGuessBlankQuestion, removeUserGuessBlankQuestion, updateUserGuessBlankQuestion, getTriviaQuestionOverride, setTriviaQuestionOverride, removeTriviaQuestionOverride, getGuessBlankQuestionOverride, setGuessBlankQuestionOverride, removeGuessBlankQuestionOverride, getPictureOverrides, getPictureOverride, setPictureOverride, removePictureOverride, isImageOverride, downloadUserContent, applyUserContentImport } from '../data/user-content.ts';
import { getTriviaQuestions, type TriviaQuestion, type TriviaCategory, type TriviaDifficulty, type ReadingDifficulty, type ReadingLength, type AnswerType } from '../data/trivia-questions.ts';
import { getGuessBlankQuestions, type GuessBlankQuestion, type BlankCategory, type BlankDifficulty } from '../data/guess-blank-questions.ts';
import { LANGUAGES, languageInfo, type LanguageInfo } from '../data/languages.ts';
import { createFlagImg } from '../ui/flag-icon.ts';
import { createWordEditor } from '../ui/word-editor/word-editor.ts';
import { createMyContentAdapter, type MyContentAdapterState } from './my-content/word-editor-adapter.ts';
import { getStockImages, getFallbackImageUrl, getFallbackSvgUrl, getFallbackEmoji } from '../data/visual-map.ts';
import { loadWords } from '../data/data-loader.ts';
import { availableLanguages } from '../data/vocab-source.ts';
import { Settings } from '../settings.ts';
import { buildLangBadge } from '../ui/lang-badge.ts';
import { openLanguagePicker } from '../ui/language-picker.ts';
import { readString, writeString, readJson, writeJson, isStringArray } from '../utils/storage.ts';
import { foldKey } from '../utils/match.ts';
import { fillHighlighted } from '../utils/dom.ts';
import { pageSlice, pageCountFor } from './table-controls.ts';
import type { Word } from '../types.ts';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, className?: string, text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

function field(labelText: string, input: HTMLElement): HTMLElement {
  const wrap = el('label', 'mc-field');
  wrap.appendChild(el('span', 'mc-field-label', labelText));
  wrap.appendChild(input);
  return wrap;
}

function textInput(placeholder = '', value = ''): HTMLInputElement {
  const i = el('input', 'mc-input');
  i.type = 'text';
  i.placeholder = placeholder;
  i.value = value;
  return i;
}

function selectInput(options: readonly string[], value?: string): HTMLSelectElement {
  const s = el('select', 'mc-input');
  for (const o of options) {
    const opt = el('option', undefined, o);
    opt.value = o;
    s.appendChild(opt);
  }
  if (value) s.value = value;
  return s;
}

function csv(s: string): string[] {
  return s.split(',').map(x => x.trim()).filter(Boolean);
}

/** One example sentence per line, rather than comma-separated — a sentence
 *  routinely contains commas of its own. */
function lines(s: string): string[] {
  return s.split('\n').map(x => x.trim()).filter(Boolean);
}

function textArea(placeholder = '', value = ''): HTMLTextAreaElement {
  const t = document.createElement('textarea');
  t.className = 'mc-input mc-textarea';
  t.rows = 2;
  t.placeholder = placeholder;
  t.value = value;
  return t;
}

// ── Sort direction (shared by the Trivia / Guess the Blank editors) ─────────

type MCSortDir = 'asc' | 'desc';

/** Ascending/Descending — reuses Settings' own .sort-order-toggle/
 *  .sort-order-btn pill-pair styling (buttons.css) so this reads as the same
 *  kind of control wherever it shows up in the app, rather than a bespoke
 *  one just for this toolbar. Takes just `{ dir }` rather than the full
 *  MCListState so a caller with its own differently-shaped sort state (the
 *  trivia/Guess the Blank editors' own TriviaListState) can reuse this
 *  exact control too, not just the word editors. */
function buildSortDirToggle(state: { dir: MCSortDir }, onChange: () => void): HTMLElement {
  const wrap = el('div', 'sort-order-toggle mc-sort-dir-toggle');
  const ascBtn = el('button', 'sort-order-btn', 'Ascending');
  ascBtn.type = 'button';
  const descBtn = el('button', 'sort-order-btn', 'Descending');
  descBtn.type = 'button';
  function sync(): void {
    ascBtn.classList.toggle('active', state.dir === 'asc');
    descBtn.classList.toggle('active', state.dir === 'desc');
  }
  sync();
  ascBtn.addEventListener('click', () => { state.dir = 'asc'; sync(); onChange(); });
  descBtn.addEventListener('click', () => { state.dir = 'desc'; sync(); onChange(); });
  wrap.append(ascBtn, descBtn);
  return wrap;
}

/** "food" → "Food", "daily_life" → "Daily life" — same capitalization Table
 *  mode's own Domains filter uses (filters/domain-filter.ts's own private
 *  fmt()), reproduced here rather than imported since that module pulls in
 *  a whole quiz-filter-chaining system this lightweight toolbar has no use
 *  for. */
function formatDomainLabel(d: string): string {
  return d.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
}

/** Appends a "Domains" label + one pill per domain actually present in
 *  `counts` (alphabetical by display label, distinct — there's no fixed enum
 *  for domains the way there is for Part of Speech/Level) to `target`. Each
 *  pill shows how many of the words currently in view carry that domain,
 *  and the label itself is capitalized — both matching Table mode's own
 *  Domains filter (.domain-qpick/.domain-qpick-count, domain-filter.css)
 *  rather than this toolbar's plain .pos-chip look, since this is the one
 *  filter here without a small fixed vocabulary a reader would already
 *  recognize the way Verb/Noun/A1/B2 read at a glance. A no-op when
 *  `counts` is empty, so a caller with nothing to filter by doesn't render a
 *  bare "Domains / All" row with nothing underneath it. */
function appendDomainChips(
  target: HTMLElement, counts: Map<string, number>, selected: Set<string>, totalCount: number, onChange: () => void,
): void {
  if (counts.size === 0) return;
  target.appendChild(el('span', 'ml-band-label mc-toolbar-group-label', 'Domains'));

  const allChip = el('button', 'domain-qpick pos-chip-all');
  allChip.type = 'button';
  allChip.append(el('span', undefined, 'All'), el('span', 'domain-qpick-count', String(totalCount)));
  allChip.classList.toggle('active', selected.size === 0);
  allChip.addEventListener('click', () => { selected.clear(); onChange(); });
  target.appendChild(allChip);

  [...counts.keys()]
    .sort((a, b) => formatDomainLabel(a).localeCompare(formatDomainLabel(b)))
    .forEach(domain => {
      const chip = el('button', 'domain-qpick mc-domain-chip');
      chip.type = 'button';
      chip.append(el('span', undefined, formatDomainLabel(domain)), el('span', 'domain-qpick-count', String(counts.get(domain))));
      chip.classList.toggle('active', selected.has(domain));
      chip.addEventListener('click', () => {
        if (selected.has(domain)) selected.delete(domain);
        else selected.add(domain);
        onChange();
      });
      target.appendChild(chip);
    });
}

// ── Shared paginated-list pager (Add a New Word / Edit an Existing Word) ────
//
// Same page-size math as Table mode (table-controls.ts's own pageSlice/
// pageCountFor), so a list here paginates exactly the way that one does —
// not reinvented, just reused for a much shorter list. Styled with Table
// mode's own pager classes (.table-pager/.pager-btn/.pager-status,
// table.css) rather than this file's own, so the two look identical; a
// page-size <select> (.pager-select, controls-bar.css) is the one addition
// Table mode's own pager doesn't have, since that mode sets its page size
// from the WORDS control bar instead.

const MC_PAGE_SIZES = [5, 10, 15] as const;
type MCPageSize = (typeof MC_PAGE_SIZES)[number];

interface ListPager {
  row: HTMLElement;
  /** Repaints prev/next/status for `page` (already clamped by the caller)
   *  against `totalItems`. */
  sync: (page: number, totalItems: number) => void;
  getPageSize: () => MCPageSize;
}

function buildListPager(
  onPageChange: (page: number) => void, onPageSizeChange: () => void, initialPageSize: MCPageSize = 10,
): ListPager {
  const row = el('div', 'mc-list-pager');

  let pageSize: MCPageSize = initialPageSize;
  const sizeSelect = el('select', 'pager-select mc-list-pager-size');
  MC_PAGE_SIZES.forEach(n => sizeSelect.appendChild(new Option(`${n} per page`, String(n))));
  sizeSelect.value = String(pageSize);
  sizeSelect.addEventListener('change', () => {
    pageSize = Number(sizeSelect.value) as MCPageSize;
    onPageSizeChange();
  });

  const nav = el('div', 'table-pager');
  const prevBtn = el('button', 'pager-btn', '←');
  prevBtn.type = 'button';
  prevBtn.setAttribute('aria-label', 'Previous page');
  const status = el('span', 'pager-status');
  const nextBtn = el('button', 'pager-btn', '→');
  nextBtn.type = 'button';
  nextBtn.setAttribute('aria-label', 'Next page');

  let currentPage = 0;
  prevBtn.addEventListener('click', () => onPageChange(Math.max(0, currentPage - 1)));
  nextBtn.addEventListener('click', () => onPageChange(currentPage + 1));
  nav.append(prevBtn, status, nextBtn);
  row.append(sizeSelect, nav);

  function sync(page: number, totalItems: number): void {
    currentPage = page;
    // The size picker stays available even at one page — smaller pages are
    // still a reasonable thing to want before there's enough to actually
    // paginate — only the prev/status/next group hides.
    row.hidden = totalItems === 0;
    const pages = pageCountFor(totalItems, pageSize);
    nav.hidden = pages <= 1;
    prevBtn.disabled = page === 0;
    nextBtn.disabled = page >= pages - 1;
    const first = totalItems === 0 ? 0 : page * pageSize + 1;
    const last  = Math.min((page + 1) * pageSize, totalItems);
    status.textContent = totalItems > 0 ? `Page ${page + 1} of ${pages}  (${first}–${last})` : '';
  }
  return { row, sync, getPageSize: () => pageSize };
}

/** Settings.getMyContentPageSize() reads back a plain number — clamped to
 *  one of buildListPager's own three options rather than trusted outright,
 *  in case a future release narrows MC_PAGE_SIZES and leaves an old saved
 *  value that no longer matches any of them. */
function myContentInitialPageSize(): MCPageSize {
  const n = Settings.getMyContentPageSize();
  return (MC_PAGE_SIZES as readonly number[]).includes(n) ? (n as MCPageSize) : 5;
}

// ── Vocabulary CSV export ────────────────────────────────────────────────────
//
// A client-side twin of routes/admin/export.ts's CSV, built from loadWords()
// (already-loaded, overrides-applied vocab) rather than a server query — the
// packaged Tauri build has no Express behind it at all (vocab-source.ts), and
// the real Admin panel is dev+localhost-gated regardless, so that route was
// never reachable there. This one needs nothing but what the page already has.

function csvEscape(v: unknown): string {
  if (v == null) return '';
  const s = String(v);
  return (s.includes(',') || s.includes('"') || s.includes('\n'))
    ? '"' + s.replace(/"/g, '""') + '"'
    : s;
}

const VOCAB_CSV_HEADERS = [
  'rank', 'word', 'translation', 'glosses', 'pos', 'difficulty', 'tags',
  'notes', 'examples', 'ipa', 'frequency_band', 'gender', 'plural',
  'infinitive', 'reflexive', 'register',
];

function buildVocabCsv(words: Word[]): string {
  const lines = [VOCAB_CSV_HEADERS.join(',')];
  for (const w of words) {
    lines.push([
      csvEscape(w.rank ?? ''),
      csvEscape(w.word),
      csvEscape(w.translation),
      csvEscape(w.glosses.join('|')),
      csvEscape(w.pos),
      csvEscape(w.difficulty),
      csvEscape(w.tags.join('|')),
      csvEscape(w.notes),
      csvEscape(w.examples.join('|')),
      csvEscape(w.linguistic?.ipa),
      csvEscape(w.frequency?.band),
      csvEscape(w.linguistic?.gender),
      csvEscape(w.linguistic?.plural),
      csvEscape(w.linguistic?.infinitive),
      csvEscape(w.linguistic?.reflexive ? 'true' : ''),
      csvEscape(w.linguistic?.register),
    ].join(','));
  }
  return lines.join('\n');
}

async function downloadVocabCsv(lang: string): Promise<void> {
  const words = await loadWords(lang);
  const blob  = new Blob([buildVocabCsv(words)], { type: 'text/csv;charset=utf-8' });
  const url   = URL.createObjectURL(blob);
  const a     = document.createElement('a');
  a.href      = url;
  a.download  = `${lang}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

// ── Language selection ──────────────────────────────────────────────────────
//
// Which languages the add forms show a row for. Shared across Words/Trivia —
// it's "which languages am I working in right now" for the whole tab, not a
// per-section choice — and persisted so it doesn't need re-picking on every
// visit. Defaults to just the language currently selected in the main
// controls bar, rather than all seven, since most learners only study one or
// two at a time.

const LANG_SELECTION_KEY = 'vq_mycontent_langs';

function getSelectedLangs(currentLang: string): Set<string> {
  // No key at all means "never chosen yet" — default to the current study
  // language. A key holding `[]` means the learner deliberately deselected
  // every chip, which has to stay empty rather than snapping back to the
  // default on the next render (languageRows' own empty-state placeholder
  // covers that case).
  if (readString(LANG_SELECTION_KEY) === null) return new Set([currentLang]);
  const stored = readJson<string[]>(LANG_SELECTION_KEY, [], isStringArray)
    .filter(name => LANGUAGES.some(info => info.name === name));
  return new Set(stored);
}

function setSelectedLangs(langs: Set<string>): void {
  writeJson(LANG_SELECTION_KEY, [...langs]);
}

/** "Choose languages…" empty, a couple of names spelled out, or a count past
 *  that — same shape as table mode's own languagePickerLabel (ui/
 *  language-picker.ts), minus its "+ " prefix: that reads as "add a
 *  language" there, but this button already sits right after a spelled-out
 *  "Add content in" label, so the label doesn't need to repeat "add". */
function myContentLangLabel(selected: Set<string>): string {
  if (selected.size === 0) return 'Choose languages…';
  const labels = [...selected].map(name => LANGUAGES.find(l => l.name === name)?.label ?? name);
  if (labels.length <= 2) return labels.join(', ');
  return `${labels.length} languages`;
}

/**
 * "Add content in" trigger button + popover — which languages the forms
 * below show a row for. Reuses table mode's own multi-language popover
 * (ui/language-picker.ts) rather than a bespoke one, so this looks and
 * behaves like the "+ Languages" control learners already know from there.
 *
 * `onApply` — the full tab rebuild every other change in this file uses —
 * runs on the popover's onClose, not its onChange: onChange fires on every
 * single checkbox click while the popover is still open, and that popover
 * is appended to document.body, outside this tab's own container. Rebuilding
 * the container on every click would tear out and replace this very button
 * (the popover's anchor) out from under it while the learner is still
 * picking languages, leaving a floating popover pointed at a button that no
 * longer exists. Deferring to onClose also reads better: pick everything
 * you want, then see the rows update once, instead of a rebuild per click.
 */
function buildLanguagePicker(selected: Set<string>, onApply: () => void): HTMLElement {
  const wrap = el('div', 'mc-lang-dropdown');
  wrap.appendChild(el('span', 'mc-lang-picker-label', 'Add content in'));
  const btn = el('button', 'mc-btn mc-btn--secondary mc-lang-dropdown-btn') as HTMLButtonElement;
  btn.type = 'button';

  function syncLabel(): void {
    btn.textContent = `${myContentLangLabel(selected)} ▾`;
  }
  syncLabel();

  btn.addEventListener('click', () => {
    // Snapshotted so onClose can skip onApply's rebuild entirely if the
    // learner opened this, changed nothing, and clicked away — the same
    // form elsewhere on the tab that made deferring to onClose necessary
    // in the first place shouldn't lose its half-typed contents to a
    // rebuild that had nothing to apply.
    const before = [...selected].sort().join(',');
    let changed = false;
    openLanguagePicker({
      anchorEl: btn,
      exclude:  '', // nothing excluded — every language is a valid pick here
      selected,
      onChange: updated => {
        setSelectedLangs(updated);
        syncLabel();
        changed = [...updated].sort().join(',') !== before;
      },
      onClose: () => { if (changed) onApply(); },
    });
  });

  wrap.appendChild(btn);
  return wrap;
}

/**
 * One row per selected language, each labeled and holding whatever
 * per-language input(s) `makeRow` builds — the shared shape every "add"
 * form's language section uses. `currentLang` gets a highlighted row, since
 * that's the language the learner is most likely filling in first. `makeRow`
 * returns both the element to place in the row (a single input, or a
 * wrapper `<div>` around several) and whatever value the caller needs back
 * to read the row's input(s) on submit.
 */
function languageRows<T>(
  currentLang: string,
  selectedLangs: Set<string>,
  makeRow: (info: LanguageInfo) => { el: HTMLElement; value: T },
): { rows: HTMLElement; values: Map<string, T> } {
  const rows = el('div', 'mc-lang-rows');
  const values = new Map<string, T>();
  const langs = LANGUAGES.filter(info => selectedLangs.has(info.name));
  if (langs.length === 0) {
    rows.appendChild(el('p', 'mc-empty', 'Choose at least one language above to add content.'));
    return { rows, values };
  }
  for (const info of langs) {
    const row = el('div', 'mc-lang-row');
    if (info.name === currentLang) row.classList.add('mc-lang-row--current');
    row.appendChild(buildLangBadge([info.name]));
    row.appendChild(el('span', 'mc-lang-row-label', info.label));
    const { el: inputEl, value } = makeRow(info);
    row.appendChild(inputEl);
    values.set(info.name, value);
    rows.appendChild(row);
  }
  return { rows, values };
}

// ── Collapsible sections ─────────────────────────────────────────────────────
//
// Words/Trivia/Pictures each run long — collapsing whichever aren't in use
// right now is the difference between one screenful and several. Collapse
// state persists per section key (not tied to renderMyContent's own rebuild)
// so it survives the tab's cheap rebuild-everything-on-every-change pattern;
// sections start expanded, same as before this existed, and stay however a
// learner last left them.
//
// The Words section itself nests two of these — "Add a new word" and "Edit
// an existing word" (buildSubsection) — one visual step down from a
// top-level section (buildSection): a <div>/<h4> instead of a <section>/<h3>,
// sharing every key in the same COLLAPSED_SECTIONS_KEY set as long as each
// caller picks its own unique key ('words-add'/'words-edit' vs. 'words').

const COLLAPSED_SECTIONS_KEY = 'vq_mycontent_collapsed';

function getCollapsedSections(): Set<string> {
  return new Set(readJson<string[]>(COLLAPSED_SECTIONS_KEY, [], isStringArray));
}

function setCollapsedSections(keys: Set<string>): void {
  writeJson(COLLAPSED_SECTIONS_KEY, [...keys]);
}

interface CollapsibleClasses {
  wrap: string; header: string; chevron: string; title: string; body: string; desc: string; collapsedModifier: string;
}

/**
 * Shared toggle/persistence behind buildSection and buildSubsection below —
 * only the tag names, heading level and class names differ between a
 * top-level section and one nested inside it, so the collapse mechanics
 * (and the storage key both read from) can't drift apart between the two.
 *
 * Wraps `body` in a clickable header (title + chevron) that shows or hides
 * it in place — deliberately not a rebuild, so a search in progress or a
 * half-filled form inside `body` survives collapsing the wrapper around it.
 */
function buildCollapsible(
  wrapTag: 'section' | 'div', titleTag: 'h3' | 'h4', classes: CollapsibleClasses,
  key: string, title: string, description: string, body: HTMLElement,
): HTMLElement {
  const wrap = document.createElement(wrapTag);
  wrap.className = classes.wrap;

  const header = el('div', classes.header);
  header.setAttribute('role', 'button');
  header.tabIndex = 0;
  header.append(el('span', classes.chevron, '▾'), el(titleTag, classes.title, title));

  const bodyWrap = el('div', classes.body);
  bodyWrap.append(el('p', classes.desc, description), body);

  function applyState(collapsed: boolean): void {
    bodyWrap.hidden = collapsed;
    wrap.classList.toggle(classes.collapsedModifier, collapsed);
    header.setAttribute('aria-expanded', String(!collapsed));
  }
  applyState(getCollapsedSections().has(key));

  function toggle(): void {
    const collapsed = !bodyWrap.hidden;
    applyState(collapsed);
    const keys = getCollapsedSections();
    if (collapsed) keys.add(key); else keys.delete(key);
    setCollapsedSections(keys);
  }
  header.addEventListener('click', toggle);
  header.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
  });

  wrap.append(header, bodyWrap);
  return wrap;
}

// ── Content-type tabs: Words / Trivia / Guess the Blank / Pictures ─────────
//
// One of these four is shown at a time, switched the same way the app's own
// top-level mode-tabs work — not the independently-collapsible accordion
// this used to be (buildSection, above buildSubsection below, still does
// that for nested "Add"/"Edit" blocks within a tab). All four panels are
// built up front and only ever hidden/shown, never rebuilt on a tab switch,
// so a search in progress or a half-filled form in a tab that isn't showing
// right now survives clicking over to another and back — same reasoning as
// buildCollapsible's own "toggle in place, don't rebuild" comment below.

const ACTIVE_TAB_KEY = 'vq_mycontent_activetab';

type MCTabKey = 'words' | 'trivia' | 'guessBlank' | 'pictures';
const MC_TAB_KEYS: readonly MCTabKey[] = ['words', 'trivia', 'guessBlank', 'pictures'];

function isMCTabKey(v: string | null): v is MCTabKey {
  return v !== null && (MC_TAB_KEYS as readonly string[]).includes(v);
}

function getActiveTab(): MCTabKey {
  const stored = readString(ACTIVE_TAB_KEY);
  return isMCTabKey(stored) ? stored : 'words';
}

function setActiveTab(tab: MCTabKey): void {
  writeString(ACTIVE_TAB_KEY, tab);
}

interface MCTabDef {
  key:         MCTabKey;
  title:       string;
  description: string;
  body:        HTMLElement;
}

function buildContentTabs(tabs: MCTabDef[], initialActive: MCTabKey): HTMLElement {
  const wrap   = el('div', 'mc-tabs-outer');
  const tabBar = el('div', 'mc-tabs');
  tabBar.setAttribute('role', 'tablist');
  const panelsWrap = el('div', 'mc-tabs-wrap');

  const panels  = new Map<MCTabKey, HTMLElement>();
  const buttons = new Map<MCTabKey, HTMLButtonElement>();

  function activate(key: MCTabKey): void {
    panels.forEach((panel, k) => { panel.hidden = k !== key; });
    buttons.forEach((btn, k) => {
      btn.classList.toggle('active', k === key);
      btn.setAttribute('aria-selected', String(k === key));
    });
    setActiveTab(key);
  }

  for (const { key, title, description, body } of tabs) {
    const btn = el('button', 'mc-tab-btn', title) as HTMLButtonElement;
    btn.type = 'button';
    btn.setAttribute('role', 'tab');
    btn.addEventListener('click', () => activate(key));
    buttons.set(key, btn);
    tabBar.appendChild(btn);

    const panel = el('div', 'mc-tab-panel');
    panel.append(el('p', 'mc-tab-desc', description), body);
    panels.set(key, panel);
    panelsWrap.appendChild(panel);
  }

  wrap.append(tabBar, panelsWrap);
  activate(panels.has(initialActive) ? initialActive : tabs[0].key);
  return wrap;
}

function buildSubsection(key: string, title: string, description: string, body: HTMLElement): HTMLElement {
  return buildCollapsible('div', 'h4', {
    wrap: 'mc-subsection', header: 'mc-subsection-header', chevron: 'mc-subsection-chevron',
    title: 'mc-subsection-title', body: 'mc-subsection-body', desc: 'mc-subsection-desc',
    collapsedModifier: 'mc-subsection--collapsed',
  }, key, title, description, body);
}

// ── Cross-tab navigation: "Edit in My Content" ──────────────────────────────
//
// Table mode's word-info popover can send a learner straight to a word's
// editor in the "Edit an Existing Word" subsection below, the same one a
// manual search there opens. There's no direct call from that popover into
// this module's render function (the tab switch it triggers goes through
// app.ts's onActivate, which calls renderMyContent with no word to focus) —
// so the target is stashed here instead and picked up the next time
// renderMyContent runs, which openWordInMyContentEditor forces immediately
// by switching the language (if needed) and clicking the tab.
let pendingFocusWord: { lang: string; word: string } | null = null;

/** Switches to My Content, switches to the Words tab and expands its "Edit
 *  an Existing Word" subsection, and opens `word`'s editor row — the entry
 *  point Table mode's word-info popover uses. Switches the global language
 *  picker to the word's own language first when it differs, the same way
 *  presets.ts's applyBundle does, since My Content's word editor otherwise
 *  defaults to whatever language was already selected. */
export function openWordInMyContentEditor(lang: string, word: string): void {
  pendingFocusWord = { lang, word };
  const langSelect = document.getElementById('langSelect') as HTMLSelectElement | null;
  if (langSelect && langSelect.value !== lang) {
    langSelect.value = lang;
    langSelect.dispatchEvent(new Event('change', { bubbles: true }));
  }
  document.querySelector<HTMLButtonElement>('.mode-tab[data-mode="myContent"]')?.click();
}

export function renderMyContent(container: HTMLElement, lang: string): void {
  container.innerHTML = '';

  const focusWord = pendingFocusWord && pendingFocusWord.lang === lang ? pendingFocusWord : null;
  pendingFocusWord = null;
  if (focusWord) {
    // Force the Words tab active and its "Edit an Existing Word" subsection
    // open regardless of whatever was active/collapsed before — same effect
    // as clicking there manually, and it sticks the same way a manual click
    // would (see buildContentTabs/buildCollapsible), which is fine: a
    // learner who got sent here to edit a word almost certainly wants to
    // land straight on it again next visit too.
    setActiveTab('words');
    const keys = getCollapsedSections();
    keys.delete('words-edit');
    setCollapsedSections(keys);
  }

  const wrap = el('div', 'mc-wrap');

  const header = el('div', 'mc-header');
  header.appendChild(el('h2', 'mc-title', 'My Content'));
  header.appendChild(el('p', 'mc-desc',
    'Add your own words, trivia questions and pictures — stored only in this browser, never uploaded or shared with other learners.'));

  const backupRow = el('div', 'mc-backup-row');
  const exportBtn = el('button', 'mc-btn mc-btn--secondary', 'Download my content');
  exportBtn.type = 'button';
  exportBtn.addEventListener('click', () => downloadUserContent());
  const exportCsvBtn = el('button', 'mc-btn mc-btn--secondary', 'Export vocabulary (CSV)');
  exportCsvBtn.type = 'button';
  exportCsvBtn.title = 'Download the current language\'s full vocabulary as CSV — works offline, no server needed';
  exportCsvBtn.addEventListener('click', () => { void downloadVocabCsv(lang); });
  const importBtn = el('button', 'mc-btn mc-btn--secondary', 'Load a file…');
  importBtn.type = 'button';
  const importInput = el('input', undefined) as HTMLInputElement;
  importInput.type = 'file';
  importInput.accept = 'application/json';
  importInput.style.display = 'none';
  const importStatus = el('span', 'mc-import-status');
  importBtn.addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', () => {
    const file = importInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        importStatus.textContent = applyUserContentImport(String(reader.result));
        importStatus.classList.remove('mc-import-status--error');
        renderMyContent(container, lang);
      } catch (err) {
        importStatus.textContent = err instanceof Error ? err.message : 'Could not read that file.';
        importStatus.classList.add('mc-import-status--error');
      }
    };
    reader.readAsText(file);
  });
  const selectedLangs = getSelectedLangs(lang);
  // Same row as the backup/restore buttons — one toolbar for "manage this
  // tab" controls, rather than the language picker sitting alone in its own
  // row below. mc-backup-row's flex-wrap already handles a narrow viewport.
  backupRow.append(
    exportBtn, exportCsvBtn, importBtn, importInput, importStatus,
    buildLanguagePicker(selectedLangs, () => renderMyContent(container, lang)),
  );
  header.appendChild(backupRow);
  wrap.appendChild(header);

  wrap.appendChild(buildContentTabs([
    {
      key: 'words', title: 'Words',
      description: 'Search the vocabulary — and words you\'ve added — to change how a word reads in this browser: hide, reorder or add senses, or override the translation, part of speech, notes and more. Use + New Word to add one of your own. Nothing here changes the real vocabulary.',
      body: buildSharedWordEditor(lang, focusWord ?? undefined),
    },
    {
      key: 'trivia', title: 'Trivia Questions',
      description: 'Added to the Trivia tab\'s question bank, and included in its Difficulty/Reading/Domain filters. Fill in the question and answer for whichever languages you\'re writing it in — each becomes its own entry in that language\'s bank.',
      body: buildTriviaSection(lang, selectedLangs),
    },
    {
      key: 'guessBlank', title: 'Guess the Blank',
      description: 'Added to Guess the Blank\'s question bank. Write 2-4 clues per question, vaguest first — the mode reveals them one at a time as the learner asks for another hint.',
      body: buildGuessBlankSection(lang, selectedLangs),
    },
    {
      key: 'pictures', title: 'Pictures',
      description: 'Search a language\'s vocabulary for words that already have a photo, icon or emoji, then choose which one Picture Quiz should show for that word. Words with none of their own can still get a custom picture — a pasted URL, an uploaded file, or a pick from the bundled photo library.',
      body: buildPicturesSection(lang),
    },
  ], focusWord ? 'words' : getActiveTab()));

  container.appendChild(wrap);
}

// ── Words ────────────────────────────────────────────────────────────────────
//
// One editor for everything about a word: search the real vocabulary (and words
// you added), edit it, or add a new one — all as a client-only overlay, never
// touching the real data. It is the same editor the Admin panel uses.

/**
 * The shared Word Editor (ui/word-editor/) — the same editor the Admin panel
 * uses — pointed at My Content's storage. Everything it saves is an override
 * held in this browser; the real vocabulary is never touched (see
 * word-editor-adapter.ts for how an edit becomes an override).
 */
function buildSharedWordEditor(currentLang: string, focusWord?: { lang: string; word: string }): HTMLElement {
  const state: MyContentAdapterState = { scope: 'all' };
  const adapter = createMyContentAdapter(state);

  // Which words the list shows — sits at the end of the editor's filter bar.
  const scopeToggle = el('div', 'sort-order-toggle mc-we-scope');
  (['all', 'edited', 'custom'] as const).forEach(scope => {
    const b = el('button', `sort-order-btn${scope === state.scope ? ' active' : ''}`,
      scope === 'all' ? 'All' : scope === 'edited' ? 'Edited' : 'Added');
    b.type = 'button';
    b.title = scope === 'all' ? 'Every word' : scope === 'edited' ? 'Only words you have edited' : 'Only words you added';
    b.addEventListener('click', () => {
      state.scope = scope;
      scopeToggle.querySelectorAll('.sort-order-btn').forEach(x => x.classList.toggle('active', x === b));
      editor.reload();
    });
    scopeToggle.appendChild(b);
  });

  const editor = createWordEditor({
    adapter,
    idPrefix: 'mcwe-',
    initialLang: focusWord?.lang ?? currentLang,
    langFlag: lang => createFlagImg(languageInfo(lang).flagCountry, languageInfo(lang).label),
    filterBarExtra: scopeToggle,
    pageSize: 50,
    // What the original editor allowed: linguistic data and emoji are the real
    // vocabulary's own and are shown, not editable, here.
    readOnlyFields: ['ipa', 'syllables', 'gender', 'plural', 'infinitive', 'register', 'reflexive', 'corpusFrequency', 'emoji'],
    relationFields: true,
    meaningNotes: true,
    reorderGlosses: true,
    trackOriginal: true,
  });

  const wrap = el('div', 'word-editor mc-we');
  editor.mount(wrap);
  // Language list, POS and domain values arrive once the vocabulary is loaded;
  // the first page of words loads at the same time.
  void (async () => {
    await editor.load();
    editor.applyMeta(await adapter.getMeta());
    if (focusWord) {
      // Arrived from a word elsewhere in the app ("Edit in My Content"): search for it.
      const search = wrap.querySelector<HTMLInputElement>('input[type="text"]');
      if (search) { search.value = focusWord.word; search.dispatchEvent(new Event('input', { bubbles: true })); }
    }
  })();
  return wrap;
}

// ── Trivia questions ─────────────────────────────────────────────────────────

const CATEGORIES: readonly TriviaCategory[] = ['history', 'pop-culture'];
const DIFFICULTIES: readonly TriviaDifficulty[] = ['easy', 'medium', 'hard'];
const READING_DIFFICULTIES: readonly ReadingDifficulty[] = ['easy', 'medium', 'hard'];
const READING_LENGTHS: readonly ReadingLength[] = ['short', 'long'];
const ANSWER_TYPES: readonly AnswerType[] = ['year', 'number', 'person', 'place', 'thing'];

interface TriviaLangInputs { question: HTMLInputElement; answers: HTMLInputElement }

function buildTriviaSection(currentLang: string, selectedLangs: Set<string>): HTMLElement {
  const wrap = el('div', 'mc-subsections');
  const editSub = buildEditTriviaSubsection(currentLang);
  wrap.appendChild(buildAddTriviaSubsection(currentLang, selectedLangs, editSub.refresh));
  wrap.appendChild(editSub.el);
  return wrap;
}

function buildAddTriviaSubsection(currentLang: string, selectedLangs: Set<string>, onAdded: () => void): HTMLElement {
  const sub = el('div', 'mc-subsection-fields');

  const form = el('div', 'mc-form');
  const qEnI = textInput('Question in English');
  const ansEnI = textInput('Accepted English answers, comma-separated');
  const categoryI = selectInput(CATEGORIES);
  const difficultyI = selectInput(DIFFICULTIES);
  const readingDiffI = selectInput(READING_DIFFICULTIES);
  const readingLenI = selectInput(READING_LENGTHS);
  const answerTypeI = selectInput(ANSWER_TYPES);
  const domainsI = textInput('e.g. history, geography (comma-separated)');
  form.append(
    field('Question (English)', qEnI), field('Accepted answers (English)', ansEnI),
    field('Category', categoryI), field('Trivia difficulty', difficultyI),
    field('Reading difficulty', readingDiffI), field('Reading length', readingLenI),
    field('Answer type', answerTypeI), field('Domains', domainsI),
  );
  sub.appendChild(form);

  const { rows, values: triviaInputs } = languageRows<TriviaLangInputs>(currentLang, selectedLangs, info => {
    const question = textInput(`Question in ${info.label}`);
    const answers = textInput('Accepted answers, comma-separated');
    const rowWrap = el('div', 'mc-lang-row-inputs');
    rowWrap.append(question, answers);
    return { el: rowWrap, value: { question, answers } };
  });
  sub.appendChild(rows);

  const addBtn = el('button', 'mc-btn', 'Add question(s)');
  addBtn.type = 'button';
  addBtn.addEventListener('click', () => {
    let added = 0;
    for (const [langName, { question, answers }] of triviaInputs) {
      const questionTarget = question.value.trim();
      const answersTarget = csv(answers.value);
      if (!questionTarget || answersTarget.length === 0) continue;
      const q: Omit<TriviaQuestion, 'id'> = {
        category: categoryI.value as TriviaCategory,
        difficulty: difficultyI.value as TriviaDifficulty,
        readingDifficulty: readingDiffI.value as ReadingDifficulty,
        readingLength: readingLenI.value as ReadingLength,
        answerType: answerTypeI.value as AnswerType,
        domains: csv(domainsI.value),
        questionTarget,
        questionEn: qEnI.value.trim() || questionTarget,
        answersTarget,
        answersEn: csv(ansEnI.value).length ? csv(ansEnI.value) : answersTarget,
      };
      addUserTriviaQuestion(langName, q);
      added++;
    }
    if (added > 0) onAdded();
  });
  sub.appendChild(addBtn);

  return buildSubsection('trivia-add', 'Add a New Trivia Question',
    'Fill in the question and answer for whichever languages you\'re writing it in — each becomes its own entry in that language\'s bank.',
    sub);
}

/** One row in the Edit list: either a built-in trivia question (from
 *  data/trivia-questions.ts, `overridden` says whether My Content has
 *  patched it) or one a learner added themselves via the Add form above. */
interface TriviaEntry { info: LanguageInfo; q: TriviaQuestion; origin: 'builtin' | 'user'; overridden: boolean; }

// ── Trivia sort/filter toolbar (Edit an Existing Trivia Question) ──────────
// Same shape as MCListState/applyMCSortFilter above, sized to trivia's own
// fields (category/difficulty stand in for Part of Speech/Level) rather than
// forcing those word-specific dimensions onto a question. `dir` is still the
// same MCSortDir buildSortDirToggle already knows how to drive.

type TriviaSortMode = 'question' | 'category' | 'difficulty';
const TRIVIA_SORT_LABELS: Record<TriviaSortMode, string> = {
  question: 'Question', category: 'Category', difficulty: 'Difficulty',
};
const TRIVIA_DIFFICULTY_ORDER: Record<TriviaDifficulty, number> = { easy: 0, medium: 1, hard: 2 };

interface TriviaListState { sort: TriviaSortMode; dir: MCSortDir; category: Set<string>; difficulty: Set<string>; domains: Set<string>; }

function applyTriviaSortFilter(items: TriviaEntry[], state: TriviaListState): TriviaEntry[] {
  let filtered = state.category.size === 0 ? items : items.filter(({ q }) => state.category.has(q.category));
  if (state.difficulty.size > 0) filtered = filtered.filter(({ q }) => state.difficulty.has(q.difficulty));
  // Any-match, not all-match — same reasoning as applyMCSortFilter's own
  // domains check: a question tagged both "history" and "culture" should
  // still show up when only "history" is checked.
  if (state.domains.size > 0) filtered = filtered.filter(({ q }) => q.domains.some(d => state.domains.has(d)));
  const arr = [...filtered];
  const cmp = (a: TriviaEntry, b: TriviaEntry): number => {
    switch (state.sort) {
      case 'category':   return a.q.category.localeCompare(b.q.category) || a.q.questionTarget.localeCompare(b.q.questionTarget);
      case 'difficulty':  return TRIVIA_DIFFICULTY_ORDER[a.q.difficulty] - TRIVIA_DIFFICULTY_ORDER[b.q.difficulty]
        || a.q.questionTarget.localeCompare(b.q.questionTarget);
      default:            return a.q.questionTarget.localeCompare(b.q.questionTarget); // 'question'
    }
  };
  const mul = state.dir === 'desc' ? -1 : 1;
  arr.sort((a, b) => mul * cmp(a, b));
  return arr;
}

/** "pop-culture" → "Pop culture", "easy" → "Easy" — same single-
 *  leading-capital convention formatDomainLabel above uses for domains,
 *  applied to trivia/Guess the Blank's own category and difficulty values
 *  (hyphenated or plain) so their filter chips read as words, not raw enum
 *  keys, without a separate display-name table to keep in sync with either
 *  fixed value list. */
function formatChipLabel(v: string): string {
  return v.replace(/-/g, ' ').replace(/^./, c => c.toUpperCase());
}

/** One chip row — "All" plus one pill per value in `values` — same
 *  `.pos-chip`/"All" shape appendPosChips uses for Part of Speech, reused
 *  here for any small fixed value set (trivia/Guess the Blank's own
 *  category and difficulty) rather than a near-identical function per set. */
function appendChipGroup(
  target: HTMLElement, groupLabel: string, values: readonly string[], selected: Set<string>, onChange: () => void,
): void {
  target.appendChild(el('span', 'ml-band-label mc-toolbar-group-label', groupLabel));
  const allChip = el('button', 'pos-chip pos-chip-all', 'All');
  allChip.type = 'button';
  allChip.classList.toggle('active', selected.size === 0);
  allChip.addEventListener('click', () => { selected.clear(); onChange(); });
  target.appendChild(allChip);
  values.forEach(v => {
    const chip = el('button', 'pos-chip', formatChipLabel(v));
    chip.type = 'button';
    chip.classList.toggle('active', selected.has(v));
    chip.addEventListener('click', () => {
      if (selected.has(v)) selected.delete(v); else selected.add(v);
      onChange();
    });
    target.appendChild(chip);
  });
}

/**
 * Every trivia question for the language(s) picked above — built-in
 * (data/trivia-questions.ts, overrides applied) and added via the form
 * above — in one paginated, scrollable list, same row/expand-to-edit/
 * sort-and-filter shape as buildEditWordSubsection's own overrides list.
 * Unlike that one, this doesn't wait for a typed query before showing
 * anything: the whole bank is small enough (low hundreds at most) to just
 * page through directly, so the search box here only narrows the list
 * already on screen rather than being the only way to find something in
 * the first place.
 */
function buildEditTriviaSubsection(currentLang: string): { el: HTMLElement; refresh: () => void } {
  const sub = el('div', 'mc-subsection-fields');

  let expanded: { lang: string; id: string } | null = null;
  let pageIndex = 0;
  let searchLang = currentLang;
  let searchQuery = '';
  const sortState: TriviaListState = { sort: 'question', dir: 'asc', category: new Set(), difficulty: new Set(), domains: new Set() };

  // The built-in bank itself (override-free) is now a server fetch — see
  // trivia-questions.ts's own getTriviaQuestions — so it's cached here per
  // language exactly the way buildEditWordSubsection's ensureWords/
  // rawWordsCache above cache the vocabulary fetch: a language whose bank
  // isn't loaded yet just contributes nothing to collectEntries() below
  // until the fetch resolves and re-renders the list, rather than every
  // sort/filter/search keystroke needing to become async itself.
  const builtinCache = new Map<string, TriviaQuestion[]>();

  const list = el('div', 'mc-list mc-scroll-list');
  const pager = buildListPager(i => { pageIndex = i; renderList(); }, () => { pageIndex = 0; renderList(); }, myContentInitialPageSize());

  function openRow(lang: string, id: string): void {
    const same = expanded?.lang === lang && expanded.id === id;
    expanded = same ? null : { lang, id };
    pageIndex = 0;
    renderList();
    if (expanded) list.querySelector('.mc-row--expanded')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  const langSelect = document.createElement('select');
  langSelect.className = 'mc-input mc-word-lang-select';
  langSelect.appendChild(new Option('All languages', ALL_LANGS));
  for (const info of LANGUAGES) langSelect.appendChild(new Option(info.label, info.name));
  langSelect.value = searchLang;
  langSelect.addEventListener('change', () => { searchLang = langSelect.value; pageIndex = 0; renderList(); });
  const langRow = el('div', 'mc-word-lang-row');
  langRow.append(el('span', 'ml-band-label', 'Language'), langSelect);

  const sortLabel = el('span', 'ml-band-label', 'Sort');
  const sortSel = el('select', 'mc-input mc-list-toolbar-select');
  (Object.keys(TRIVIA_SORT_LABELS) as TriviaSortMode[]).forEach(mode => {
    sortSel.appendChild(new Option(TRIVIA_SORT_LABELS[mode], mode));
  });
  sortSel.value = sortState.sort;
  const onFilterChange = (): void => { pageIndex = 0; renderList(); };
  sortSel.addEventListener('change', () => { sortState.sort = sortSel.value as TriviaSortMode; onFilterChange(); });
  const sortRow = el('div', 'mc-sort-control');
  sortRow.append(sortLabel, sortSel, buildSortDirToggle(sortState, onFilterChange));

  const topRow = el('div', 'mc-edit-top-row');
  topRow.append(langRow, sortRow);
  sub.appendChild(topRow);

  const chipsRow = el('div', 'mc-list-toolbar');
  appendChipGroup(chipsRow, 'Category', CATEGORIES, sortState.category, onFilterChange);
  appendChipGroup(chipsRow, 'Difficulty', DIFFICULTIES, sortState.difficulty, onFilterChange);
  sub.appendChild(chipsRow);

  const domainsRow = el('div', 'mc-list-toolbar');
  sub.appendChild(domainsRow);

  const searchInput = textInput('Search to narrow the list below…');
  const clearBtn = el('button', 'mc-word-search-clear', '✕');
  clearBtn.type = 'button';
  clearBtn.hidden = true;
  clearBtn.setAttribute('aria-label', 'Clear search');
  clearBtn.addEventListener('click', () => { searchInput.value = ''; searchQuery = ''; clearBtn.hidden = true; onFilterChange(); searchInput.focus(); });
  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value.trim();
    clearBtn.hidden = !searchQuery;
    onFilterChange();
  });
  const searchRow = el('div', 'mc-word-search-row');
  searchRow.append(searchInput, clearBtn);
  sub.appendChild(searchRow);

  function collectEntries(): TriviaEntry[] {
    const langs = searchLang === ALL_LANGS ? LANGUAGES : LANGUAGES.filter(l => l.name === searchLang);
    const entries: TriviaEntry[] = [];

    // Same "kick off the missing fetches, re-render once they land" shape
    // as buildEditWordSubsection's own ensureWords/stillLoading above — a
    // language not yet in builtinCache just contributes no builtin rows on
    // *this* call.
    const stillLoading = langs.filter(info => !builtinCache.has(info.name));
    if (stillLoading.length > 0) {
      void Promise.all(stillLoading.map(info =>
        getTriviaQuestions(info.name).then(qs => builtinCache.set(info.name, qs)),
      )).then(renderList);
    }

    for (const info of langs) {
      const builtin = builtinCache.get(info.name) ?? [];
      for (const q0 of builtin) {
        const o = getTriviaQuestionOverride(info.name, q0.id);
        entries.push({ info, q: o ? { ...q0, ...o } : q0, origin: 'builtin', overridden: !!o });
      }
      for (const q of getUserTriviaQuestions(info.name)) entries.push({ info, q, origin: 'user', overridden: false });
    }
    return entries;
  }

  function renderList(): void {
    list.innerHTML = '';
    const all = collectEntries();
    if (all.length === 0) {
      list.appendChild(el('p', 'mc-empty', 'No trivia questions for this language yet.'));
      domainsRow.hidden = true;
      pager.sync(0, 0);
      return;
    }
    const qf = foldKey(searchQuery);
    const textFiltered = qf
      ? all.filter(({ q }) => foldKey(q.questionTarget).includes(qf) || foldKey(q.questionEn).includes(qf))
      : all;

    // How many of the questions currently in view (this language, this
    // search query) carry each domain — same "count next to the label" as
    // appendDomainChips' other callers.
    const domainCounts = new Map<string, number>();
    textFiltered.forEach(({ q }) => q.domains.forEach(d => domainCounts.set(d, (domainCounts.get(d) ?? 0) + 1)));
    domainsRow.innerHTML = '';
    appendDomainChips(domainsRow, domainCounts, sortState.domains, textFiltered.length, onFilterChange);
    domainsRow.hidden = domainCounts.size === 0;

    const filtered = applyTriviaSortFilter(textFiltered, sortState);
    const pageSize = pager.getPageSize();
    const pages = pageCountFor(filtered.length, pageSize);
    pageIndex = Math.max(0, Math.min(pageIndex, pages - 1));
    const shown = pageSlice(filtered, pageSize, pageIndex);

    if (filtered.length === 0) {
      list.appendChild(el('p', 'mc-empty', 'No trivia questions match that filter.'));
    } else {
      shown.forEach(entry => {
        const isExpanded = !!expanded && expanded.lang === entry.info.name && expanded.id === entry.q.id;
        list.appendChild(buildTriviaEditRow(entry, isExpanded, () => openRow(entry.info.name, entry.q.id), renderList));
      });
    }
    pager.sync(pageIndex, filtered.length);
  }
  renderList();
  sub.appendChild(list);
  sub.appendChild(pager.row);

  return {
    el: buildSubsection('trivia-edit', 'Edit an Existing Trivia Question',
      'Every trivia question for the language(s) picked above, plus any you\'ve added — sort, filter or search to find one, then click it to override its wording, answers, category or difficulty.',
      sub),
    refresh: renderList,
  };
}

function buildTriviaEditRow(entry: TriviaEntry, expanded: boolean, onToggle: () => void, refresh: () => void): HTMLElement {
  const { info, q, origin, overridden } = entry;
  const wrap = el('div', 'mc-row-wrap');
  const row = el('div', 'mc-row mc-row--clickable' + (expanded ? ' mc-row--expanded' : ''));
  row.addEventListener('click', onToggle);

  const main = el('div', 'mc-row-main');
  const title = el('span', 'mc-row-title');
  title.appendChild(buildLangBadge([info.name]));
  title.appendChild(document.createTextNode(` ${q.questionTarget}`));
  main.appendChild(title);
  const tag = origin === 'user' ? 'Added by you · ' : overridden ? 'Edited · ' : '';
  main.appendChild(el('span', 'mc-row-meta',
    `${tag}${q.difficulty} · reading ${q.readingDifficulty}/${q.readingLength} · ${q.answerType} · answer: ${q.answersTarget[0]}`));
  row.appendChild(main);

  if (origin === 'user') {
    const delBtn = el('button', 'mc-btn mc-btn--danger mc-btn--sm mc-row-actions', 'Remove');
    delBtn.type = 'button';
    delBtn.addEventListener('click', e => {
      e.stopPropagation();
      removeUserTriviaQuestion(info.name, q.id);
      refresh();
    });
    row.appendChild(delBtn);
  }
  wrap.appendChild(row);

  if (expanded) {
    const detail = el('div', 'mc-row-detail');
    detail.appendChild(buildTriviaEditForm(entry, refresh));
    wrap.appendChild(detail);
  }
  return wrap;
}

/**
 * Pre-filled twin of the Add form's fields. Saves with
 * updateUserTriviaQuestion for a question a learner added themselves, or
 * setTriviaQuestionOverride for a built-in one — the built-in bank itself
 * (data/trivia-questions.ts) is shipped source and never touched; overriding
 * one just patches how it appears and plays from here on, and a built-in
 * question that's already overridden gets a "Reset to original" button to
 * drop that patch entirely.
 */
function buildTriviaEditForm(entry: TriviaEntry, refresh: () => void): HTMLElement {
  const { info, q, origin, overridden } = entry;
  const wrap = el('div');

  // Textareas, not the plain single-line inputs the Add form above still
  // uses — a trivia question routinely runs longer than a text input can
  // show at once, and this is the one place a learner needs to read the
  // *whole* thing back to check an edit, not just glance at a summary row.
  // Full-width fields of their own above .mc-form, same reasoning as the Add
  // Word form's Example sentences/Additional senses: .mc-form's flex-wrap
  // row caps every field at ~180px, which a paragraph-length textarea would
  // just be cramped inside.
  const qTargetI = textArea(`Question in ${info.label}`, q.questionTarget);
  const qEnI = textArea('Question in English', q.questionEn);
  wrap.appendChild(field(`Question (${info.label})`, qTargetI));
  wrap.appendChild(field('Question (English)', qEnI));

  const form = el('div', 'mc-form');
  const ansTargetI = textInput('Accepted answers, comma-separated', q.answersTarget.join(', '));
  const ansEnI = textInput('Accepted English answers, comma-separated', q.answersEn.join(', '));
  const categoryI = selectInput(CATEGORIES, q.category);
  const difficultyI = selectInput(DIFFICULTIES, q.difficulty);
  const readingDiffI = selectInput(READING_DIFFICULTIES, q.readingDifficulty);
  const readingLenI = selectInput(READING_LENGTHS, q.readingLength);
  const answerTypeI = selectInput(ANSWER_TYPES, q.answerType);
  const domainsI = textInput('e.g. history, geography (comma-separated)', q.domains.join(', '));
  form.append(
    field('Accepted answers', ansTargetI), field('Accepted answers (English)', ansEnI),
    field('Category', categoryI), field('Trivia difficulty', difficultyI),
    field('Reading difficulty', readingDiffI), field('Reading length', readingLenI),
    field('Answer type', answerTypeI), field('Domains', domainsI),
  );
  wrap.appendChild(form);

  if (origin === 'builtin') {
    wrap.appendChild(el('p', 'mc-empty',
      'This is one of the app\'s built-in trivia questions. Saving overrides how it looks and plays here — the original is never changed.'));
  }

  const saveBtn = el('button', 'mc-btn', 'Save changes');
  saveBtn.type = 'button';
  saveBtn.addEventListener('click', () => {
    const questionTarget = qTargetI.value.trim();
    const answersTarget = csv(ansTargetI.value);
    if (!questionTarget || answersTarget.length === 0) return;
    const patch = {
      category: categoryI.value as TriviaCategory,
      difficulty: difficultyI.value as TriviaDifficulty,
      readingDifficulty: readingDiffI.value as ReadingDifficulty,
      readingLength: readingLenI.value as ReadingLength,
      answerType: answerTypeI.value as AnswerType,
      domains: csv(domainsI.value),
      questionTarget,
      questionEn: qEnI.value.trim() || questionTarget,
      answersTarget,
      answersEn: csv(ansEnI.value).length ? csv(ansEnI.value) : answersTarget,
    };
    if (origin === 'user') updateUserTriviaQuestion(info.name, q.id, patch);
    else setTriviaQuestionOverride(info.name, q.id, patch);
    refresh();
  });
  wrap.appendChild(saveBtn);

  if (origin === 'builtin' && overridden) {
    const resetBtn = el('button', 'mc-btn mc-btn--secondary', 'Reset to original');
    resetBtn.type = 'button';
    resetBtn.addEventListener('click', () => { removeTriviaQuestionOverride(info.name, q.id); refresh(); });
    wrap.appendChild(resetBtn);
  }
  return wrap;
}

// ── Guess the Blank questions ────────────────────────────────────────────────
// Same shape as Trivia above, but a question here is 2-4 clues (weakest
// first) rather than one line of text — see data/guess-blank-questions.ts.
// A textarea, one clue per line, stands in for the dynamic add/remove clue
// rows a fully general editor would need.

const BLANK_CATEGORIES: readonly BlankCategory[] = ['animal', 'object', 'place', 'person', 'food'];
const BLANK_DIFFICULTIES: readonly BlankDifficulty[] = ['easy', 'medium', 'hard'];

interface GuessBlankLangInputs { answer: HTMLInputElement; clues: HTMLTextAreaElement }

function buildGuessBlankSection(currentLang: string, selectedLangs: Set<string>): HTMLElement {
  const wrap = el('div', 'mc-subsections');
  const editSub = buildEditGuessBlankSubsection(currentLang);
  wrap.appendChild(buildAddGuessBlankSubsection(currentLang, selectedLangs, editSub.refresh));
  wrap.appendChild(editSub.el);
  return wrap;
}

function buildAddGuessBlankSubsection(currentLang: string, selectedLangs: Set<string>, onAdded: () => void): HTMLElement {
  const sub = el('div', 'mc-subsection-fields');

  const form = el('div', 'mc-form');
  const answerEnI = textInput('Answer in English, e.g. "the monkey"');
  const cluesEnI = textArea('One clue per line, vaguest first (2-4 clues)');
  const categoryI = selectInput(BLANK_CATEGORIES);
  const difficultyI = selectInput(BLANK_DIFFICULTIES);
  form.append(
    field('Answer (English)', answerEnI), field('Category', categoryI), field('Difficulty', difficultyI),
  );
  sub.appendChild(form);
  sub.appendChild(field('Clues (English)', cluesEnI));

  const { rows, values: blankInputs } = languageRows<GuessBlankLangInputs>(currentLang, selectedLangs, info => {
    const answer = textInput(`Answer in ${info.label}`);
    const clues = textArea(`Clues in ${info.label}, one per line`);
    const rowWrap = el('div', 'mc-lang-row-stack');
    rowWrap.append(answer, clues);
    return { el: rowWrap, value: { answer, clues } };
  });
  sub.appendChild(rows);

  const addBtn = el('button', 'mc-btn', 'Add question(s)');
  addBtn.type = 'button';
  addBtn.addEventListener('click', () => {
    let added = 0;
    for (const [langName, { answer, clues }] of blankInputs) {
      const answerTarget = answer.value.trim();
      const cluesTarget = lines(clues.value);
      if (!answerTarget || cluesTarget.length === 0) continue;
      const q: Omit<GuessBlankQuestion, 'id'> = {
        category: categoryI.value as BlankCategory,
        difficulty: difficultyI.value as BlankDifficulty,
        cluesTarget,
        cluesEn: lines(cluesEnI.value).length ? lines(cluesEnI.value) : cluesTarget,
        answerTarget,
        answerEn: answerEnI.value.trim() || answerTarget,
      };
      addUserGuessBlankQuestion(langName, q);
      added++;
    }
    if (added > 0) onAdded();
  });
  sub.appendChild(addBtn);

  return buildSubsection('guessblank-add', 'Add a New Guess the Blank Question',
    'Write 2-4 clues per question, vaguest first — the mode reveals them one at a time as the learner asks for another hint.',
    sub);
}

/** Same shape as TriviaEntry above. */
interface GuessBlankEntry { info: LanguageInfo; q: GuessBlankQuestion; origin: 'builtin' | 'user'; overridden: boolean; }

// ── Guess the Blank sort/filter toolbar (Edit an Existing ... Question) ────
// Same shape as TriviaListState/applyTriviaSortFilter above — no domains
// row here, though: unlike TriviaQuestion, GuessBlankQuestion carries no
// domains field to filter by.

type BlankSortMode = 'answer' | 'category' | 'difficulty';
const BLANK_SORT_LABELS: Record<BlankSortMode, string> = {
  answer: 'Answer', category: 'Category', difficulty: 'Difficulty',
};
const BLANK_DIFFICULTY_ORDER: Record<BlankDifficulty, number> = { easy: 0, medium: 1, hard: 2 };

interface BlankListState { sort: BlankSortMode; dir: MCSortDir; category: Set<string>; difficulty: Set<string>; }

function applyBlankSortFilter(items: GuessBlankEntry[], state: BlankListState): GuessBlankEntry[] {
  let filtered = state.category.size === 0 ? items : items.filter(({ q }) => state.category.has(q.category));
  if (state.difficulty.size > 0) filtered = filtered.filter(({ q }) => state.difficulty.has(q.difficulty));
  const arr = [...filtered];
  const cmp = (a: GuessBlankEntry, b: GuessBlankEntry): number => {
    switch (state.sort) {
      case 'category':   return a.q.category.localeCompare(b.q.category) || a.q.answerTarget.localeCompare(b.q.answerTarget);
      case 'difficulty':  return BLANK_DIFFICULTY_ORDER[a.q.difficulty] - BLANK_DIFFICULTY_ORDER[b.q.difficulty]
        || a.q.answerTarget.localeCompare(b.q.answerTarget);
      default:            return a.q.answerTarget.localeCompare(b.q.answerTarget); // 'answer'
    }
  };
  const mul = state.dir === 'desc' ? -1 : 1;
  arr.sort((a, b) => mul * cmp(a, b));
  return arr;
}

/** Same reasoning as buildEditTriviaSubsection above, for the Guess the
 *  Blank bank (data/guess-blank-questions.ts). */
function buildEditGuessBlankSubsection(currentLang: string): { el: HTMLElement; refresh: () => void } {
  const sub = el('div', 'mc-subsection-fields');

  let expanded: { lang: string; id: string } | null = null;
  let pageIndex = 0;
  let searchLang = currentLang;
  let searchQuery = '';
  const sortState: BlankListState = { sort: 'answer', dir: 'asc', category: new Set(), difficulty: new Set() };

  // Same "server fetch, cached per language, kicked off lazily" shape as
  // buildEditTriviaSubsection's own builtinCache above, for
  // guess-blank-questions.ts's getGuessBlankQuestions.
  const builtinCache = new Map<string, GuessBlankQuestion[]>();

  const list = el('div', 'mc-list mc-scroll-list');
  const pager = buildListPager(i => { pageIndex = i; renderList(); }, () => { pageIndex = 0; renderList(); }, myContentInitialPageSize());

  function openRow(lang: string, id: string): void {
    const same = expanded?.lang === lang && expanded.id === id;
    expanded = same ? null : { lang, id };
    pageIndex = 0;
    renderList();
    if (expanded) list.querySelector('.mc-row--expanded')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  const langSelect = document.createElement('select');
  langSelect.className = 'mc-input mc-word-lang-select';
  langSelect.appendChild(new Option('All languages', ALL_LANGS));
  for (const info of LANGUAGES) langSelect.appendChild(new Option(info.label, info.name));
  langSelect.value = searchLang;
  langSelect.addEventListener('change', () => { searchLang = langSelect.value; pageIndex = 0; renderList(); });
  const langRow = el('div', 'mc-word-lang-row');
  langRow.append(el('span', 'ml-band-label', 'Language'), langSelect);

  const sortLabel = el('span', 'ml-band-label', 'Sort');
  const sortSel = el('select', 'mc-input mc-list-toolbar-select');
  (Object.keys(BLANK_SORT_LABELS) as BlankSortMode[]).forEach(mode => {
    sortSel.appendChild(new Option(BLANK_SORT_LABELS[mode], mode));
  });
  sortSel.value = sortState.sort;
  const onFilterChange = (): void => { pageIndex = 0; renderList(); };
  sortSel.addEventListener('change', () => { sortState.sort = sortSel.value as BlankSortMode; onFilterChange(); });
  const sortRow = el('div', 'mc-sort-control');
  sortRow.append(sortLabel, sortSel, buildSortDirToggle(sortState, onFilterChange));

  const topRow = el('div', 'mc-edit-top-row');
  topRow.append(langRow, sortRow);
  sub.appendChild(topRow);

  const chipsRow = el('div', 'mc-list-toolbar');
  appendChipGroup(chipsRow, 'Category', BLANK_CATEGORIES, sortState.category, onFilterChange);
  appendChipGroup(chipsRow, 'Difficulty', BLANK_DIFFICULTIES, sortState.difficulty, onFilterChange);
  sub.appendChild(chipsRow);

  const searchInput = textInput('Search to narrow the list below…');
  const clearBtn = el('button', 'mc-word-search-clear', '✕');
  clearBtn.type = 'button';
  clearBtn.hidden = true;
  clearBtn.setAttribute('aria-label', 'Clear search');
  clearBtn.addEventListener('click', () => { searchInput.value = ''; searchQuery = ''; clearBtn.hidden = true; onFilterChange(); searchInput.focus(); });
  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value.trim();
    clearBtn.hidden = !searchQuery;
    onFilterChange();
  });
  const searchRow = el('div', 'mc-word-search-row');
  searchRow.append(searchInput, clearBtn);
  sub.appendChild(searchRow);

  function collectEntries(): GuessBlankEntry[] {
    const langs = searchLang === ALL_LANGS ? LANGUAGES : LANGUAGES.filter(l => l.name === searchLang);
    const entries: GuessBlankEntry[] = [];

    // Same "kick off the missing fetches, re-render once they land" shape
    // as buildEditTriviaSubsection's own collectEntries above.
    const stillLoading = langs.filter(info => !builtinCache.has(info.name));
    if (stillLoading.length > 0) {
      void Promise.all(stillLoading.map(info =>
        getGuessBlankQuestions(info.name).then(qs => builtinCache.set(info.name, qs)),
      )).then(renderList);
    }

    for (const info of langs) {
      const builtin = builtinCache.get(info.name) ?? [];
      for (const q0 of builtin) {
        const o = getGuessBlankQuestionOverride(info.name, q0.id);
        entries.push({ info, q: o ? { ...q0, ...o } : q0, origin: 'builtin', overridden: !!o });
      }
      for (const q of getUserGuessBlankQuestions(info.name)) entries.push({ info, q, origin: 'user', overridden: false });
    }
    return entries;
  }

  function renderList(): void {
    list.innerHTML = '';
    const all = collectEntries();
    if (all.length === 0) {
      list.appendChild(el('p', 'mc-empty', 'No Guess the Blank questions for this language yet.'));
      pager.sync(0, 0);
      return;
    }
    const qf = foldKey(searchQuery);
    const textFiltered = qf
      ? all.filter(({ q }) => foldKey(q.answerTarget).includes(qf) || foldKey(q.answerEn).includes(qf)
          || q.cluesTarget.some(c => foldKey(c).includes(qf)))
      : all;

    const filtered = applyBlankSortFilter(textFiltered, sortState);
    const pageSize = pager.getPageSize();
    const pages = pageCountFor(filtered.length, pageSize);
    pageIndex = Math.max(0, Math.min(pageIndex, pages - 1));
    const shown = pageSlice(filtered, pageSize, pageIndex);

    if (filtered.length === 0) {
      list.appendChild(el('p', 'mc-empty', 'No Guess the Blank questions match that filter.'));
    } else {
      shown.forEach(entry => {
        const isExpanded = !!expanded && expanded.lang === entry.info.name && expanded.id === entry.q.id;
        list.appendChild(buildGuessBlankEditRow(entry, isExpanded, () => openRow(entry.info.name, entry.q.id), renderList));
      });
    }
    pager.sync(pageIndex, filtered.length);
  }
  renderList();
  sub.appendChild(list);
  sub.appendChild(pager.row);

  return {
    el: buildSubsection('guessblank-edit', 'Edit an Existing Guess the Blank Question',
      'Every Guess the Blank question for the language(s) picked above, plus any you\'ve added — sort, filter or search to find one, then click it to override its clues, answer, category or difficulty.',
      sub),
    refresh: renderList,
  };
}

function buildGuessBlankEditRow(entry: GuessBlankEntry, expanded: boolean, onToggle: () => void, refresh: () => void): HTMLElement {
  const { info, q, origin, overridden } = entry;
  const wrap = el('div', 'mc-row-wrap');
  const row = el('div', 'mc-row mc-row--clickable' + (expanded ? ' mc-row--expanded' : ''));
  row.addEventListener('click', onToggle);

  const main = el('div', 'mc-row-main');
  const title = el('span', 'mc-row-title');
  title.appendChild(buildLangBadge([info.name]));
  title.appendChild(document.createTextNode(` ${q.answerTarget}`));
  main.appendChild(title);
  const tag = origin === 'user' ? 'Added by you · ' : overridden ? 'Edited · ' : '';
  main.appendChild(el('span', 'mc-row-meta',
    `${tag}${q.category} · ${q.difficulty} · ${q.cluesTarget.length} clue${q.cluesTarget.length === 1 ? '' : 's'}`));
  row.appendChild(main);

  if (origin === 'user') {
    const delBtn = el('button', 'mc-btn mc-btn--danger mc-btn--sm mc-row-actions', 'Remove');
    delBtn.type = 'button';
    delBtn.addEventListener('click', e => {
      e.stopPropagation();
      removeUserGuessBlankQuestion(info.name, q.id);
      refresh();
    });
    row.appendChild(delBtn);
  }
  wrap.appendChild(row);

  if (expanded) {
    const detail = el('div', 'mc-row-detail');
    detail.appendChild(buildGuessBlankEditForm(entry, refresh));
    wrap.appendChild(detail);
  }
  return wrap;
}

/** Same reasoning as buildTriviaEditForm above. */
function buildGuessBlankEditForm(entry: GuessBlankEntry, refresh: () => void): HTMLElement {
  const { info, q, origin, overridden } = entry;
  const wrap = el('div');
  const form = el('div', 'mc-form');
  const answerTargetI = textInput(`Answer in ${info.label}`, q.answerTarget);
  const answerEnI = textInput('Answer in English, e.g. "the monkey"', q.answerEn);
  const categoryI = selectInput(BLANK_CATEGORIES, q.category);
  const difficultyI = selectInput(BLANK_DIFFICULTIES, q.difficulty);
  form.append(
    field(`Answer (${info.label})`, answerTargetI), field('Answer (English)', answerEnI),
    field('Category', categoryI), field('Difficulty', difficultyI),
  );
  wrap.appendChild(form);

  const cluesTargetI = textArea(`Clues in ${info.label}, one per line`, q.cluesTarget.join('\n'));
  const cluesEnI = textArea('One clue per line, vaguest first (2-4 clues)', q.cluesEn.join('\n'));
  wrap.appendChild(field(`Clues (${info.label})`, cluesTargetI));
  wrap.appendChild(field('Clues (English)', cluesEnI));

  if (origin === 'builtin') {
    wrap.appendChild(el('p', 'mc-empty',
      'This is one of the app\'s built-in Guess the Blank questions. Saving overrides how it looks and plays here — the original is never changed.'));
  }

  const saveBtn = el('button', 'mc-btn', 'Save changes');
  saveBtn.type = 'button';
  saveBtn.addEventListener('click', () => {
    const answerTarget = answerTargetI.value.trim();
    const cluesTarget = lines(cluesTargetI.value);
    if (!answerTarget || cluesTarget.length === 0) return;
    const patch = {
      category: categoryI.value as BlankCategory,
      difficulty: difficultyI.value as BlankDifficulty,
      cluesTarget,
      cluesEn: lines(cluesEnI.value).length ? lines(cluesEnI.value) : cluesTarget,
      answerTarget,
      answerEn: answerEnI.value.trim() || answerTarget,
    };
    if (origin === 'user') updateUserGuessBlankQuestion(info.name, q.id, patch);
    else setGuessBlankQuestionOverride(info.name, q.id, patch);
    refresh();
  });
  wrap.appendChild(saveBtn);

  if (origin === 'builtin' && overridden) {
    const resetBtn = el('button', 'mc-btn mc-btn--secondary', 'Reset to original');
    resetBtn.type = 'button';
    resetBtn.addEventListener('click', () => { removeGuessBlankQuestionOverride(info.name, q.id); refresh(); });
    wrap.appendChild(resetBtn);
  }
  return wrap;
}

// ── Word search ──────────────────────────────────────────────────────────────
//
// Shared by the Pictures and word-editor panels: both need to search a
// language's vocabulary for entries eligible for that panel's kind of
// override, then hand off to a panel-specific detail view once one is
// picked. The language dropdown, the async vocab load, and the
// search-box/results-list wiring are otherwise identical, so only which
// vocabulary to fetch, the eligibility filter, the "already overridden"
// flag, and what happens on selection vary per caller.

interface WordSearchUIOptions {
  defaultLang: string;
  /** Search box placeholder, and what's shown while the language loads. */
  placeholder: string;
  /** How to fetch a language's word list — `loadWords` (overrides already
   *  applied, what the Pictures panel wants to search and display) or
   *  `loadRawWords` (the true original, what the word editor needs so
   *  hiding something is never a one-way door). */
  fetchWords: (lang: string) => Promise<Word[]>;
  /** Which words this panel's search should surface at all. */
  isEligible: (lang: string, w: Word) => boolean;
  /** Whether to show the "✓ set" badge next to a result. */
  isOverridden: (lang: string, w: Word) => boolean;
  /** Fires when a result is clicked. */
  onSelect: (lang: string, w: Word) => void;
  /** Fires when the language changes, before the new vocabulary has loaded —
   *  lets the caller close whatever detail view was showing for the old
   *  language's word (it's no longer reachable in the new one), and re-scope
   *  anything the caller filters by the selected language. `lang` is the raw
   *  select value, so it's ALL_LANGS in "All languages" mode. The ✕ button
   *  and Escape only clear the search text/results; they leave a currently
   *  open detail view alone — see its own collapse toggle instead. */
  onLangChange: (lang: string) => void;
  /** Fires on every keystroke in the search box (and when it's cleared),
   *  with the trimmed query — lets a caller narrow a list of its own by the
   *  same text rather than needing a second, separate filter box. Optional:
   *  the Pictures panel has no such list to narrow. */
  onQueryChange?: (query: string) => void;
}

interface WordSearchUI {
  /** Search box + results list. Kept apart from `langRow` below so a caller
   *  can lay the two out independently — e.g. My Content's word editor puts
   *  the language picker up with its own Sort/filter toolbar and hides just
   *  this part while a row is open (see buildEditWordSubsection). */
  wrap: HTMLElement;
  /** The language picker alone. */
  langRow: HTMLElement;
  getLang: () => string;
  /** Re-runs the current query — call after a change that should update a
   *  result's "✓ set" badge (the word may still be on screen in the list). */
  refreshResults: () => void;
  /** Switches to `lang` if needed, waits for its vocabulary to load, then
   *  opens `word`'s detail view directly — what a row in an overrides list
   *  below calls to jump straight to editing that word instead of making
   *  the learner search for it again. Deliberately leaves the search box
   *  and results list alone (see the implementation): this is "open this
   *  one word," not "search for it." A silent no-op if `word` can't be
   *  found (e.g. removed from the data since the override was made). */
  openWord: (lang: string, word: string) => Promise<void>;
}

const RESULTS_LIMIT = 20;

/**
 * Relevance tier for one word against an already-folded query — lower sorts
 * first. Without this, `renderResults` below just filtered `words` in
 * whatever order the API returned it and sliced to RESULTS_LIMIT, so an
 * exact match could be truncated away entirely by thousands of weaker
 * substring matches ranked earlier in that array.
 *
 * This matters most for a short accented word like Portuguese "à": foldKey
 * strips diacritics for lenient matching, so searching "à" folds to "a" —
 * which is a substring of nearly every word's own spelling *or* English
 * translation ("that", "day", "man"...). Every one of those outranked the
 * exact word "à" itself under the old unsorted, capped list, so it could
 * never appear no matter how the results scrolled — indistinguishable from
 * the word not existing, even though the search box, the list, and the
 * editor beneath it were all otherwise working exactly as designed.
 */
function matchTier(w: Word, q: string): number {
  const wf = foldKey(w.word);
  if (wf === q) return 0;
  if (wf.startsWith(q)) return 1;
  if (foldKey(w.translation) === q) return 2;
  if (wf.includes(q)) return 3;
  if (foldKey(w.translation).startsWith(q)) return 4;
  return 5; // translation match, substring only
}

/** Sentinel `langSelect` value for "search every language at once" — never a
 *  real language name (LANGUAGES only ever holds those), so it can't
 *  collide. Each result in this mode carries its own real `.language`
 *  (tagged on fetch, below); everywhere this module would otherwise use the
 *  outer `lang` to call back into `opts`, it uses `w.language ?? lang`
 *  instead, so a normal single-language search (where results never carry
 *  `.language`) is completely unaffected. */
const ALL_LANGS = '__all__';

function buildWordSearchUI(opts: WordSearchUIOptions): WordSearchUI {
  const wrap = el('div', 'mc-word-panel');

  let lang = opts.defaultLang;
  let words: Word[] | null = null;
  // Which word (by folded text) the detail panel below is currently open
  // on, so the results list can highlight it — otherwise nothing on screen
  // says which of several similar-looking results you're actually editing.
  let selectedKey: string | null = null;
  // The list actually on screen right now (already capped to RESULTS_LIMIT)
  // and which of them the keyboard cursor is on — kept outside renderResults
  // so the search box's own keydown handler can act on the same rows it drew.
  let currentMatches: Word[] = [];
  let kbdIndex = -1;

  const langSelect = document.createElement('select');
  langSelect.className = 'mc-input mc-word-lang-select';
  langSelect.appendChild(new Option('All languages', ALL_LANGS));
  for (const info of LANGUAGES) {
    const lopt = document.createElement('option');
    lopt.value = info.name;
    lopt.textContent = info.label;
    langSelect.appendChild(lopt);
  }
  langSelect.value = lang;

  const langRow = el('div', 'mc-word-lang-row');
  langRow.append(el('span', 'ml-band-label', 'Language'), langSelect);

  const searchInput = textInput(opts.placeholder);
  searchInput.disabled = true;

  const clearBtn = el('button', 'mc-word-search-clear', '✕');
  clearBtn.type = 'button';
  clearBtn.hidden = true;
  clearBtn.setAttribute('aria-label', 'Clear search');
  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    renderResults('');
    searchInput.focus();
  });

  const searchRow = el('div', 'mc-word-search-row');
  searchRow.append(searchInput, clearBtn);

  const countLabel = el('p', 'mc-word-results-count');
  countLabel.hidden = true;

  const resultsList = el('ul', 'mc-word-results');
  resultsList.hidden = true;

  function selectMatch(i: number): void {
    const w = currentMatches[i];
    if (!w) return;
    selectedKey = foldKey(w.word);
    opts.onSelect(w.language ?? lang, w);
    // Repaint the active/kbd-focus classes in place rather than re-running
    // the whole search — the list of matches hasn't changed, just which one
    // is now open below.
    Array.from(resultsList.children).forEach((li, idx) => {
      li.classList.toggle('mc-word-result--active', idx === i);
    });
  }

  function paintKbdFocus(): void {
    Array.from(resultsList.children).forEach((li, idx) => {
      li.classList.toggle('mc-word-result--kbd-focus', idx === kbdIndex);
    });
    (resultsList.children[kbdIndex] as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest' });
  }

  function renderResults(query: string): void {
    opts.onQueryChange?.(query.trim());
    resultsList.innerHTML = '';
    kbdIndex = -1;
    clearBtn.hidden = !query.trim();
    if (!words) { resultsList.hidden = true; countLabel.hidden = true; currentMatches = []; return; }
    const q = foldKey(query);
    if (!q) { resultsList.hidden = true; countLabel.hidden = true; currentMatches = []; return; }
    const allMatches = words
      .filter(w => opts.isEligible(w.language ?? lang, w))
      .filter(w => foldKey(w.word).includes(q) || foldKey(w.translation).includes(q))
      // Best matches first — see matchTier's own comment for why this is
      // what makes a short accented word like "à" reachable at all once its
      // fold-key ("a") also substring-matches thousands of other words.
      .map((w, i) => ({ w, tier: matchTier(w, q), i }))
      .sort((a, b) => a.tier - b.tier || a.i - b.i)
      .map(({ w }) => w);
    currentMatches = allMatches.slice(0, RESULTS_LIMIT);

    if (currentMatches.length === 0) {
      resultsList.appendChild(el('li', 'mc-empty', 'No matching words.'));
      resultsList.hidden = false;
      countLabel.hidden = true;
      return;
    }
    if (allMatches.length > currentMatches.length) {
      countLabel.textContent = `Showing ${currentMatches.length} of ${allMatches.length} matches — keep typing to narrow it down.`;
      countLabel.hidden = false;
    } else {
      countLabel.hidden = true;
    }
    currentMatches.forEach((w, i) => {
      const li = el('li', 'mc-word-result');
      // Only set (and so only shown) in All-languages mode — see loadLang's
      // per-word tagging below — so a single-language search's rows are
      // unchanged from before this existed.
      if (w.language) li.appendChild(buildLangBadge([w.language]));
      const wordSpan = el('span', 'mc-word-result-word');
      fillHighlighted(wordSpan, w.word, query);
      const transSpan = el('span', 'mc-word-result-trans');
      fillHighlighted(transSpan, w.translation, query);
      li.append(wordSpan, transSpan);
      if (opts.isOverridden(w.language ?? lang, w)) li.appendChild(el('span', 'mc-word-result-flag', '✓ set'));
      if (selectedKey && foldKey(w.word) === selectedKey) li.classList.add('mc-word-result--active');
      li.addEventListener('click', () => selectMatch(i));
      resultsList.appendChild(li);
    });
    resultsList.hidden = false;
  }

  function loadLang(): Promise<void> {
    // Snapshotted now, not read back from the outer `lang` inside .then()
    // below: `lang` is the same mutable variable every call closes over, so
    // if the language is switched again before this fetch resolves, the
    // *next* call already reassigns it — and the guard below, comparing
    // against that same variable, would then always agree with itself
    // regardless of which call it's checking from. Two fetches racing
    // (a slow first request, a second one resolving from cache before it)
    // could resolve out of order, and the stale one would pass its own
    // check and overwrite `words` with the wrong language's list right after
    // the current one had already loaded correctly.
    const requestedLang = lang;
    words = null;
    selectedKey = null;
    resultsList.innerHTML = '';
    resultsList.hidden = true;
    countLabel.hidden = true;
    clearBtn.hidden = true;
    opts.onLangChange(requestedLang);
    searchInput.value = '';
    // Clears the query text a caller's onQueryChange is tracking too — left
    // unset, a query typed before switching languages would keep silently
    // filtering whatever this caller narrows by its own text (see
    // buildEditWordSubsection), even though the search box on screen now
    // reads empty.
    opts.onQueryChange?.('');
    searchInput.disabled = true;
    searchInput.placeholder = requestedLang === ALL_LANGS ? 'Loading every language…' : 'Loading vocabulary…';
    // All-languages mode fetches every language with actual data up front
    // and tags each word with its own — the same `.language` field
    // multi-language Table/Conjugation sessions already use — rather than
    // switching the fetch per keystroke, so a query never has to wait on N
    // requests while typing. availableLanguages() skips one with no data
    // (e.g. Chinese) up front; the per-language .catch is a second net in
    // case that answer is stale, so one bad language can't fail the batch
    // and dump every other language's error toast on screen at once.
    const fetch = requestedLang === ALL_LANGS
      ? availableLanguages().then(available => {
          const targets = available ? LANGUAGES.filter(info => available.includes(info.name)) : LANGUAGES;
          return Promise.all(targets.map(info =>
            opts.fetchWords(info.name)
              .then(ws => ws.map(w => ({ ...w, language: info.name })))
              .catch(() => [] as Word[])));
        }).then(lists => lists.flat())
      : opts.fetchWords(requestedLang);
    return fetch.then(loaded => {
      if (requestedLang !== langSelect.value) return; // superseded by a later change
      words = loaded;
      searchInput.disabled = false;
      searchInput.placeholder = opts.placeholder;
    });
  }

  async function openWord(targetLang: string, word: string): Promise<void> {
    if (lang !== targetLang || !words) {
      lang = targetLang;
      langSelect.value = targetLang;
      await loadLang();
    }
    const match = words?.find(w => foldKey(w.word) === foldKey(word));
    if (!match) return;
    // Deliberately leaves the search box and results list untouched — jumping
    // here from the already-edited-words list below is "open this one word,"
    // not "search for it," so it shouldn't dump a page of unrelated-looking
    // matches on screen the learner never asked to see.
    selectedKey = foldKey(word);
    opts.onSelect(lang, match);
  }

  langSelect.addEventListener('change', () => { lang = langSelect.value; void loadLang(); });
  searchInput.addEventListener('input', () => renderResults(searchInput.value.trim()));
  searchInput.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      searchInput.value = '';
      renderResults('');
      return;
    }
    if (resultsList.hidden || currentMatches.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      kbdIndex = Math.min(kbdIndex + 1, currentMatches.length - 1);
      paintKbdFocus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      kbdIndex = Math.max(kbdIndex - 1, 0);
      paintKbdFocus();
    } else if (e.key === 'Enter' && kbdIndex >= 0) {
      e.preventDefault();
      selectMatch(kbdIndex);
    }
  });

  wrap.append(searchRow, countLabel, resultsList);
  void loadLang();

  return { wrap, langRow, getLang: () => lang, refreshResults: () => renderResults(searchInput.value.trim()), openWord };
}

// ── Pictures ─────────────────────────────────────────────────────────────────
//
// Rather than typing a word blind and pasting a URL, this searches the
// language's real vocabulary (plus words added in the section above) for
// entries that already carry a visual — a local photo, an SVG icon or an
// emoji, via the same lookup picture-mode.ts itself uses — and lets you pick
// whichever one of those should be the *canonical* image, overriding
// picture-mode's own photo > icon > emoji priority for just that word. A
// custom URL, an uploaded file, or a pick from the bundled stock-photo
// library are still there for words with no built-in visual at all, or when
// none of the built-in options is the right picture.

interface WordVisuals { photo: string | null; svg: string | null; emoji: string | null }

function visualsFor(lang: string, w: Word): WordVisuals {
  return {
    photo: getFallbackImageUrl(lang, w.word),
    svg:   w.svg_url || getFallbackSvgUrl(lang, w.word) || null,
    emoji: w.emoji || getFallbackEmoji(lang, w.word) || null,
  };
}

function hasAnyVisual(v: WordVisuals): boolean {
  return Boolean(v.photo || v.svg || v.emoji);
}

/**
 * The bundled-photo gallery offered as one of the "custom" ways to set a
 * word's picture, alongside a pasted URL and an uploaded file — for words
 * with no built-in visual of their own, or when none of the built-in
 * options is the right one. Collapsed by default since the full gallery is
 * dozens of images long. `onPick` fires once and the caller is expected to
 * rebuild its own view — this component holds no state of its own.
 */
function buildStockImagePicker(selectedUrl: string | null, onPick: (url: string) => void): HTMLElement {
  const wrap = el('div', 'mc-stock-picker');

  const toggle = el('button', 'mc-btn mc-btn--secondary mc-btn--sm', 'Choose from stock images…');
  toggle.type = 'button';

  const gallery = el('div', 'mc-stock-gallery');
  gallery.hidden = true;

  for (const { url, label } of getStockImages()) {
    const item = el('button', 'mc-stock-item');
    item.type = 'button';
    if (url === selectedUrl) item.classList.add('mc-stock-item--selected');
    const thumb = el('img', 'mc-stock-thumb') as HTMLImageElement;
    thumb.src = url;
    thumb.alt = label;
    thumb.loading = 'lazy';
    item.appendChild(thumb);
    item.appendChild(el('span', 'mc-stock-label', label));
    item.addEventListener('click', () => onPick(url));
    gallery.appendChild(item);
  }

  toggle.addEventListener('click', () => {
    gallery.hidden = !gallery.hidden;
    toggle.textContent = gallery.hidden ? 'Choose from stock images…' : 'Hide stock images';
  });

  wrap.append(toggle, gallery);
  return wrap;
}

function buildPicturesSection(currentLang: string): HTMLElement {
  const wrap = el('div', 'mc-subsections');

  // The overrides list rebuilds itself in place on every change (a pick, a
  // custom picture, a Remove) rather than going through the whole tab's
  // refresh — that would also tear down and rebuild the search panel above
  // it, closing the search and losing the query every time a word's picture
  // is set, which is exactly the moment you're most likely to want to set
  // the next one too.
  const list = el('div', 'mc-list');
  function renderOverridesList(): void {
    list.innerHTML = '';
    const allOverrides = LANGUAGES.flatMap(info =>
      Object.entries(getPictureOverrides(info.name)).map(([word, value]) => ({ info, word, value })));
    if (allOverrides.length === 0) {
      list.appendChild(el('p', 'mc-empty', 'No picture overrides yet.'));
    } else {
      allOverrides.forEach(({ info, word, value }) => list.appendChild(
        buildPictureRow(info, word, value, renderOverridesList, () => panel.openWord(info.name, word)),
      ));
    }
  }

  const panel = buildPictureSearchPanel(currentLang, renderOverridesList);
  renderOverridesList();

  wrap.appendChild(panel.wrap);
  wrap.appendChild(list);
  return wrap;
}

interface PictureEditorPanel {
  wrap: HTMLElement;
  /** Jumps straight to editing `word`'s picture — what an overrides-list
   *  row calls instead of making the learner search for the word again. */
  openWord: (lang: string, word: string) => Promise<void>;
}

/**
 * The search UI plus the detail panel for whichever word is currently
 * selected. Kept as one closure (rather than threading state through
 * renderMyContent's own refresh) because switching languages needs an async
 * vocabulary load that the rest of the tab's synchronous
 * render-on-every-change pattern has no way to await.
 */
function buildPictureSearchPanel(defaultLang: string, refresh: () => void): PictureEditorPanel {
  const wrap = el('div', 'mc-word-panel-outer');

  const detail = el('div', 'mc-word-detail');
  detail.hidden = true;

  function selectWord(lang: string, w: Word): void {
    detail.innerHTML = '';
    detail.hidden = false;

    function afterChange(): void {
      selectWord(lang, w);
      ui.refreshResults();
      refresh();
    }

    const header = el('div', 'mc-word-detail-header');
    header.appendChild(buildLangBadge([lang]));
    header.appendChild(document.createTextNode(` ${w.word} — ${w.translation}`));
    detail.appendChild(header);

    const current = getPictureOverride(lang, w.word);
    const v = visualsFor(lang, w);

    const options = el('div', 'mc-pic-options');
    function addOption(label: string, value: string | null, kind: 'img' | 'emoji'): void {
      if (!value) return;
      const btn = el('button', 'mc-pic-option');
      btn.type = 'button';
      if (kind === 'img') {
        const img = el('img', 'mc-pic-option-img') as HTMLImageElement;
        img.src = value;
        img.alt = label;
        btn.appendChild(img);
      } else {
        btn.appendChild(el('span', 'mc-pic-option-emoji', value));
      }
      btn.appendChild(el('span', 'mc-pic-option-label', label));
      if (current === value) btn.classList.add('mc-pic-option--selected');
      btn.addEventListener('click', () => { setPictureOverride(lang, w.word, value); afterChange(); });
      options.appendChild(btn);
    }
    addOption('Photo', v.photo, 'img');
    addOption('Icon',  v.svg,   'img');
    addOption('Emoji', v.emoji, 'emoji');
    if (!options.hasChildNodes()) {
      options.appendChild(el('p', 'mc-empty', 'No built-in visuals for this word — set a custom one below.'));
    }
    detail.appendChild(options);

    const custom = el('div', 'mc-pic-custom');
    const customUrlI = textInput('Custom image URL…');
    const useUrlBtn = el('button', 'mc-btn mc-btn--secondary mc-btn--sm', 'Use URL');
    useUrlBtn.type = 'button';
    useUrlBtn.addEventListener('click', () => {
      if (!customUrlI.value.trim()) return;
      setPictureOverride(lang, w.word, customUrlI.value.trim());
      afterChange();
    });
    const urlRow = el('div', 'mc-pic-custom-row');
    urlRow.append(customUrlI, useUrlBtn);

    const fileI = el('input', 'mc-input') as HTMLInputElement;
    fileI.type = 'file';
    fileI.accept = 'image/*';
    fileI.addEventListener('change', () => {
      const file = fileI.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => { setPictureOverride(lang, w.word, String(reader.result)); afterChange(); };
      reader.readAsDataURL(file);
    });

    custom.append(
      urlRow,
      field('...or upload a file', fileI),
      buildStockImagePicker(current && isImageOverride(current) ? current : null, url => {
        setPictureOverride(lang, w.word, url);
        afterChange();
      }),
    );
    detail.appendChild(custom);

    if (current) {
      const clearBtn = el('button', 'mc-btn mc-btn--danger mc-btn--sm', 'Clear override (use automatic default)');
      clearBtn.type = 'button';
      clearBtn.addEventListener('click', () => { removePictureOverride(lang, w.word); afterChange(); });
      detail.appendChild(clearBtn);
    }
  }

  const ui = buildWordSearchUI({
    defaultLang,
    placeholder: 'Search for a word with a photo, icon or emoji…',
    fetchWords: loadWords,
    isEligible: (lang, w) => hasAnyVisual(visualsFor(lang, w)) || !!getPictureOverride(lang, w.word),
    isOverridden: (lang, w) => !!getPictureOverride(lang, w.word),
    onSelect: selectWord,
    onLangChange: () => { detail.innerHTML = ''; detail.hidden = true; },
  });

  wrap.append(ui.langRow, ui.wrap, detail);

  async function openWord(lang: string, word: string): Promise<void> {
    await ui.openWord(lang, word);
    detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  return { wrap, openWord };
}

/** `onOpen` reopens this word in the picture editor above — the row itself
 *  is clickable for that (see .mc-row--clickable), with Remove as the one
 *  carve-out that doesn't trigger it. */
function buildPictureRow(
  info: LanguageInfo, word: string, value: string, refresh: () => void, onOpen: () => void,
): HTMLElement {
  const row = el('div', 'mc-row mc-row--clickable');
  row.addEventListener('click', onOpen);

  if (isImageOverride(value)) {
    const thumb = el('img', 'mc-thumb') as HTMLImageElement;
    thumb.src = value;
    thumb.alt = word;
    row.appendChild(thumb);
  } else {
    row.appendChild(el('span', 'mc-thumb mc-thumb--emoji', value));
  }
  const main = el('div', 'mc-row-main');
  const title = el('span', 'mc-row-title');
  title.appendChild(buildLangBadge([info.name]));
  title.appendChild(document.createTextNode(` ${word}`));
  main.appendChild(title);
  row.appendChild(main);

  const delBtn = el('button', 'mc-btn mc-btn--danger mc-btn--sm', 'Remove');
  delBtn.type = 'button';
  delBtn.addEventListener('click', e => {
    e.stopPropagation();
    removePictureOverride(info.name, word);
    refresh();
  });
  row.appendChild(delBtn);
  return row;
}
