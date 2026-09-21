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
const filterPos       = document.getElementById('filterPos')       as HTMLSelectElement;
const filterBand      = document.getElementById('filterBand')      as HTMLSelectElement;
const filterDomain    = document.getElementById('filterDomain')    as HTMLSelectElement;
const searchBtn       = document.getElementById('searchBtn')       as HTMLButtonElement;
const clearFiltersBtn = document.getElementById('clearFiltersBtn') as HTMLButtonElement;

const wordList        = document.getElementById('wordList')        as HTMLElement;
const wordCountLabel  = document.getElementById('wordCountLabel')  as HTMLElement;
const wordListPrevBtn  = document.getElementById('wordListPrevBtn')  as HTMLButtonElement;
const wordListNextBtn  = document.getElementById('wordListNextBtn')  as HTMLButtonElement;
const wordListPageLabel = document.getElementById('wordListPageLabel') as HTMLElement;

const settingsWordPageSize = document.getElementById('settingsWordPageSize') as HTMLInputElement;

const formPanelEmpty    = document.getElementById('formPanelEmpty')    as HTMLElement;
const editFormCard      = document.getElementById('editFormCard')      as HTMLElement;
const editFormWordTitle = document.getElementById('editFormWordTitle') as HTMLElement;
const editFormWordMeta  = document.getElementById('editFormWordMeta')  as HTMLElement;
const saveBtn           = document.getElementById('saveBtn')           as HTMLButtonElement;
const resetBtn          = document.getElementById('resetBtn')          as HTMLButtonElement;
const cancelBtn         = document.getElementById('cancelBtn')         as HTMLButtonElement;

// ── State ─────────────────────────────────────────────────────────────────────

let currentWord: WordData | null = null;
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

    const editDomainEl = document.getElementById('editDomain') as HTMLSelectElement | null;
    if (editDomainEl && domains.length) {
      const cur = editDomainEl.value;
      editDomainEl.innerHTML = `<option value="">—</option>` +
        domains.map(d => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join('');
      if (cur) editDomainEl.value = cur;
    }

    if (filterDomain && domains.length) {
      const cur = filterDomain.value;
      filterDomain.innerHTML = `<option value="">All</option>` +
        domains.map(d => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join('');
      if (cur) filterDomain.value = cur;
    }

    if (filterPos && pos.length) {
      const existing = [...filterPos.options].map(o => o.value).filter(Boolean);
      const missing  = pos.filter(p => !existing.includes(p));
      missing.forEach(p => {
        const opt = document.createElement('option');
        // The hard-coded options above are capitalized ("Adjective",
        // "Noun"…) — a POS the database has that this list doesn't (e.g.
        // "interjection", "particle") used to get appended as the raw
        // lowercase DB value, the one option in the dropdown that didn't
        // match the others' styling.
        opt.value       = p;
        opt.textContent = p.charAt(0).toUpperCase() + p.slice(1);
        filterPos.appendChild(opt);
      });
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
      pos:    filterPos.value           || undefined,
      band:   filterBand.value          || undefined,
      domain: filterDomain.value        || undefined,
    });
    wordListPage  = result.page;
    wordListPages = Math.max(1, result.pages);
    renderWordList(result.words, result.total);
  } catch (err) {
    wordList.innerHTML = `<div class="word-list-empty" style="color:var(--danger);">Error: ${escapeHtml(err instanceof Error ? err.message : String(err))}</div>`;
    wordCountLabel.textContent = '';
    wordListPageLabel.textContent = 'Page 1 of 1';
    wordListPrevBtn.disabled = true;
    wordListNextBtn.disabled = true;
  }
}

// ── Word list renderer ────────────────────────────────────────────────────────

