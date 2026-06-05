/**
 * admin-editor.js
 *
 * Word Editor tab — filter bar, word list, comprehensive edit form.
 */

import { apiCall, showStatus, escapeHtml } from './admin-api.js';

// ── DOM refs ──────────────────────────────────────────────────────────────────

const searchInput     = document.getElementById('searchInput');
const langSelect      = document.getElementById('langSelect');
const filterPos       = document.getElementById('filterPos');
const filterBand      = document.getElementById('filterBand');
const filterDomain    = document.getElementById('filterDomain');
const searchBtn       = document.getElementById('searchBtn');
const clearFiltersBtn = document.getElementById('clearFiltersBtn');

const wordList        = document.getElementById('wordList');
const wordCountLabel  = document.getElementById('wordCountLabel');

const formPanelEmpty  = document.getElementById('formPanelEmpty');
const editFormCard    = document.getElementById('editFormCard');
const editFormWordTitle = document.getElementById('editFormWordTitle');
const editFormWordMeta  = document.getElementById('editFormWordMeta');
const saveBtn         = document.getElementById('saveBtn');
const resetBtn        = document.getElementById('resetBtn');
const cancelBtn       = document.getElementById('cancelBtn');

// ── State ─────────────────────────────────────────────────────────────────────

let currentWord = null;

// ── Helpers ───────────────────────────────────────────────────────────────────

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function buildQuery() {
  const params = new URLSearchParams();
  params.set('lang',   langSelect.value);
  params.set('limit',  '200');

  const q = searchInput.value.trim();
  if (q)                params.set('search', q);
  if (filterPos.value)  params.set('pos',    filterPos.value);
  if (filterBand.value) params.set('band',   filterBand.value);
  if (filterDomain.value) params.set('domain', filterDomain.value);

  return params.toString();
}

// ── Meta: populate dropdowns from DB ──────────────────────────────────────────

