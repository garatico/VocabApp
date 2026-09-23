/**
 * admin-editor.ts
 *
 * Word Editor tab — filter bar, word list, comprehensive edit form.
 */

import { showStatus, escapeHtml } from './admin-api.js';
import { getAdminDataClient } from './admin-data-client.js';
import { logger } from '../utils/logger.js';
import { langFlagImg } from './admin-languages.js';
import { readString, writeString } from '../utils/storage.ts';
import { setupEmojiPicker } from './admin-emoji-picker.js';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Frequency {
  band?: string | null;
  rank?: number | null;
  corpus_frequency?: number | null;
}

interface Linguistic {
  ipa?: string | null;
  syllables?: string | string[] | null;
  gender?: string | null;
  plural?: string | null;
  infinitive?: string | null;
  register?: string | null;
  reflexive?: boolean;
}

interface WordData {
  word: string;
  translation?: string;
  pos?: string | null;
  difficulty?: string | null;
  notes?: string;
  glosses?: string[];
  examples?: string[];
  domains?: string[];
  emoji?: string | null;
  frequency?: Frequency;
  linguistic?: Linguistic;
  tags?: string[];
  disambiguator?: string | null;
}

// ── DOM refs ──────────────────────────────────────────────────────────────────

const searchInput     = document.getElementById('searchInput')     as HTMLInputElement;
const langSelect      = document.getElementById('langSelect')      as HTMLSelectElement;
const langSelectFlag  = document.getElementById('langSelectFlag')  as HTMLElement;
const searchBtn       = document.getElementById('searchBtn')       as HTMLButtonElement;
const clearFiltersBtn = document.getElementById('clearFiltersBtn') as HTMLButtonElement;

const wordList        = document.getElementById('wordList')        as HTMLElement;
const wordCountLabel  = document.getElementById('wordCountLabel')  as HTMLElement;
const wordListPrevBtn  = document.getElementById('wordListPrevBtn')  as HTMLButtonElement;
const wordListNextBtn  = document.getElementById('wordListNextBtn')  as HTMLButtonElement;
const wordListPageSelect = document.getElementById('wordListPageSelect') as HTMLSelectElement;
const wordListPageInput = document.getElementById('wordListPageInput') as HTMLInputElement;
const wordListPageTotal = document.getElementById('wordListPageTotal') as HTMLElement;

const settingsWordPageSize = document.getElementById('settingsWordPageSize') as HTMLInputElement;

const formPanelEmpty    = document.getElementById('formPanelEmpty')    as HTMLElement;
const editFormCard      = document.getElementById('editFormCard')      as HTMLElement;
const editFormWordTitle = document.getElementById('editFormWordTitle') as HTMLElement;
const editFormWordMeta  = document.getElementById('editFormWordMeta')  as HTMLElement;
const saveBtn           = document.getElementById('saveBtn')           as HTMLButtonElement;
const resetBtn          = document.getElementById('resetBtn')          as HTMLButtonElement;
const cancelBtn         = document.getElementById('cancelBtn')         as HTMLButtonElement;
const toggleAllSectionsBtn = document.getElementById('toggleAllSectionsBtn') as HTMLButtonElement;
const newWordBtn        = document.getElementById('newWordBtn')        as HTMLButtonElement;

// ── State ─────────────────────────────────────────────────────────────────────

let currentWord: WordData | null = null;
// True between "+ New" and a successful Save/Cancel — see startNewWord() and
// setCreatingWord() below. Changes what Save does (createWord vs updateWord)
// and whether #editWord's word-key box is typeable.
let isCreatingWord = false;
// True from the first edit after a word loads (or "+ New" opens a blank
// form) until the next Save/Reset/Cancel — see setFormDirty() below. Drives
// Save's disabled state and admin.ts's guard against switching to Table
// View mid-edit.
let formDirty = false;
// Whether the connected database has a `disambiguator` column yet — see
// vocab-loader.ts's supportsDisambiguator(). false until /meta answers, so
// the field starts disabled rather than briefly editable-then-locked.
let disambiguatorSupported = false;

// The sidebar used to fetch a flat 200-word slice with no way to reach
// anything past it — fine for "essential" (a few hundred words) but not for
// the full 25k+ word database. Paginated in page-sized chunks instead, same
// Prev/Next pattern as Table View. The page size itself is a Settings tab
// control (settingsWordPageSize) rather than fixed, persisted the same way
// Table View persists its own column widths / page size.
const WORD_PAGE_SIZE_KEY = 'admin_word_list_page_size';
const DEFAULT_WORD_LIST_PAGE_SIZE = 50;
let wordListPageSize = DEFAULT_WORD_LIST_PAGE_SIZE;
let wordListPage = 1;
let wordListPages = 1;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Keeps the flag next to #langSelect in sync — <option> can't hold an
 *  <img> itself, so this is the closest a native select gets to one. */
