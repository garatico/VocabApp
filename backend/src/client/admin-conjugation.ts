/**
 * admin-conjugation.ts
 *
 * Conjugation Practice tab — pick a verb, pick a tense, fill in the table.
 * MVP: purely a drill interface; no answer-checking (conjugation answers are
 * not stored in the vocabulary DB).
 */

import { apiCall, escapeHtml } from './admin-api.js';

// ── Pronoun & tense data ──────────────────────────────────────────────────────

const PRONOUNS: Record<string, string[]> = {
  spanish:    ['yo', 'tú', 'él / ella / Ud.', 'nosotros', 'vosotros', 'ellos / ellas / Uds.'],
  portuguese: ['eu', 'tu', 'ele / ela / você', 'nós', 'vós', 'eles / elas / vocês'],
  italian:    ['io', 'tu', 'lui / lei / Lei', 'noi', 'voi', 'loro'],
  french:     ['je', 'tu', 'il / elle / on', 'nous', 'vous', 'ils / elles'],
};

const TENSES: Record<string, string[]> = {
  spanish:    ['Presente', 'Pretérito Indefinido', 'Pretérito Imperfecto', 'Futuro', 'Condicional', 'Subjuntivo Presente'],
  portuguese: ['Presente', 'Pretérito Perfeito', 'Pretérito Imperfeito', 'Futuro', 'Condicional', 'Subjuntivo Presente'],
  italian:    ['Presente', 'Passato Prossimo', 'Imperfetto', 'Futuro Semplice', 'Condizionale', 'Congiuntivo Presente'],
  french:     ['Présent', 'Passé Composé', 'Imparfait', 'Futur Simple', 'Conditionnel', 'Subjonctif Présent'],
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface VerbWord {
  word: string;
  translation?: string;
  glosses?: string[];
  tags?: string[];
  conjugation_class?: string;
}

// ── DOM refs ──────────────────────────────────────────────────────────────────

const conjLangSelect   = document.getElementById('conjLangSelect')  as HTMLSelectElement;
const conjTenseSelect  = document.getElementById('conjTenseSelect') as HTMLSelectElement;
const conjSearchInput  = document.getElementById('conjSearchInput') as HTMLInputElement;
const conjSearchBtn    = document.getElementById('conjSearchBtn')   as HTMLButtonElement;
const conjVerbList     = document.getElementById('conjVerbList')    as HTMLElement;
const conjVerbCount    = document.getElementById('conjVerbCount')   as HTMLElement;
const conjEmptyState   = document.getElementById('conjEmptyState')  as HTMLElement;
const conjTableCard    = document.getElementById('conjTableCard')   as HTMLElement;
const conjVerbTitle    = document.getElementById('conjVerbTitle')   as HTMLElement;
const conjVerbGlosses  = document.getElementById('conjVerbGlosses') as HTMLElement;
const conjTenseLabel   = document.getElementById('conjTenseLabel')  as HTMLElement;
const conjTableBody    = document.getElementById('conjTableBody')   as HTMLElement;
const conjClearBtn     = document.getElementById('conjClearBtn')    as HTMLButtonElement;
const conjResetBtn     = document.getElementById('conjResetBtn')    as HTMLButtonElement;

// ── State ─────────────────────────────────────────────────────────────────────

let selectedVerb: VerbWord | null = null;

// ── Helpers ───────────────────────────────────────────────────────────────────

function currentLang(): string  { return conjLangSelect.value; }
function currentTense(): string { return conjTenseSelect.value; }

function populateTenses(lang: string): void {
  const tenses = TENSES[lang] ?? [];
  conjTenseSelect.innerHTML = tenses
    .map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`)
    .join('');
}

// ── Verb list ─────────────────────────────────────────────────────────────────

async function loadVerbs(): Promise<void> {
  const lang  = currentLang();
  const query = conjSearchInput.value.trim();

  conjVerbList.innerHTML = '<div class="conj-verb-list-empty">Loading…</div>';
  conjVerbCount.textContent = '—';

  try {
    const params = new URLSearchParams({ lang, pos: 'verb', limit: '200' });
    if (query) params.set('search', query);

    const data = await apiCall(`/words?${params}`);
    const words = ((data.words ?? data) as VerbWord[]).filter(
      w => !w.tags?.includes('function_word') && w.conjugation_class !== 'irregular-hay'
    );

    conjVerbCount.textContent = String(words.length);

    if (words.length === 0) {
      conjVerbList.innerHTML = '<div class="conj-verb-list-empty">No verbs found</div>';
      return;
    }

    conjVerbList.innerHTML = words.map(w => `
      <div class="conj-verb-item ${selectedVerb?.word === w.word ? 'active' : ''}"
           data-word="${escapeHtml(w.word)}">
        <span class="conj-verb-display">${escapeHtml(w.translation || w.word)}</span>
        <span class="conj-verb-gloss">${escapeHtml(w.glosses?.[0] ?? '')}</span>
      </div>
    `).join('');

    conjVerbList.querySelectorAll<HTMLElement>('.conj-verb-item').forEach(item => {
      item.addEventListener('click', () => {
        const verb = words.find(w => w.word === item.dataset.word);
        if (verb) selectVerb(verb);
      });
    });
  } catch (err) {
    conjVerbList.innerHTML = `<div class="conj-verb-list-empty" style="color:var(--error)">Error: ${escapeHtml(err instanceof Error ? err.message : String(err))}</div>`;
  }
}

// ── Select a verb and render the table ───────────────────────────────────────

function selectVerb(verb: VerbWord): void {
  selectedVerb = verb;

  conjVerbList.querySelectorAll<HTMLElement>('.conj-verb-item').forEach(el => {
    el.classList.toggle('active', el.dataset.word === verb.word);
  });

  conjEmptyState.style.display = 'none';
  conjTableCard.style.display  = 'block';

  conjVerbTitle.textContent   = verb.translation ?? verb.word;
  conjVerbGlosses.textContent = verb.glosses?.join(', ') ?? '';

  renderTable();
}

// ── Render / re-render conjugation table ─────────────────────────────────────

function renderTable(): void {
  if (!selectedVerb) return;

  const lang     = currentLang();
  const tense    = currentTense();
  const pronouns = PRONOUNS[lang] ?? [];

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

  const first = conjTableBody.querySelector<HTMLInputElement>('.conj-input');
  if (first) first.focus();

  const inputs = Array.from(conjTableBody.querySelectorAll<HTMLInputElement>('.conj-input'));
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

function clearInputs(): void {
  conjTableBody.querySelectorAll<HTMLInputElement>('.conj-input').forEach(inp => { inp.value = ''; });
  const first = conjTableBody.querySelector<HTMLInputElement>('.conj-input');
  if (first) first.focus();
}

// ── Init ──────────────────────────────────────────────────────────────────────

export function initConjugation(): void {
  populateTenses(currentLang());

  conjLangSelect.addEventListener('change', () => {
    populateTenses(currentLang());
    selectedVerb = null;
    conjEmptyState.style.display = 'flex';
    conjTableCard.style.display  = 'none';
    loadVerbs();
  });

  conjTenseSelect.addEventListener('change', () => { renderTable(); });

  conjSearchBtn.addEventListener('click', loadVerbs);
  conjSearchInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') loadVerbs();
  });

  conjClearBtn.addEventListener('click', clearInputs);
  conjResetBtn.addEventListener('click', () => { renderTable(); });

  loadVerbs();
}