export async function loadMeta() {
  try {
    const { pos, domains, bands } = await apiCall('/meta');

    // Populate form POS select
    const editPosEl = document.getElementById('editPos');
    if (editPosEl && pos.length) {
      const cur = editPosEl.value;
      editPosEl.innerHTML = pos.map(p => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join('');
      if (cur) editPosEl.value = cur;
    }

    // Populate form Domain select
    const editDomainEl = document.getElementById('editDomain');
    if (editDomainEl && domains.length) {
      const cur = editDomainEl.value;
      editDomainEl.innerHTML = `<option value="">—</option>` +
        domains.map(d => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join('');
      if (cur) editDomainEl.value = cur;
    }

    // Populate filter bar Domain select
    if (filterDomain && domains.length) {
      const cur = filterDomain.value;
      filterDomain.innerHTML = `<option value="">All</option>` +
        domains.map(d => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join('');
      if (cur) filterDomain.value = cur;
    }

    // Populate filter bar POS select (add any DB-discovered POS not already listed)
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
    console.warn('Could not load meta options:', err.message);
  }
}

// ── Search / load words ───────────────────────────────────────────────────────

async function loadWords() {
  try {
    wordList.innerHTML = '<div class="word-list-empty">Loading…</div>';
    wordCountLabel.textContent = '…';

    const result = await apiCall('/vocab?' + buildQuery());

    renderWordList(result.words, result.total);
  } catch (err) {
    wordList.innerHTML = `<div class="word-list-empty" style="color:var(--danger);">Error: ${escapeHtml(err.message)}</div>`;
    wordCountLabel.textContent = '';
  }
}

// ── Word list renderer ────────────────────────────────────────────────────────

function renderWordList(words, total) {
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
      word.pos  ? `<span class="badge badge-pos">${escapeHtml(word.pos)}</span>`  : '',
      word.frequency?.band ? `<span class="badge badge-band">${escapeHtml(word.frequency.band)}</span>` : '',
    ].join('');

    const glossPreview = (word.glosses || []).slice(0, 3).map(escapeHtml).join(', ');
    const translationDiff  = word.translation && word.translation !== word.word
      ? ` <span class="word-item-display">${escapeHtml(word.translation)}</span>`
      : '';

    item.innerHTML = `
      <div class="word-item-top">
        <span class="word-item-key">${escapeHtml(word.word)}</span>${translationDiff}
      </div>
      ${badgesHtml ? `<div class="word-item-badges">${badgesHtml}</div>` : ''}
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

function populateForm(word) {
  currentWord = word;

  // Show card, hide placeholder
  formPanelEmpty.style.display = 'none';
  editFormCard.style.display   = 'block';

  // Header
  editFormWordTitle.textContent = word.word;
  const metaParts = [
    word.pos               ? word.pos              : null,
    word.frequency?.band   ? word.frequency.band   : null,
    word.linguistic?.ipa   ? word.linguistic.ipa   : null,
  ].filter(Boolean);
  editFormWordMeta.textContent = metaParts.join('  ·  ');

  // Identity
  document.getElementById('editWord').value        = word.word;
  document.getElementById('editWordDisplay').textContent = word.word;
  document.getElementById('editTranslation').value     = word.translation || '';

  // Classification
  setSelectValue('editPos',        word.pos        || '');
  setSelectValue('editDifficulty', word.difficulty || '');
  setSelectValue('editBand',       word.frequency?.band || '');

  const editDomainEl = document.getElementById('editDomain');
  const firstDomain  = (word.domains && word.domains[0]) || '';
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

  // Translations
  document.getElementById('editGlosses').value =
    (word.glosses || []).join('\n');

  // Linguistic
  document.getElementById('editIPA').value       = word.linguistic?.ipa       || '';
  document.getElementById('editSyllables').value = word.linguistic?.syllables
    ? (Array.isArray(word.linguistic.syllables)
        ? word.linguistic.syllables.join('-')
        : word.linguistic.syllables)
    : '';
  setSelectValue('editGender',   word.linguistic?.gender   || '');
  document.getElementById('editPlural').value    = word.linguistic?.plural     || '';
  document.getElementById('editInfinitive').value = word.linguistic?.infinitive || '';
  setSelectValue('editRegister', word.linguistic?.register || '');
  document.getElementById('editReflexive').checked = Boolean(word.linguistic?.reflexive);

  // Frequency
  document.getElementById('editRank').value           = word.frequency?.rank            ?? '';
  document.getElementById('editCorpusFrequency').value = word.frequency?.corpus_frequency ?? '';

  // Examples
  document.getElementById('editExamples').value =
    (word.examples || []).join('\n');

  // Picture Quiz
  document.getElementById('editEmoji').value = word.emoji || '';

  // Notes
  document.getElementById('editNotes').value = word.notes || '';
}

function setSelectValue(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  // Try direct assignment; if value not in options, add it temporarily
  el.value = value;
  if (el.value !== value && value) {
    const opt = document.createElement('option');
    opt.value = opt.textContent = value;
    el.appendChild(opt);
    el.value = value;
  }
}

function collectFormData() {
  const glossLines   = document.getElementById('editGlosses').value
    .split('\n').map(g => g.trim()).filter(Boolean);
  const exampleLines = document.getElementById('editExamples').value
    .split('\n').map(e => e.trim()).filter(Boolean);

  const syllablesRaw = document.getElementById('editSyllables').value.trim();
  const rank         = document.getElementById('editRank').value;
  const corpusFreq   = document.getElementById('editCorpusFrequency').value;
  const domainVal    = document.getElementById('editDomain').value;

  return {
    translation: document.getElementById('editTranslation').value.trim(),
    pos:        document.getElementById('editPos').value || null,
    emoji:      document.getElementById('editEmoji').value.trim() || null,
    difficulty: document.getElementById('editDifficulty').value || null,
    notes:      document.getElementById('editNotes').value.trim(),
    glosses:    glossLines,
    examples:   exampleLines,
    domains:    domainVal ? [domainVal] : [],
    linguistic: {
      ipa:        document.getElementById('editIPA').value.trim()        || null,
      syllables:  syllablesRaw || null,
      gender:     document.getElementById('editGender').value            || null,
      plural:     document.getElementById('editPlural').value.trim()     || null,
      infinitive: document.getElementById('editInfinitive').value.trim() || null,
      register:   document.getElementById('editRegister').value          || null,
      reflexive:  document.getElementById('editReflexive').checked,
    },
    frequency: {
      band:             document.getElementById('editBand').value         || null,
      rank:             rank         ? parseInt(rank, 10)   : null,
      corpus_frequency: corpusFreq   ? parseFloat(corpusFreq) : null,
    },
  };
}

function clearForm() {
  formPanelEmpty.style.display = '';
  editFormCard.style.display   = 'none';
  currentWord = null;
  document.querySelectorAll('.word-item').forEach(w => w.classList.remove('active'));
}

// ── Save ──────────────────────────────────────────────────────────────────────

async function saveWord() {
  if (!currentWord) return;
  try {
    saveBtn.disabled    = true;
    saveBtn.textContent = 'Saving…';

    const result = await apiCall(
      `/vocab/${encodeURIComponent(currentWord.word)}?lang=${langSelect.value}`,
      'POST',
      collectFormData()
    );

    currentWord = result.word;

    // Update header meta in form
    const metaParts = [
      result.word.pos              || null,
      result.word.frequency?.band  || null,
      result.word.linguistic?.ipa  || null,
    ].filter(Boolean);
    editFormWordMeta.textContent = metaParts.join('  ·  ');

    showStatus('Saved: ' + result.word.word, 'success');
    loadWords();
  } catch (err) {
    showStatus('Save error: ' + err.message, 'error');
  } finally {
    saveBtn.disabled    = false;
    saveBtn.textContent = '💾 Save';
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

export function initEditor() {
  // Filter/lang changes → reload word list
  langSelect.addEventListener('change', () => { clearForm(); loadWords(); });
  filterPos.addEventListener('change', loadWords);
  filterBand.addEventListener('change', loadWords);
  filterDomain.addEventListener('change', loadWords);

  // Search: debounce on input, immediate on Enter or button click
  const debouncedLoad = debounce(loadWords, 350);
  searchInput.addEventListener('input', debouncedLoad);
  searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); loadWords(); } });
  searchBtn.addEventListener('click', loadWords);

  // Clear filters
  clearFiltersBtn.addEventListener('click', () => {
    searchInput.value  = '';
    filterPos.value    = '';
    filterBand.value   = '';
    filterDomain.value = '';
    loadWords();
  });

  // Form actions
  saveBtn.addEventListener('click', saveWord);
  resetBtn.addEventListener('click', () => { if (currentWord) populateForm(currentWord); });
  cancelBtn.addEventListener('click', clearForm);

  // Load initial word list
  loadWords();
}