function refreshLangFlag(): void {
  langSelectFlag.innerHTML = '';
  if (langSelect.value) langSelectFlag.appendChild(langFlagImg(langSelect.value));
}

function debounce<T extends (...args: unknown[]) => void>(fn: T, ms: number): (...args: Parameters<T>) => void {
  let t: ReturnType<typeof setTimeout>;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// ── Multi-select chip filters (POS, Band) ───────────────────────────────────
//
// A trigger button opens a panel of colored toggle chips (same --pos-hue
// formula as the main app's .pos-chip). Replaces what used to be a native
// single-value <select> for each — the server-side filter (filters.ts)
// already accepts a comma-separated list of values, so more than one POS or
// band can narrow the list at once.

interface ChipOption { value: string; label: string; }
interface ChipFilterHandle {
  setOptions(options: ChipOption[]): void;
  getSelected(): string[];
  clear(): void;
}

function setupChipFilter(
  fieldId: string, triggerId: string, panelId: string, summaryId: string,
  hueAttrName: 'data-pos' | 'data-band' | 'data-domain',
  onChange: () => void,
): ChipFilterHandle {
  const field   = document.getElementById(fieldId)   as HTMLElement;
  const trigger = document.getElementById(triggerId) as HTMLButtonElement;
  const panel   = document.getElementById(panelId)   as HTMLElement;
  const summary = document.getElementById(summaryId) as HTMLElement;

  let options: ChipOption[] = [];
  const selected = new Set<string>();

  function updateSummary(): void {
    const active = selected.size > 0;
    summary.classList.toggle('filter-chip-trigger-value--active', active);
    if (!active) { summary.textContent = 'All'; return; }
    if (selected.size === 1) {
      const value = [...selected][0];
      summary.textContent = options.find(o => o.value === value)?.label ?? value;
    } else {
      summary.textContent = `${selected.size} selected`;
    }
  }

  function render(): void {
    panel.innerHTML = '';
    options.forEach(opt => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'filter-chip' + (selected.has(opt.value) ? ' active' : '');
      chip.setAttribute(hueAttrName, opt.value);
      chip.textContent = opt.label;
      chip.addEventListener('click', () => {
        if (selected.has(opt.value)) selected.delete(opt.value); else selected.add(opt.value);
        chip.classList.toggle('active');
        updateSummary();
        onChange();
      });
      panel.appendChild(chip);
    });
    const footer = document.createElement('div');
    footer.className = 'filter-chip-panel-footer';
    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'filter-chip-panel-clear';
    clearBtn.textContent = 'Clear';
    clearBtn.addEventListener('click', clear);
    footer.appendChild(clearBtn);
    panel.appendChild(footer);
  }

  function open(): void  { panel.hidden = false; trigger.setAttribute('aria-expanded', 'true'); }
  function close(): void { panel.hidden = true;  trigger.setAttribute('aria-expanded', 'false'); }

  trigger.addEventListener('click', () => { if (panel.hidden) open(); else close(); });
  document.addEventListener('click', e => { if (!field.contains(e.target as Node)) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) close(); });

  function clear(): void {
    if (selected.size === 0) return;
    selected.clear();
    render();
    updateSummary();
    onChange();
  }

  return {
    setOptions(newOptions) { options = newOptions; render(); updateSummary(); },
    getSelected()          { return [...selected]; },
    clear,
  };
}

