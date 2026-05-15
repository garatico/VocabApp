/**
 * admin-conjugation.js
 *
 * Conjugation Practice tab — pick a verb, pick a tense, fill in the table.
 * MVP: purely a drill interface; no answer-checking (conjugation answers are
 * not stored in the vocabulary DB).
 */

import { apiCall, escapeHtml } from './admin-api.js';

// ── Pronoun & tense data ──────────────────────────────────────────────────────

const PRONOUNS = {
  spanish:    ['yo', 'tú', 'él / ella / Ud.', 'nosotros', 'vosotros', 'ellos / ellas / Uds.'],
  portuguese: ['eu', 'tu', 'ele / ela / você', 'nós', 'vós', 'eles / elas / vocês'],
  italian:    ['io', 'tu', 'lui / lei / Lei', 'noi', 'voi', 'loro'],
  french:     ['je', 'tu', 'il / elle / on', 'nous', 'vous', 'ils / elles'],
};

const TENSES = {
  spanish:    ['Presente', 'Pretérito Indefinido', 'Pretérito Imperfecto', 'Futuro', 'Condicional', 'Subjuntivo Presente'],
  portuguese: ['Presente', 'Pretérito Perfeito', 'Pretérito Imperfeito', 'Futuro', 'Condicional', 'Subjuntivo Presente'],
  italian:    ['Presente', 'Passato Prossimo', 'Imperfetto', 'Futuro Semplice', 'Condizionale', 'Congiuntivo Presente'],
  french:     ['Présent', 'Passé Composé', 'Imparfait', 'Futur Simple', 'Conditionnel', 'Subjonctif Présent'],
};

// ── DOM refs ──────────────────────────────────────────────────────────────────

const conjLangSelect   = document.getElementById('conjLangSelect');
const conjTenseSelect  = document.getElementById('conjTenseSelect');
const conjSearchInput  = document.getElementById('conjSearchInput');
const conjSearchBtn    = document.getElementById('conjSearchBtn');
const conjVerbList     = document.getElementById('conjVerbList');
const conjVerbCount    = document.getElementById('conjVerbCount');
const conjEmptyState   = document.getElementById('conjEmptyState');
const conjTableCard    = document.getElementById('conjTableCard');
const conjVerbTitle    = document.getElementById('conjVerbTitle');
const conjVerbGlosses  = document.getElementById('conjVerbGlosses');
const conjTenseLabel   = document.getElementById('conjTenseLabel');
const conjTableBody    = document.getElementById('conjTableBody');
const conjClearBtn     = document.getElementById('conjClearBtn');
const conjResetBtn     = document.getElementById('conjResetBtn');

// ── State ─────────────────────────────────────────────────────────────────────

let selectedVerb = null;

// ── Helpers ───────────────────────────────────────────────────────────────────

function currentLang() { return conjLangSelect.value; }
function currentTense() { return conjTenseSelect.value; }

function populateTenses(lang) {
  const tenses = TENSES[lang] || [];
  conjTenseSelect.innerHTML = tenses
    .map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`)
    .join('');
}

// ── Verb list ─────────────────────────────────────────────────────────────────

async function loadVerbs() {
  const lang  = currentLang();
  const query = conjSearchInput.value.trim();

  conjVerbList.innerHTML = '<div class="conj-verb-list-empty">Loading…</div>';
  conjVerbCount.textContent = '—';

  try {
    const params = new URLSearchParams({ lang, pos: 'verb', limit: '200' });
    if (query) params.set('search', query);

    const data = await apiCall(`/words?${params}`);
    const words = data.words ?? data;

    conjVerbCount.textContent = words.length;

    if (words.length === 0) {
      conjVerbList.innerHTML = '<div class="conj-verb-list-empty">No verbs found</div>';
      return;
    }

    conjVerbList.innerHTML = words.map(w => `
      <div class="conj-verb-item ${selectedVerb?.word === w.word ? 'active' : ''}"
           data-word="${escapeHtml(w.word)}">
        <span class="conj-verb-display">${escapeHtml(w.display || w.word)}</span>
        <span class="conj-verb-gloss">${escapeHtml((w.glosses?.[0]) || '')}</span>
      </div>
    `).join('');

    conjVerbList.querySelectorAll('.conj-verb-item').forEach(item => {
      item.addEventListener('click', () => {
        const verb = words.find(w => w.word === item.dataset.word);
        if (verb) selectVerb(verb);
      });
    });
  } catch (err) {
    conjVerbList.innerHTML = `<div class="conj-verb-list-empty" style="color:var(--error)">Error: ${escapeHtml(err.message)}</div>`;
  }
}

// ── Select a verb and render the table ───────────────────────────────────────

function selectVerb(verb) {
  selectedVerb = verb;

  // Highlight in list
  conjVerbList.querySelectorAll('.conj-verb-item').forEach(el => {
    el.classList.toggle('active', el.dataset.word === verb.word);
  });

  // Show the card
  conjEmptyState.style.display = 'none';
  conjTableCard.style.display  = 'block';

  // Fill header
  conjVerbTitle.textContent   = verb.display || verb.word;
  conjVerbGlosses.textContent = verb.glosses?.join(', ') || '';

  renderTable();
}

// ── Render / re-render conjugation table ─────────────────────────────────────

function renderTable() {
  if (!selectedVerb) return;

  const lang    = currentLang();
  const tense   = currentTense();
  const pronouns = PRONOUNS[lang] || [];

  conjTenseLabel.textContent = tense;

  conjTableBody.innerHTML = pronouns.map((pronoun, i) => `
    <tr>
      <td class="conj-pronoun">${escapeHtml(pronoun)}</td>
      <td class="conj-input-cell">
        <input
          type="text"
          class="conj-input"
          data-index="${i}"
          autocomplete="off"
          autocorrect="off"
          autocapitalize="off"
          spellcheck="false"
          placeholder="…"
        >
      </td>
    </tr>
  `).join('');

  // Focus first input
  const first = conjTableBody.querySelector('.conj-input');
  if (first) first.focus();

  // Tab between inputs wrapping around
  const inputs = Array.from(conjTableBody.querySelectorAll('.conj-input'));
  inputs.forEach((inp, idx) => {
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) {
        e.preventDefault();
        inputs[(idx + 1) % inputs.length].focus();
      }
    });
  });
}

// ── Buttons ───────────────────────────────────────────────────────────────────

function clearInputs() {
  conjTableBody.querySelectorAll('.conj-input').forEach(inp => { inp.value = ''; });
  const first = conjTableBody.querySelector('.conj-input');
  if (first) first.focus();
}

// ── Init ──────────────────────────────────────────────────────────────────────

export function initConjugation() {
  // Populate tenses for the initial language
  populateTenses(currentLang());

  // Language change → repopulate tenses + reload verb list
  conjLangSelect.addEventListener('change', () => {
    populateTenses(currentLang());
    selectedVerb = null;
    conjEmptyState.style.display = 'flex';
    conjTableCard.style.display  = 'none';
    loadVerbs();
  });

  // Tense change → re-render table (keeps typed answers — reset explicitly)
  conjTenseSelect.addEventListener('change', () => {
    renderTable();
  });

  // Search
  conjSearchBtn.addEventListener('click', loadVerbs);
  conjSearchInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') loadVerbs();
  });

  // Clear inputs button
  conjClearBtn.addEventListener('click', clearInputs);

  // Reset → clear + re-render (same effect here since we don't store answers)
  conjResetBtn.addEventListener('click', () => {
    renderTable();
  });

  // Initial load
  loadVerbs();
}