function renderWordList(words: WordData[], total: number): void {
  wordCountLabel.textContent = String(total);
  wordListPageLabel.textContent = `Page ${wordListPage} of ${wordListPages}`;
  wordListPrevBtn.disabled = wordListPage <= 1;
  wordListNextBtn.disabled = wordListPage >= wordListPages;

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
      word.frequency?.band  ? `<span class="badge badge-band">${escapeHtml(word.frequency.band)}</span>` : '',
    ].join('');

    // One line: word, translation, POS, band — was word+translation on their
    // own line, then a badges line, then up to 3 glosses on a third line.
    // The gloss preview repeated the translation (its own first line, most
    // of the time) for no benefit, so it's gone rather than folded in.
    const translationHtml = word.translation
      ? `<span class="word-item-translation">${escapeHtml(word.translation)}</span>`
      : '';

    item.innerHTML = `
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

// ── Edit form ─────────────────────────────────────────────────────────────────

function populateForm(word: WordData): void {
  currentWord = word;

  formPanelEmpty.style.display = 'none';
  editFormCard.style.display   = 'block';

  editFormWordTitle.textContent = word.word;
  const metaParts = [
    word.pos             ?? null,
    word.frequency?.band ?? null,
    word.linguistic?.ipa ?? null,
  ].filter(Boolean);
  editFormWordMeta.textContent = metaParts.join('  ·  ');

  (document.getElementById('editWord')        as HTMLInputElement).value        = word.word;
  (document.getElementById('editWordDisplay') as HTMLElement).textContent       = word.word;
  (document.getElementById('editTranslation') as HTMLInputElement).value        = word.translation ?? '';

  setSelectValue('editPos', word.pos ?? '');
  (document.getElementById('editDifficulty') as HTMLInputElement).value = word.difficulty ?? '';
  // band is derived from rank server-side — not editable

  const editDomainEl = document.getElementById('editDomain') as HTMLSelectElement | null;
  const firstDomain  = word.domains?.[0] ?? '';
  if (firstDomain && editDomainEl) {
    if (![...editDomainEl.options].some(o => o.value === firstDomain)) {
      const opt = document.createElement('option');
      opt.value = opt.textContent = firstDomain;
      editDomainEl.appendChild(opt);
    }
    editDomainEl.value = firstDomain;
  } else if (editDomainEl) {
    editDomainEl.value = '';
  }

  (document.getElementById('editGlosses') as HTMLTextAreaElement).value =
    (word.glosses ?? []).join('\n');

  (document.getElementById('editIPA')       as HTMLInputElement).value = word.linguistic?.ipa       ?? '';
  (document.getElementById('editSyllables') as HTMLInputElement).value = word.linguistic?.syllables
    ? (Array.isArray(word.linguistic.syllables)
        ? word.linguistic.syllables.join('-')
        : word.linguistic.syllables)
    : '';
  setSelectValue('editGender',   word.linguistic?.gender   ?? '');
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

function collectFormData(): Omit<WordData, 'word'> {
  const glossLines   = (document.getElementById('editGlosses') as HTMLTextAreaElement).value
    .split('\n').map(g => g.trim()).filter(Boolean);
  const exampleLines = (document.getElementById('editExamples') as HTMLTextAreaElement).value
    .split('\n').map(e => e.trim()).filter(Boolean);

  const syllablesRaw = (document.getElementById('editSyllables')      as HTMLInputElement).value.trim();
  const rank         = (document.getElementById('editRank')            as HTMLInputElement).value;
  const corpusFreq   = (document.getElementById('editCorpusFrequency') as HTMLInputElement).value;
  const domainVal    = (document.getElementById('editDomain')          as HTMLSelectElement).value;

  // The form only exposes one domain slot, but a word's `domains` is an
  // array and thousands in the current dataset carry more than one — this
  // used to send `[domainVal]` unconditionally, silently deleting every
  // domain past the first on any save. Carry over what index 0 onward
  // already held on the word as loaded, so only the shown slot is actually
  // editable.
  const extraDomains = (currentWord?.domains ?? []).slice(1).filter(d => d !== domainVal);
  const domains      = domainVal ? [domainVal, ...extraDomains] : extraDomains;

  const disambigVal = (document.getElementById('editDisambiguator') as HTMLInputElement).value.trim();

  return {
    translation: (document.getElementById('editTranslation') as HTMLInputElement).value.trim(),
    pos:         (document.getElementById('editPos')          as HTMLSelectElement).value || null,
    emoji:       (document.getElementById('editEmoji')        as HTMLInputElement).value.trim()  || null,
    difficulty:  (document.getElementById('editDifficulty')   as HTMLInputElement).value.trim() || null,
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
  document.querySelectorAll('.word-item').forEach(w => w.classList.remove('active'));
}

// ── Save ──────────────────────────────────────────────────────────────────────

async function saveWord(): Promise<void> {
  if (!currentWord) return;
  try {
    saveBtn.disabled    = true;
    saveBtn.textContent = 'Saving…';

    const result = await getAdminDataClient().updateWord(currentWord.word, langSelect.value, collectFormData());

    currentWord = result.word;

    const metaParts = [
      result.word.pos             ?? null,
      result.word.frequency?.band ?? null,
      result.word.linguistic?.ipa ?? null,
    ].filter(Boolean);
    editFormWordMeta.textContent = metaParts.join('  ·  ');

    showStatus('Saved: ' + result.word.word, 'success');
    void loadWords();
  } catch (err) {
    showStatus('Save error: ' + (err instanceof Error ? err.message : String(err)), 'error');
  } finally {
    saveBtn.disabled    = false;
    saveBtn.textContent = '💾 Save';
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

export function initEditor(): void {
  // Any change to what's being searched for invalidates whatever page of
  // the old result set we were on — back to page 1, same as a fresh search.
  const resetPageAndLoad = (): void => { wordListPage = 1; void loadWords(); };

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
  filterPos.addEventListener('change', resetPageAndLoad);
  filterBand.addEventListener('change', resetPageAndLoad);
  filterDomain.addEventListener('change', resetPageAndLoad);

  const debouncedLoad = debounce(resetPageAndLoad, 350);
  searchInput.addEventListener('input', debouncedLoad);
  searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); resetPageAndLoad(); } });
  searchBtn.addEventListener('click', resetPageAndLoad);

  wordListPrevBtn.addEventListener('click', () => { if (wordListPage > 1) { wordListPage--; void loadWords(); } });
  wordListNextBtn.addEventListener('click', () => { if (wordListPage < wordListPages) { wordListPage++; void loadWords(); } });

  clearFiltersBtn.addEventListener('click', () => {
    searchInput.value  = '';
    filterPos.value    = '';
    filterBand.value   = '';
    filterDomain.value = '';
    resetPageAndLoad();
  });

  saveBtn.addEventListener('click', saveWord);
  resetBtn.addEventListener('click', () => { if (currentWord) populateForm(currentWord); });
  cancelBtn.addEventListener('click', clearForm);

  void loadWords();
}