// Placeholder POS list shown until /api/admin/meta answers with the DB's
// real set — same 8 values the old hard-coded <select> shipped with.
const DEFAULT_POS_OPTIONS: ChipOption[] = [
  { value: 'adjective',    label: 'Adjective' },
  { value: 'adverb',       label: 'Adverb' },
  { value: 'article',      label: 'Article' },
  { value: 'conjunction',  label: 'Conjunction' },
  { value: 'noun',         label: 'Noun' },
  { value: 'preposition',  label: 'Preposition' },
  { value: 'pronoun',      label: 'Pronoun' },
  { value: 'verb',         label: 'Verb' },
];
const BAND_OPTIONS: ChipOption[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map(b => ({ value: b, label: b }));

// Any change to what's being searched for invalidates whatever page of the
// old result set we were on — back to page 1, same as a fresh search. Module
// scope (not just inside initEditor()) since the chip filters above close
// over it too.
function resetPageAndLoad(): void { wordListPage = 1; void loadWords(); }

const posChipFilter    = setupChipFilter('posFilterField',    'posFilterTrigger',    'posFilterPanel',    'posFilterSummary',    'data-pos',    resetPageAndLoad);
const bandChipFilter   = setupChipFilter('bandFilterField',   'bandFilterTrigger',   'bandFilterPanel',   'bandFilterSummary',   'data-band',   resetPageAndLoad);
const domainChipFilter = setupChipFilter('domainFilterField', 'domainFilterTrigger', 'domainFilterPanel', 'domainFilterSummary', 'data-domain', resetPageAndLoad);
posChipFilter.setOptions(DEFAULT_POS_OPTIONS);
bandChipFilter.setOptions(BAND_OPTIONS);

// ── Meta: populate dropdowns from DB ──────────────────────────────────────────

export async function loadMeta(): Promise<void> {
  try {
    const { pos, domains, languages, disambiguatorSupported: supported } = await getAdminDataClient().getMeta();
    disambiguatorSupported = Boolean(supported);
    const disambigInput = document.getElementById('editDisambiguator') as HTMLInputElement | null;
    const disambigHint  = document.getElementById('editDisambiguatorHint') as HTMLElement | null;
    if (disambigInput) disambigInput.disabled = !disambiguatorSupported;
    if (disambigHint) {
      disambigHint.hidden = disambiguatorSupported;
      disambigHint.textContent = disambiguatorSupported ? '' : '(requires a database column not yet added)';
    }

    // langSelect ships with only "Spanish" as a placeholder so the filter
    // bar isn't empty before this resolves — this replaces it with every
    // language the DB actually has. It used to be a hand-written list of
    // four baked into admin.html, which silently fell behind as languages
    // were added: German, Dutch and Chinese vocab existed and were fully
    // editable through the API, but had no way to be reached from this UI.
    if (languages?.length) {
      const cur = langSelect.value;
      langSelect.innerHTML = languages
        .map(l => `<option value="${escapeHtml(l)}">${escapeHtml(l.charAt(0).toUpperCase() + l.slice(1))}</option>`)
        .join('');
      langSelect.value = languages.includes(cur) ? cur : languages[0];
      refreshLangFlag();
    }

    const editPosEl = document.getElementById('editPos') as HTMLSelectElement | null;
    if (editPosEl && pos.length) {
      const cur = editPosEl.value;
      editPosEl.innerHTML = pos.map(p => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join('');
      if (cur) editPosEl.value = cur;
    }

    const editDomainSuggestions = document.getElementById('editDomainSuggestions') as HTMLDataListElement | null;
    if (editDomainSuggestions && domains.length) {
      editDomainSuggestions.innerHTML = domains.map(d => `<option value="${escapeHtml(d)}"></option>`).join('');
    }

    if (domains.length) {
      domainChipFilter.setOptions(domains.map(d => ({ value: d, label: d })));
    }

    if (pos.length) {
      // The DEFAULT_POS_OPTIONS placeholder shown before this resolves is
      // capitalized ("Adjective", "Noun"…) — this replaces it wholesale with
      // the DB's actual set, capitalized the same way, so a part of speech
      // that list didn't cover (e.g. "interjection", "particle") reads the
      // same as the rest instead of showing up as a raw lowercase value.
      posChipFilter.setOptions(pos.map(p => ({ value: p, label: p.charAt(0).toUpperCase() + p.slice(1) })));
    }
  } catch (err) {
    logger.warn('Could not load meta options:', err instanceof Error ? err.message : String(err));
  }
}

// ── Search / load words ───────────────────────────────────────────────────────

async function loadWords(): Promise<void> {
  try {
    wordList.innerHTML = '<div class="word-list-empty">Loading…</div>';
    wordCountLabel.textContent = '…';

    const result = await getAdminDataClient().getVocabPage({
      lang:   langSelect.value,
      limit:  wordListPageSize,
      page:   wordListPage,
      search: searchInput.value.trim()  || undefined,
      pos:    posChipFilter.getSelected().join(',')    || undefined,
      band:   bandChipFilter.getSelected().join(',')   || undefined,
      domain: domainChipFilter.getSelected().join(',') || undefined,
    });
    wordListPage  = result.page;
    wordListPages = Math.max(1, result.pages);
    renderWordList(result.words, result.total);
  } catch (err) {
    wordList.innerHTML = `<div class="word-list-empty" style="color:var(--danger);">Error: ${escapeHtml(err instanceof Error ? err.message : String(err))}</div>`;
    wordCountLabel.textContent = '';
    wordListPages = 1;
    updateWordListPager();
  }
}

/** Rebuilds the jump-to-page <select> only when the page count changes —
 *  same reasoning as the main app's own Table mode pager (table-controls.ts's
 *  updatePagers()): a 500+ page list means 500+ <option>s, not worth
 *  throwing away and rebuilding on every single page turn. */
function updateWordListPager(): void {
  if (wordListPageSelect.options.length !== wordListPages) {
    wordListPageSelect.innerHTML = '';
    for (let i = 0; i < wordListPages; i++) {
      const opt = document.createElement('option');
      opt.value = String(i + 1);
      opt.textContent = `Page ${i + 1} of ${wordListPages}`;
      wordListPageSelect.appendChild(opt);
    }
  }
  wordListPageSelect.value = String(wordListPage);

  wordListPageInput.value = String(wordListPage);
  wordListPageInput.max   = String(wordListPages);
  wordListPageTotal.textContent = String(wordListPages);
  wordListPrevBtn.disabled = wordListPage <= 1;
  wordListNextBtn.disabled = wordListPage >= wordListPages;
}

// ── Word list renderer ────────────────────────────────────────────────────────

function renderWordList(words: WordData[], total: number): void {
  wordCountLabel.textContent = String(total);
  updateWordListPager();

  if (!words.length) {
    wordList.innerHTML = '<div class="word-list-empty">No words found</div>';
    return;
  }

  wordList.innerHTML = '';

  words.forEach(word => {
    const item = document.createElement('div');
    // Reload after a save rebuilds this list from scratch — without this,
    // the just-saved word's highlight vanished even though the form panel
    // stayed open on it, since nothing here knew which item used to be active.
    item.className = currentWord && word.word === currentWord.word ? 'word-item active' : 'word-item';

    const badgesHtml = [
      word.pos              ? `<span class="badge badge-pos" data-pos="${escapeHtml(word.pos)}">${escapeHtml(word.pos)}</span>` : '',
      word.frequency?.band  ? `<span class="badge badge-band" data-band="${escapeHtml(word.frequency.band)}">${escapeHtml(word.frequency.band)}</span>` : '',
    ].join('');

    // One line: word, translation, POS, band — was word+translation on their
    // own line, then a badges line, then up to 3 glosses on a third line.
    // The gloss preview repeated the translation (its own first line, most
    // of the time) for no benefit, so it's gone rather than folded in.
    const translationHtml = word.translation
      ? `<span class="word-item-translation">${escapeHtml(word.translation)}</span>`
      : '';

    const rankHtml = word.frequency?.rank != null
      ? `<span class="word-item-rank">${escapeHtml(String(word.frequency.rank))}</span>`
      : '<span class="word-item-rank">—</span>';

    item.innerHTML = `
      ${rankHtml}
      <span class="word-item-key">${escapeHtml(word.word)}</span>${translationHtml}
      <span class="word-item-badges">${badgesHtml}</span>
    `;

    item.addEventListener('click', () => {
      document.querySelectorAll('.word-item').forEach(w => w.classList.remove('active'));
      item.classList.add('active');
      populateForm(word);
    });

    wordList.appendChild(item);
  });
}

// ── Collapsible form sections ────────────────────────────────────────────────

/** Turns every static .form-section in the edit form into a collapse/expand
 *  toggle — wraps everything after the title into a .form-section-body div
 *  (once, at init; the sections themselves are fixed markup, not rebuilt per
 *  word) and lets its title button hide/show that body. Collapsed state is
 *  in-memory only — every section reopens on the next page load, same as
 *  the rest of the form resetting per word. */
function initCollapsibleSections(): void {
  document.querySelectorAll<HTMLElement>('.form-section').forEach(section => {
    const title = section.querySelector<HTMLElement>(':scope > .form-section-title');
    if (!title) return;

    const body = document.createElement('div');
    body.className = 'form-section-body';
    [...section.children].forEach(child => {
      if (child !== title) body.appendChild(child);
    });
    section.appendChild(body);

    title.classList.add('form-section-toggle');
    title.setAttribute('role', 'button');
    title.setAttribute('aria-expanded', 'true');
    title.tabIndex = 0;
    title.insertAdjacentHTML('beforeend', '<span class="form-section-caret">▾</span>');

    const toggle = (): void => {
      const collapsed = section.classList.toggle('collapsed');
      title.setAttribute('aria-expanded', String(!collapsed));
      updateToggleAllLabel();
    };
    title.addEventListener('click', toggle);
    title.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
    });
  });
}

