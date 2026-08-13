/**
 * admin-editor.ts
 *
 * Word Editor tab — filter bar, word list, comprehensive edit form.
 */

import { apiCall, showStatus, escapeHtml } from './admin-api.js';
import { logger } from '../utils/logger.js';

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
}

// ── DOM refs ──────────────────────────────────────────────────────────────────

const searchInput     = document.getElementById('searchInput')     as HTMLInputElement;
const langSelect      = document.getElementById('langSelect')      as HTMLSelectElement;
const filterPos       = document.getElementById('filterPos')       as HTMLSelectElement;
const filterBand      = document.getElementById('filterBand')      as HTMLSelectElement;
const filterDomain    = document.getElementById('filterDomain')    as HTMLSelectElement;
const searchBtn       = document.getElementById('searchBtn')       as HTMLButtonElement;
const clearFiltersBtn = document.getElementById('clearFiltersBtn') as HTMLButtonElement;

const wordList        = document.getElementById('wordList')        as HTMLElement;
const wordCountLabel  = document.getElementById('wordCountLabel')  as HTMLElement;

const formPanelEmpty    = document.getElementById('formPanelEmpty')    as HTMLElement;
const editFormCard      = document.getElementById('editFormCard')      as HTMLElement;
const editFormWordTitle = document.getElementById('editFormWordTitle') as HTMLElement;
const editFormWordMeta  = document.getElementById('editFormWordMeta')  as HTMLElement;
const saveBtn           = document.getElementById('saveBtn')           as HTMLButtonElement;
const resetBtn          = document.getElementById('resetBtn')          as HTMLButtonElement;
const cancelBtn         = document.getElementById('cancelBtn')         as HTMLButtonElement;

// ── State ─────────────────────────────────────────────────────────────────────

let currentWord: WordData | null = null;

// ── Helpers ───────────────────────────────────────────────────────────────────

function debounce<T extends (...args: unknown[]) => void>(fn: T, ms: number): (...args: Parameters<T>) => void {
  let t: ReturnType<typeof setTimeout>;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function buildQuery(): string {
  const params = new URLSearchParams();
  params.set('lang',  langSelect.value);
  params.set('limit', '200');

  const q = searchInput.value.trim();
  if (q)                  params.set('search', q);
  if (filterPos.value)    params.set('pos',    filterPos.value);
  if (filterBand.value)   params.set('band',   filterBand.value);
  if (filterDomain.value) params.set('domain', filterDomain.value);

  return params.toString();
}

// ── Meta: populate dropdowns from DB ──────────────────────────────────────────

export async function loadMeta(): Promise<void> {
  try {
    const { pos, domains } = await apiCall('/meta') as { pos: string[]; domains: string[] };

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
        opt.value = opt.textContent = p;
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

    const result = await apiCall('/vocab?' + buildQuery()) as { words: WordData[]; total: number };
    renderWordList(result.words, result.total);
  } catch (err) {
    wordList.innerHTML = `<div class="word-list-empty" style="color:var(--danger);">Error: ${escapeHtml(err instanceof Error ? err.message : String(err))}</div>`;
    wordCountLabel.textContent = '';
  }
}

// ── Word list renderer ────────────────────────────────────────────────────────

function renderWordList(words: WordData[], total: number): void {
  wordCountLabel.textContent = words.length < total
    ? `${words.length} / ${total}`
    : `${total}`;

  if (!words.length) {
    wordList.innerHTML = '<div class="word-list-empty">No words found</div>';
    return;
  }

  wordList.innerHTML = '';

  words.forEach(word => {
    const item = document.createElement('div');
    item.className = 'word-item';

    const badgesHtml = [
      word.pos              ? `<span class="badge badge-pos">${escapeHtml(word.pos)}</span>`             : '',
      word.frequency?.band  ? `<span class="badge badge-band">${escapeHtml(word.frequency.band)}</span>` : '',
    ].join('');

    const glossPreview   = (word.glosses ?? []).slice(0, 3).map(escapeHtml).join(', ');
    const translationDiff = word.translation && word.translation !== word.word
      ? ` <span class="word-item-display">${escapeHtml(word.translation)}</span>`
      : '';

    item.innerHTML = `
      <div class="word-item-top">
        <span class="word-item-key">${escapeHtml(word.word)}</span>${translationDiff}
      </div>
      ${badgesHtml   ? `<div class="word-item-badges">${badgesHtml}</div>`     : ''}
      ${glossPreview ? `<div class="word-item-glosses">${glossPreview}</div>` : ''}
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

  setSelectValue('editPos',        word.pos             ?? '');
  setSelectValue('editDifficulty', word.difficulty      ?? '');
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

  return {
    translation: (document.getElementById('editTranslation') as HTMLInputElement).value.trim(),
    pos:         (document.getElementById('editPos')          as HTMLSelectElement).value || null,
    emoji:       (document.getElementById('editEmoji')        as HTMLInputElement).value.trim()  || null,
    difficulty:  (document.getElementById('editDifficulty')   as HTMLSelectElement).value || null,
    notes:       (document.getElementById('editNotes')        as HTMLTextAreaElement).value.trim(),
    glosses:     glossLines,
    examples:    exampleLines,
    domains:     domainVal ? [domainVal] : [],
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

    const result = await apiCall(
      `/vocab/${encodeURIComponent(currentWord.word)}?lang=${langSelect.value}`,
      'POST',
      collectFormData()
    ) as { word: WordData };

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
  langSelect.addEventListener('change', () => { clearForm(); void loadWords(); });
  filterPos.addEventListener('change', loadWords);
  filterBand.addEventListener('change', loadWords);
  filterDomain.addEventListener('change', loadWords);

  const debouncedLoad = debounce(loadWords, 350);
  searchInput.addEventListener('input', debouncedLoad);
  searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); void loadWords(); } });
  searchBtn.addEventListener('click', loadWords);

  clearFiltersBtn.addEventListener('click', () => {
    searchInput.value  = '';
    filterPos.value    = '';
    filterBand.value   = '';
    filterDomain.value = '';
    void loadWords();
  });

  saveBtn.addEventListener('click', saveWord);
  resetBtn.addEventListener('click', () => { if (currentWord) populateForm(currentWord); });
  cancelBtn.addEventListener('click', clearForm);

  void loadWords();
}