/** Reflects the current mix of open/closed sections onto the button label —
 *  "Collapse All" while anything is still open (there's something left for
 *  one more click to close), "Expand All" only once every section already is. */
function updateToggleAllLabel(): void {
  const anyExpanded = [...document.querySelectorAll('.form-section')].some(s => !s.classList.contains('collapsed'));
  toggleAllSectionsBtn.textContent = anyExpanded ? 'Collapse All' : 'Expand All';
}

/** Collapse-All/Expand-All button — collapses every section if any is
 *  currently open, otherwise expands all of them (so one click after a mix
 *  of manually-toggled sections always settles into "everything closed",
 *  the more useful of the two states to reach in one click). */
function initToggleAllSections(): void {
  toggleAllSectionsBtn.addEventListener('click', () => {
    const sections    = document.querySelectorAll<HTMLElement>('.form-section');
    const anyExpanded = [...sections].some(s => !s.classList.contains('collapsed'));
    sections.forEach(section => {
      section.classList.toggle('collapsed', anyExpanded);
      section.querySelector('.form-section-title')?.setAttribute('aria-expanded', String(!anyExpanded));
    });
    updateToggleAllLabel();
  });
}

// ── Chip inputs (Glosses, Domains) ───────────────────────────────────────────
// A container div holding rendered chips plus one trailing text field — type
// a value, press Enter/comma to turn it into a chip, click a chip's × to
// remove it. One factory shared by both fields rather than two near-
// identical copies of the same render/add/remove logic.

interface ChipInputHandle {
  get(): string[];
  set(values: string[]): void;
  addFromInput(): void;
}

function createChipInput(containerId: string, inputId: string, itemLabel: string): ChipInputHandle {
  const container = document.getElementById(containerId) as HTMLElement;
  const input     = document.getElementById(inputId)     as HTMLInputElement;
  let chips: string[] = [];

  function render(): void {
    container.querySelectorAll('.chip-input-tag').forEach(el => el.remove());
    chips.forEach((value, i) => {
      const chip = document.createElement('span');
      chip.className = 'chip-input-tag';
      const label = document.createElement('span');
      label.textContent = value;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'chip-input-tag-remove';
      remove.textContent = '×';
      remove.setAttribute('aria-label', `Remove ${itemLabel} "${value}"`);
      remove.addEventListener('click', () => { chips.splice(i, 1); render(); });
      chip.append(label, remove);
      container.insertBefore(chip, input);
    });
  }

  function addFromInput(): void {
    const value = input.value.trim();
    input.value = '';
    if (value && !chips.includes(value)) { chips.push(value); render(); }
  }

  container.addEventListener('click', () => input.focus());
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addFromInput(); }
    else if (e.key === 'Backspace' && input.value === '' && chips.length) { chips.pop(); render(); }
  });
  input.addEventListener('blur', addFromInput);

  return {
    get()       { return chips; },
    set(values) { chips = [...values]; render(); },
    addFromInput,
  };
}

const glossesChip = createChipInput('editGlossesChips', 'editGlossesInput', 'gloss');
const domainsChip = createChipInput('editDomainsChips', 'editDomainsInput', 'domain');

// ── Edit form ─────────────────────────────────────────────────────────────────

/** Save stays disabled until something has actually changed — there is
 *  nothing to save otherwise, and a click wouldn't error so much as just
 *  quietly re-send the same data that's already on the server. */
function setFormDirty(dirty: boolean): void {
  formDirty = dirty;
  saveBtn.disabled = !dirty;
}

/** Whether the open word (or an in-progress "+ New") has unsaved edits —
 *  admin.ts reads this before letting the Word Editor / Table View toggle
 *  switch away. */
export function isFormDirty(): boolean {
  return formDirty;
}

/** admin.ts's discard half of "save or discard before switching" — closes
 *  whatever's open (loaded word or in-progress "+ New") without saving,
 *  same as clicking ✕ would. */
export function discardFormChanges(): void {
  clearForm();
}

/** Toggles the word-key box between "readonly, shows the loaded word" (the
 *  normal editing state) and "typeable, empty" (mid-"+ New") — see
 *  startNewWord() and saveWord() below. */
function setCreatingWord(creating: boolean): void {
  isCreatingWord = creating;
  const wordInput = document.getElementById('editWord') as HTMLInputElement;
  const label      = document.getElementById('editWordLabel') as HTMLElement;
  wordInput.readOnly = !creating;
  wordInput.classList.toggle('readonly-field', !creating);
  label.textContent = creating ? 'Word key' : 'Word key (read-only)';
}

/** "+ New" — opens a blank edit form with every field cleared and the
 *  word-key box made typeable, rather than reusing populateForm(null): the
 *  rest of the form (collapsible sections, chip inputs) is already wired to
 *  a real WordData, and a blank word wouldn't be one until it's actually
 *  saved. */
function startNewWord(): void {
  currentWord = null;
  document.querySelectorAll('.word-item').forEach(w => w.classList.remove('active'));

  formPanelEmpty.style.display = 'none';
  editFormCard.style.display   = 'flex';
  setCreatingWord(true);

  editFormWordTitle.textContent = 'New word';
  editFormWordMeta.textContent  = '';

  (document.getElementById('editWord')        as HTMLInputElement).value = '';
  (document.getElementById('editTranslation') as HTMLInputElement).value = '';
  setSelectValue('editPos', '');
  setColorAttr('editPos', 'data-pos', null);
  (document.getElementById('editDifficulty') as HTMLSelectElement).value = '';
  (document.getElementById('editBand') as HTMLInputElement).value = '';
  setColorAttr('editBand', 'data-band', null);
  domainsChip.set([]);
  glossesChip.set([]);
  (document.getElementById('editIPA')        as HTMLInputElement).value = '';
  (document.getElementById('editSyllables')  as HTMLInputElement).value = '';
  setSelectValue('editGender', '');
  setColorAttr('editGender', 'data-gender', null);
  (document.getElementById('editPlural')     as HTMLInputElement).value = '';
  (document.getElementById('editInfinitive') as HTMLInputElement).value = '';
  setSelectValue('editRegister', '');
  (document.getElementById('editReflexive')  as HTMLInputElement).checked = false;
  (document.getElementById('editRank')             as HTMLInputElement).value = '';
  (document.getElementById('editCorpusFrequency')  as HTMLInputElement).value = '';
  (document.getElementById('editEmoji')      as HTMLInputElement).value = '';
  (document.getElementById('editDisambiguator') as HTMLInputElement).value = '';
  (document.getElementById('editExamples')   as HTMLTextAreaElement).value = '';
  (document.getElementById('editNotes')      as HTMLTextAreaElement).value = '';

  setFormDirty(false);
  (document.getElementById('editWord') as HTMLInputElement).focus();
}

function populateForm(word: WordData): void {
  currentWord = word;
  setCreatingWord(false);

  formPanelEmpty.style.display = 'none';
  editFormCard.style.display   = 'flex';

  editFormWordTitle.textContent = word.word;
  const metaParts = [
    word.pos             ?? null,
    word.frequency?.band ?? null,
    word.linguistic?.ipa ?? null,
  ].filter(Boolean);
  editFormWordMeta.textContent = metaParts.join('  ·  ');

  (document.getElementById('editWord')        as HTMLInputElement).value        = word.word;
  (document.getElementById('editTranslation') as HTMLInputElement).value        = word.translation ?? '';

  setSelectValue('editPos', word.pos ?? '');
  setColorAttr('editPos', 'data-pos', word.pos);
  (document.getElementById('editDifficulty') as HTMLSelectElement).value = word.difficulty ?? '';

  // Derived from rank server-side, same as Table View's own read-only Band
  // column — see CLAUDE.md's "band is computed here and nowhere else".
  (document.getElementById('editBand') as HTMLInputElement).value = word.frequency?.band ?? '';
  setColorAttr('editBand', 'data-band', word.frequency?.band);

  domainsChip.set(word.domains ?? []);
  glossesChip.set(word.glosses ?? []);

  (document.getElementById('editIPA')       as HTMLInputElement).value = word.linguistic?.ipa       ?? '';
  (document.getElementById('editSyllables') as HTMLInputElement).value = word.linguistic?.syllables
    ? (Array.isArray(word.linguistic.syllables)
        ? word.linguistic.syllables.join('-')
        : word.linguistic.syllables)
    : '';
  setSelectValue('editGender',   word.linguistic?.gender   ?? '');
  setColorAttr('editGender', 'data-gender', word.linguistic?.gender);
  (document.getElementById('editPlural')    as HTMLInputElement).value    = word.linguistic?.plural     ?? '';
  (document.getElementById('editInfinitive') as HTMLInputElement).value   = word.linguistic?.infinitive ?? '';
  setSelectValue('editRegister', word.linguistic?.register ?? '');
  (document.getElementById('editReflexive') as HTMLInputElement).checked  = Boolean(word.linguistic?.reflexive);

  (document.getElementById('editRank')           as HTMLInputElement).value = String(word.frequency?.rank            ?? '');
  (document.getElementById('editCorpusFrequency') as HTMLInputElement).value = String(word.frequency?.corpus_frequency ?? '');

  (document.getElementById('editExamples') as HTMLTextAreaElement).value =
    (word.examples ?? []).join('\n');

  (document.getElementById('editEmoji') as HTMLInputElement).value = word.emoji ?? '';
  (document.getElementById('editNotes') as HTMLTextAreaElement).value = word.notes ?? '';
  (document.getElementById('editDisambiguator') as HTMLInputElement).value = word.disambiguator ?? '';

  setFormDirty(false);
}

function setSelectValue(id: string, value: string): void {
  const el = document.getElementById(id) as HTMLSelectElement | null;
  if (!el) return;
  el.value = value;
  if (el.value !== value && value) {
    const opt = document.createElement('option');
    opt.value = opt.textContent = value;
    el.appendChild(opt);
    el.value = value;
  }
}

/** Sets/clears a [data-pos]/[data-band] attribute an element reads its own
 *  --pos-hue color formula off — see word-list.css's .badge-pos and
 *  edit-form.css's [data-pos]/[data-band] rules (the same hue-per-value
 *  scheme used everywhere else in the admin panel: filter chips, sidebar
 *  badges, Table View cells). */
function setColorAttr(id: string, attr: string, value: string | null | undefined): void {
  const el = document.getElementById(id);
  if (!el) return;
  if (value) el.setAttribute(attr, value); else el.removeAttribute(attr);
}

function collectFormData(): Omit<WordData, 'word'> {
  glossesChip.addFromInput(); // pick up whatever's still sitting in the text field, unconfirmed
  const glossLines   = glossesChip.get();
  const exampleLines = (document.getElementById('editExamples') as HTMLTextAreaElement).value
    .split('\n').map(e => e.trim()).filter(Boolean);

  const syllablesRaw = (document.getElementById('editSyllables')      as HTMLInputElement).value.trim();
  const rank         = (document.getElementById('editRank')            as HTMLInputElement).value;
  const corpusFreq   = (document.getElementById('editCorpusFrequency') as HTMLInputElement).value;

  domainsChip.addFromInput(); // pick up whatever's still sitting in the text field, unconfirmed
  const domains = domainsChip.get();

  const disambigVal = (document.getElementById('editDisambiguator') as HTMLInputElement).value.trim();

  return {
    translation: (document.getElementById('editTranslation') as HTMLInputElement).value.trim(),
    pos:         (document.getElementById('editPos')          as HTMLSelectElement).value || null,
    emoji:       (document.getElementById('editEmoji')        as HTMLInputElement).value.trim()  || null,
    difficulty:  (document.getElementById('editDifficulty')   as HTMLSelectElement).value.trim() || null,
    notes:       (document.getElementById('editNotes')        as HTMLTextAreaElement).value.trim(),
    glosses:     glossLines,
    examples:    exampleLines,
    domains,
    // Omitted entirely (rather than sent as null) when the column isn't
    // there yet — the server would just drop it, but this way a database
    // with no support for it never even puts the field on the wire.
    ...(disambiguatorSupported ? { disambiguator: disambigVal || null } : {}),
    linguistic: {
      ipa:        (document.getElementById('editIPA')        as HTMLInputElement).value.trim()  || null,
      syllables:  syllablesRaw || null,
      gender:     (document.getElementById('editGender')     as HTMLSelectElement).value        || null,
      plural:     (document.getElementById('editPlural')     as HTMLInputElement).value.trim()  || null,
      infinitive: (document.getElementById('editInfinitive') as HTMLInputElement).value.trim()  || null,
      register:   (document.getElementById('editRegister')   as HTMLSelectElement).value        || null,
      reflexive:  (document.getElementById('editReflexive')  as HTMLInputElement).checked,
    },
    frequency: {
      rank:             rank       ? parseInt(rank, 10)     : null,
      corpus_frequency: corpusFreq ? parseFloat(corpusFreq) : null,
    },
  };
}

function clearForm(): void {
  formPanelEmpty.style.display = '';
  editFormCard.style.display   = 'none';
  currentWord = null;
  setCreatingWord(false);
  setFormDirty(false);
  document.querySelectorAll('.word-item').forEach(w => w.classList.remove('active'));
}

// ── Save ──────────────────────────────────────────────────────────────────────

async function saveWord(): Promise<void> {
  if (!currentWord && !isCreatingWord) return;
  const existingWord = currentWord;

  const wordKey = (document.getElementById('editWord') as HTMLInputElement).value.trim();
  if (isCreatingWord && !wordKey) {
    showStatus('Enter a word key before saving', 'error');
    return;
  }
  if (!isCreatingWord && !existingWord) return;

  try {
    saveBtn.disabled    = true;
    saveBtn.textContent = 'Saving…';

    const result = isCreatingWord || !existingWord
      ? await getAdminDataClient().createWord(wordKey, langSelect.value, collectFormData())
      : await getAdminDataClient().updateWord(existingWord.word, langSelect.value, collectFormData());

    currentWord = result.word;
    setCreatingWord(false);
    setFormDirty(false);

    editFormWordTitle.textContent = result.word.word;
    const metaParts = [
      result.word.pos             ?? null,
      result.word.frequency?.band ?? null,
      result.word.linguistic?.ipa ?? null,
    ].filter(Boolean);
    editFormWordMeta.textContent = metaParts.join('  ·  ');

    // Band is derived server-side from rank — refresh it (and its color)
    // with whatever the save actually produced, since a rank edit in this
    // same save can change it.
    (document.getElementById('editBand') as HTMLInputElement).value = result.word.frequency?.band ?? '';
    setColorAttr('editBand', 'data-band', result.word.frequency?.band);
    setColorAttr('editPos', 'data-pos', result.word.pos);

    showStatus('Saved: ' + result.word.word, 'success');
    void loadWords();
  } catch (err) {
    showStatus('Save error: ' + (err instanceof Error ? err.message : String(err)), 'error');
  } finally {
    // A failed save leaves formDirty true (there's still something
    // unsaved to retry) — this respects that instead of unconditionally
    // re-enabling Save, which setFormDirty(false) above already disabled
    // again on the success path.
    saveBtn.disabled    = !formDirty;
    saveBtn.textContent = '💾 Save';
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

export function initEditor(): void {
  initCollapsibleSections();
  initToggleAllSections();

  // Dirty tracking — Save starts (and stays) disabled until something in
  // the form actually changes. Delegated on .edit-form-body rather than one
  // listener per field: 'input'/'change' cover every text/select/checkbox/
  // textarea field as-is, and a chip's own remove button is a plain <button
  // class="chip-input-tag-remove"> click that neither event fires for, so
  // that's matched explicitly. Adding a chip already fires 'input' on its
  // own text field as you type it, before Enter even confirms the chip.
  saveBtn.disabled = true;
  const editFormBody = document.querySelector('.edit-form-body') as HTMLElement;
  editFormBody.addEventListener('input',  () => setFormDirty(true));
  editFormBody.addEventListener('change', () => setFormDirty(true));
  editFormBody.addEventListener('click', e => {
    if ((e.target as HTMLElement).closest('.chip-input-tag-remove')) setFormDirty(true);
  });

  // Settings tab's "Word Editor Page Size" — restore whatever was picked
  // last session, same convenience Table View's own page size gets.
  const savedPageSize = parseInt(readString(WORD_PAGE_SIZE_KEY) ?? '', 10);
  wordListPageSize = Number.isFinite(savedPageSize) && savedPageSize > 0 ? savedPageSize : DEFAULT_WORD_LIST_PAGE_SIZE;
  settingsWordPageSize.value = String(wordListPageSize);
  const debouncedPageSizeChange = debounce(() => {
    const n = parseInt(settingsWordPageSize.value, 10);
    wordListPageSize = Number.isFinite(n) && n > 0 ? Math.min(n, 200) : DEFAULT_WORD_LIST_PAGE_SIZE;
    writeString(WORD_PAGE_SIZE_KEY, String(wordListPageSize));
    resetPageAndLoad();
  }, 400);
  settingsWordPageSize.addEventListener('input', debouncedPageSizeChange);

  refreshLangFlag();
  langSelect.addEventListener('change', () => { refreshLangFlag(); clearForm(); resetPageAndLoad(); });

  const debouncedLoad = debounce(resetPageAndLoad, 350);
  searchInput.addEventListener('input', debouncedLoad);
  searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); resetPageAndLoad(); } });
  searchBtn.addEventListener('click', resetPageAndLoad);

  wordListPrevBtn.addEventListener('click', () => { if (wordListPage > 1) { wordListPage--; void loadWords(); } });
  wordListNextBtn.addEventListener('click', () => { if (wordListPage < wordListPages) { wordListPage++; void loadWords(); } });

  const goToEnteredWordListPage = (): void => {
    const n = parseInt(wordListPageInput.value, 10);
    if (!Number.isFinite(n)) { wordListPageInput.value = String(wordListPage); return; }
    const clamped = Math.min(Math.max(n, 1), wordListPages);
    wordListPageInput.value = String(clamped);
    if (clamped !== wordListPage) { wordListPage = clamped; void loadWords(); }
  };
  wordListPageInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); goToEnteredWordListPage(); } });
  wordListPageInput.addEventListener('blur', goToEnteredWordListPage);

  wordListPageSelect.addEventListener('change', () => {
    const n = Number(wordListPageSelect.value);
    if (Number.isFinite(n) && n !== wordListPage) { wordListPage = n; void loadWords(); }
  });

  clearFiltersBtn.addEventListener('click', () => {
    searchInput.value  = '';
    posChipFilter.clear();
    bandChipFilter.clear();
    domainChipFilter.clear();
    resetPageAndLoad();
  });

  saveBtn.addEventListener('click', saveWord);
  resetBtn.addEventListener('click', () => {
    if (isCreatingWord) startNewWord();
    else if (currentWord) populateForm(currentWord);
  });
  cancelBtn.addEventListener('click', clearForm);
  newWordBtn.addEventListener('click', startNewWord);
  setupEmojiPicker('editEmojiField', 'editEmojiPickerBtn', 'editEmojiPickerPanel', 'editEmoji');

  (document.getElementById('editPos') as HTMLSelectElement).addEventListener('change', e => {
    setColorAttr('editPos', 'data-pos', (e.target as HTMLSelectElement).value);
  });
  (document.getElementById('editGender') as HTMLSelectElement).addEventListener('change', e => {
    setColorAttr('editGender', 'data-gender', (e.target as HTMLSelectElement).value);
  });

  void loadWords();
}
