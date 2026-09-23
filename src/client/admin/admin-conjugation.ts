/**
 * admin-conjugation.ts
 *
 * Conjugation Editor tab — pick a verb, pick a tense, edit and save its
 * conjugated forms.
 *
 * Every word already carries its fully computed conjugations in
 * `linguistic.conjugations` (shape-word.ts) — for a rule-engine verb
 * (`linguistic.conjugation_class` set, currently Spanish only) that's
 * verb-rules.ts's `conjugate()` output; for every other language it's a
 * parse of the `conjugations` column, stored directly. This tab just reads
 * that instead of starting blank, and on Save either:
 *   - merges the edited tense into a copy of `linguistic.conjugations` and
 *     PATCHes that (non-rule-engine verbs), or
 *   - merges it into a copy of `linguistic.conjugation_overrides` and PATCHes
 *     *that* instead (rule-engine verbs) — their `conjugations` column is
 *     never read (shape-word.ts), so writing there would silently do nothing.
 * Either way the merge happens here, client-side, using data this tab
 * already has in memory — the PATCH endpoint replaces the column wholesale,
 * so sending only the edited tense would wipe out every other one.
 */

import { escapeHtml, showStatus } from './admin-api.js';
import { getAdminDataClient } from './admin-data-client.js';
import { langFlagImg } from './admin-languages.js';
import type { WordUpdateBody } from '../../shared/vocab/write.js';

// ── Pronoun & tense data ──────────────────────────────────────────────────────

const PRONOUNS: Record<string, string[]> = {
  spanish:    ['yo', 'tú', 'él / ella / Ud.', 'nosotros', 'vosotros', 'ellos / ellas / Uds.'],
  portuguese: ['eu', 'tu', 'ele / ela / você', 'nós', 'vós', 'eles / elas / vocês'],
  italian:    ['io', 'tu', 'lui / lei / Lei', 'noi', 'voi', 'loro'],
  french:     ['je', 'tu', 'il / elle / on', 'nous', 'vous', 'ils / elles'],
  german:     ['ich', 'du', 'er / sie / es', 'wir', 'ihr', 'sie / Sie'],
};

// Which tenses actually exist per language, in display order — verified
// against the real data (data/vocabulary.db) rather than assumed: French
// has no stored `preterite`, German has only `present`/`preterite`
// (`conjugations` there is a flat { present, preterite, past_participle }
// — no imperfect/future/conditional/subjunctive/imperative at all, since
// German doesn't build those as single conjugated forms the way the
// Romance languages here do). Offering a chip for a tense a language's
// data can never hold would just show a permanently-blank table with no
// way to know whether that's "not entered yet" or "doesn't apply".
//
// Spanish's four extra entries (imperfect_subjunctive/future_subjunctive/
// imperative_affirmative/imperative_negative) exist only because Spanish is
// the one language driven by the rule engine (verb-rules.ts's conjugate())
// instead of stored JSON — its VerbForms interface computes all four
// uniformly for every verb, the same as the main app's own practice modes
// already expose (conjugation.css's [data-tense] hue map covers exactly
// these keys). The plain `imperative` field conjugate() also fills in is a
// single value (one pronoun slot, not six) and is superseded here by the
// two fuller affirmative/negative forms.
const TENSE_KEYS: Record<string, string[]> = {
  spanish: [
    'present', 'preterite', 'imperfect', 'future', 'conditional', 'subjunctive',
    'imperfect_subjunctive', 'future_subjunctive', 'imperative_affirmative', 'imperative_negative',
  ],
  portuguese: ['present', 'preterite', 'imperfect', 'future', 'conditional', 'subjunctive', 'imperative'],
  italian:    ['present', 'preterite', 'imperfect', 'future', 'conditional', 'subjunctive', 'imperative'],
  french:     ['present', 'imperfect', 'future', 'conditional', 'subjunctive', 'imperative'],
  german:     ['present', 'preterite'],
};

const TENSE_LABELS: Record<string, Record<string, string>> = {
  spanish: {
    present: 'Presente', preterite: 'Pretérito Indefinido', imperfect: 'Pretérito Imperfecto',
    future: 'Futuro', conditional: 'Condicional', subjunctive: 'Subjuntivo Presente',
    imperfect_subjunctive: 'Subjuntivo Imperfecto', future_subjunctive: 'Subjuntivo Futuro',
    imperative_affirmative: 'Imperativo Afirmativo', imperative_negative: 'Imperativo Negativo',
  },
  portuguese: {
    present: 'Presente', preterite: 'Pretérito Perfeito', imperfect: 'Pretérito Imperfeito',
    future: 'Futuro', conditional: 'Condicional', subjunctive: 'Subjuntivo Presente', imperative: 'Imperativo',
  },
  italian: {
    present: 'Presente', preterite: 'Passato Prossimo', imperfect: 'Imperfetto',
    future: 'Futuro Semplice', conditional: 'Condizionale', subjunctive: 'Congiuntivo Presente', imperative: 'Imperativo',
  },
  french: {
    present: 'Présent', imperfect: 'Imparfait',
    future: 'Futur Simple', conditional: 'Conditionnel', subjunctive: 'Subjonctif Présent', imperative: 'Impératif',
  },
  german: {
    present: 'Präsens', preterite: 'Präteritum',
  },
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface VerbLinguistic {
  conjugation_class?: string;
  // Every tense key maps to the same 6-pronoun array PRONOUNS[lang] does,
  // except gerund/past_participle, which are single strings — see
  // verb-rules.ts's VerbForms. Loosely typed here (values arrive as
  // whatever this word's JSON actually held, not guaranteed complete).
  conjugations?: Record<string, string[] | string | undefined>;
  conjugation_overrides?: Record<string, string[] | string | undefined>;
}

interface VerbWord {
  word: string;
  translation?: string;
  glosses?: string[];
  tags?: string[];
  // Nested under linguistic in the shared Word shape (shape-word.ts) that
  // both the Tauri and HTTP paths return.
  linguistic?: VerbLinguistic;
  frequency?: { rank?: number | null; band?: string | null };
}

// ── DOM refs ──────────────────────────────────────────────────────────────────

const conjLangSelect     = document.getElementById('conjLangSelect')     as HTMLSelectElement;
const conjLangSelectFlag = document.getElementById('conjLangSelectFlag') as HTMLElement;
const conjSearchInput    = document.getElementById('conjSearchInput')    as HTMLInputElement;
const conjSearchBtn      = document.getElementById('conjSearchBtn')      as HTMLButtonElement;
const conjVerbList       = document.getElementById('conjVerbList')       as HTMLElement;
const conjVerbCount      = document.getElementById('conjVerbCount')      as HTMLElement;
const conjVerbPrevBtn    = document.getElementById('conjVerbPrevBtn')    as HTMLButtonElement;
const conjVerbNextBtn    = document.getElementById('conjVerbNextBtn')    as HTMLButtonElement;
const conjVerbPageSelect = document.getElementById('conjVerbPageSelect') as HTMLSelectElement;
const conjEmptyState     = document.getElementById('conjEmptyState')     as HTMLElement;
const conjTableCard      = document.getElementById('conjTableCard')      as HTMLElement;
const conjVerbTitle      = document.getElementById('conjVerbTitle')      as HTMLElement;
const conjVerbGlosses    = document.getElementById('conjVerbGlosses')    as HTMLElement;
const conjTenseChips     = document.getElementById('conjTenseChips')     as HTMLElement;
const conjTensesAllBtn   = document.getElementById('conjTensesAll')      as HTMLButtonElement;
const conjTensesNoneBtn  = document.getElementById('conjTensesNone')     as HTMLButtonElement;
const conjTableHeadRow   = document.getElementById('conjTableHeadRow')   as HTMLElement;
const conjTableBody      = document.getElementById('conjTableBody')      as HTMLElement;
const conjExtraForms     = document.getElementById('conjExtraForms')     as HTMLElement;
const conjClearBtn       = document.getElementById('conjClearBtn')       as HTMLButtonElement;
const conjResetBtn       = document.getElementById('conjResetBtn')       as HTMLButtonElement;
const conjSaveBtn        = document.getElementById('conjSaveBtn')        as HTMLButtonElement;

// ── State ─────────────────────────────────────────────────────────────────────

let selectedVerb: VerbWord | null = null;
// Multi-select, like the main app's own tense chips (modes/conjugation/
// controls.ts's activeTenses()) — every chosen tense renders as its own
// column in the table (renderTable()) instead of swapping the table's
// single column of values out for a different tense's.
let selectedTenseKeys = new Set<string>();

const VERB_LIST_PAGE_SIZE = 50;
let verbListPage  = 1;
let verbListPages = 1;
/** The current page's verbs, keyed by word — selectVerb() and the pager
 *  both need to look one up by word without re-fetching. */
let verbsByWord = new Map<string, VerbWord>();

// ── Helpers ───────────────────────────────────────────────────────────────────

function currentLang(): string { return conjLangSelect.value; }

function debounce<Args extends unknown[]>(fn: (...args: Args) => void, ms: number): (...args: Args) => void {
  let t: ReturnType<typeof setTimeout>;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/** Keeps the flag next to #conjLangSelect in sync — <option> can't hold
 *  an <img> itself, so this is the closest a native select gets to one. */
function refreshConjLangFlag(): void {
  conjLangSelectFlag.innerHTML = '';
  conjLangSelectFlag.appendChild(langFlagImg(conjLangSelect.value));
}

/** Multi-select, like the main app's own tense chips — every currently-
 *  selected key stays selected across a language switch where it still
 *  exists; a key the new language doesn't have (e.g. switching away from
 *  Spanish drops its four rule-engine-only tenses) is quietly dropped
 *  rather than left dangling. Defaults to just "present" the first time a
 *  language's chips are built (nothing selected yet). */
function buildTenseChips(lang: string): void {
  const keys = TENSE_KEYS[lang] ?? [];
  const keySet = new Set(keys);

  if (selectedTenseKeys.size === 0) {
    selectedTenseKeys = new Set(keys[0] ? [keys[0]] : []);
  } else {
    selectedTenseKeys = new Set([...selectedTenseKeys].filter(k => keySet.has(k)));
    if (selectedTenseKeys.size === 0 && keys[0]) selectedTenseKeys.add(keys[0]);
  }

  conjTenseChips.innerHTML = '';
  keys.forEach(key => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'conj-tense-chip' + (selectedTenseKeys.has(key) ? ' active' : '');
    chip.dataset.tense = key;
    chip.textContent = TENSE_LABELS[lang]?.[key] ?? key;
    chip.addEventListener('click', () => {
      if (selectedTenseKeys.has(key)) selectedTenseKeys.delete(key); else selectedTenseKeys.add(key);
      // Never allow an empty selection — an empty table says nothing.
      if (selectedTenseKeys.size === 0) selectedTenseKeys.add(key);
      chip.classList.toggle('active', selectedTenseKeys.has(key));
      renderTable();
    });
    conjTenseChips.appendChild(chip);
  });
}

// ── Verb list ─────────────────────────────────────────────────────────────────

/** Rebuilds the jump-to-page <select> only when the page count changes —
 *  same reasoning as Word Editor's own updateWordListPager(). */
function updateVerbListPager(): void {
  if (conjVerbPageSelect.options.length !== verbListPages) {
    conjVerbPageSelect.innerHTML = '';
    for (let i = 0; i < verbListPages; i++) {
      const opt = document.createElement('option');
      opt.value = String(i + 1);
      opt.textContent = `Page ${i + 1} of ${verbListPages}`;
      conjVerbPageSelect.appendChild(opt);
    }
  }
  conjVerbPageSelect.value = String(verbListPage);
  conjVerbPrevBtn.disabled = verbListPage <= 1;
  conjVerbNextBtn.disabled = verbListPage >= verbListPages;
}

async function loadVerbs(): Promise<void> {
  const lang  = currentLang();
  const query = conjSearchInput.value.trim();

  conjVerbList.innerHTML = '<div class="conj-verb-list-empty">Loading…</div>';
  conjVerbCount.textContent = '—';

  try {
    const data = await getAdminDataClient().getVocabPage({
      lang, pos: 'verb', limit: VERB_LIST_PAGE_SIZE, page: verbListPage, search: query || undefined,
    });
    const words = (data.words as VerbWord[]).filter(
      w => !w.tags?.includes('function_word') && w.linguistic?.conjugation_class !== 'irregular-hay'
    );
    verbListPage  = data.page;
    verbListPages = Math.max(1, data.pages);
    verbsByWord   = new Map(words.map(w => [w.word, w]));
    updateVerbListPager();

    conjVerbCount.textContent = String(data.total);

    if (words.length === 0) {
      conjVerbList.innerHTML = '<div class="conj-verb-list-empty">No verbs found</div>';
      return;
    }

    // Same row shape as Word Editor's own word list (word-list.css's
    // .word-item/.word-item-rank/.word-item-key/.word-item-translation) —
    // rank badge, the verb's own word bold and accent-colored, translation
    // muted beside it — rather than this tab's old bespoke
    // .conj-verb-item/-display/-gloss classes, which showed the
    // translation as the primary text and no rank at all.
    conjVerbList.innerHTML = words.map(w => {
      const rankHtml = w.frequency?.rank != null
        ? `<span class="word-item-rank">${escapeHtml(String(w.frequency.rank))}</span>`
        : '<span class="word-item-rank">—</span>';
      const translationHtml = w.translation
        ? `<span class="word-item-translation">${escapeHtml(w.translation)}</span>`
        : '';
      return `
        <div class="word-item ${selectedVerb?.word === w.word ? 'active' : ''}" data-word="${escapeHtml(w.word)}">
          ${rankHtml}
          <span class="word-item-key">${escapeHtml(w.word)}</span>${translationHtml}
        </div>
      `;
    }).join('');

    conjVerbList.querySelectorAll<HTMLElement>('.word-item').forEach(item => {
      item.addEventListener('click', () => {
        const verb = verbsByWord.get(item.dataset.word ?? '');
        if (verb) selectVerb(verb);
      });
    });
  } catch (err) {
    conjVerbList.innerHTML = `<div class="conj-verb-list-empty" style="color:var(--danger)">Error: ${escapeHtml(err instanceof Error ? err.message : String(err))}</div>`;
    verbListPages = 1;
    updateVerbListPager();
  }
}

// ── Select a verb and render the table ───────────────────────────────────────

function selectVerb(verb: VerbWord): void {
  selectedVerb = verb;

  conjVerbList.querySelectorAll<HTMLElement>('.word-item').forEach(el => {
    el.classList.toggle('active', el.dataset.word === verb.word);
  });

  conjEmptyState.style.display = 'none';
  // .conj-table-card is display:flex (header/chips/table/extra-forms stack
  // via flex-direction:column) — 'block' would silently drop that layout.
  conjTableCard.style.display  = 'flex';

  conjVerbTitle.textContent   = verb.translation ?? verb.word;
  conjVerbGlosses.textContent = verb.glosses?.join(', ') ?? '';

  buildTenseChips(currentLang());
  renderTable();
}

// ── Render / re-render conjugation table ─────────────────────────────────────

function tenseValues(tenseKey: string): string[] {
  const raw = selectedVerb?.linguistic?.conjugations?.[tenseKey];
  return Array.isArray(raw) ? raw : [];
}

/** One column per selected tense, not one table per tense — the table
 *  rebuilds its header + every row whenever the tense-chip selection
 *  changes (buildTenseChips()'s click handler calls this), rather than
 *  swapping a single "Conjugated form" column's values out from under the
 *  pronoun rows the way this tab used to. Colored per-column via
 *  [data-tense] on both the header cell and each input in it — same
 *  --tense-hue formula the chips themselves and the main app's own
 *  practice-mode tables use (conjugation.css). */
function renderTable(): void {
  if (!selectedVerb) return;

  const lang      = currentLang();
  const pronouns  = PRONOUNS[lang] ?? [];
  const tenseKeys = (TENSE_KEYS[lang] ?? []).filter(k => selectedTenseKeys.has(k));
  const valuesByTense = new Map(tenseKeys.map(key => [key, tenseValues(key)]));

  conjTableHeadRow.innerHTML = '<th class="conj-th-pronoun">Pronoun</th>' +
    tenseKeys.map(key =>
      `<th class="conj-th-form" data-tense="${escapeHtml(key)}">${escapeHtml(TENSE_LABELS[lang]?.[key] ?? key)}</th>`
    ).join('');

  conjTableBody.innerHTML = pronouns.map((pronoun, i) => `
    <tr>
      <td class="conj-pronoun" data-pi="${i}">${escapeHtml(pronoun)}</td>
      ${tenseKeys.map(key => `
        <td class="conj-input-cell">
          <input
            type="text"
            class="conj-input"
            data-tense="${escapeHtml(key)}"
            data-index="${i}"
            value="${escapeHtml(valuesByTense.get(key)?.[i] ?? '')}"
            autocomplete="off"
            autocorrect="off"
            autocapitalize="off"
            spellcheck="false"
            placeholder="…"
          >
        </td>
      `).join('')}
    </tr>
  `).join('');

  const inputs = Array.from(conjTableBody.querySelectorAll<HTMLInputElement>('.conj-input'));
  inputs.forEach((inp, idx) => {
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) {
        e.preventDefault();
        inputs[(idx + 1) % inputs.length].focus();
      }
    });
  });

  renderExtraForms();
}

/** Gerund / past participle — single strings, not per-pronoun, so they get
 *  their own two fields below the table rather than two more table rows. */
function renderExtraForms(): void {
  const conj = selectedVerb?.linguistic?.conjugations;
  const gerund = typeof conj?.gerund === 'string' ? conj.gerund : '';
  const participle = typeof conj?.past_participle === 'string' ? conj.past_participle : '';

  // Colored the same [data-tense]/--tense-hue way as the table's own
  // columns (renderTable() above) — gerund=285, past_participle=45,
  // matching the main app's own [data-tense] map (conjugation.css) key
  // for key. Both the label and the input itself carry data-tense so the
  // field reads as one colored unit rather than a plain label beside a
  // colored box.
  conjExtraForms.hidden = false;
  conjExtraForms.innerHTML = `
    <div class="conj-extra-form-group">
      <label for="conjGerund" data-tense="gerund">Gerund</label>
      <input type="text" id="conjGerund" class="conj-input" data-tense="gerund" value="${escapeHtml(gerund)}" autocomplete="off" spellcheck="false" placeholder="…">
    </div>
    <div class="conj-extra-form-group">
      <label for="conjPastParticiple" data-tense="past_participle">Past Participle</label>
      <input type="text" id="conjPastParticiple" class="conj-input" data-tense="past_participle" value="${escapeHtml(participle)}" autocomplete="off" spellcheck="false" placeholder="…">
    </div>
  `;
}

// ── Buttons ───────────────────────────────────────────────────────────────────

function clearInputs(): void {
  conjTableBody.querySelectorAll<HTMLInputElement>('.conj-input').forEach(inp => { inp.value = ''; });
  const first = conjTableBody.querySelector<HTMLInputElement>('.conj-input');
  if (first) first.focus();
}

/** Merges every currently-rendered tense column (and gerund/past participle,
 *  if changed) into a copy of whatever this verb's conjugation data already
 *  held, and saves that whole object — the PATCH endpoint replaces the
 *  column wholesale, so sending only the selected tenses would erase every
 *  other one already stored for this verb (one not currently selected/
 *  rendered is left untouched in `merged`, copied over from `source`). */
async function saveConjugation(): Promise<void> {
  if (!selectedVerb) return;

  const byTense = new Map<string, string[]>();
  conjTableBody.querySelectorAll<HTMLInputElement>('.conj-input').forEach(inp => {
    const key = inp.dataset.tense ?? '';
    const idx = Number(inp.dataset.index ?? '0');
    const values = byTense.get(key) ?? [];
    values[idx] = inp.value.trim();
    byTense.set(key, values);
  });

  const gerund = (document.getElementById('conjGerund') as HTMLInputElement | null)?.value.trim() ?? '';
  const participle = (document.getElementById('conjPastParticiple') as HTMLInputElement | null)?.value.trim() ?? '';

  const isRuleEngine = Boolean(selectedVerb.linguistic?.conjugation_class);
  const source = isRuleEngine ? selectedVerb.linguistic?.conjugation_overrides : selectedVerb.linguistic?.conjugations;
  const merged: Record<string, string[] | string | undefined> = { ...(source ?? {}) };
  byTense.forEach((values, key) => { merged[key] = values; });
  if (gerund)      merged.gerund = gerund;      else delete merged.gerund;
  if (participle)  merged.past_participle = participle; else delete merged.past_participle;

  const patch: WordUpdateBody = {
    linguistic: isRuleEngine ? { conjugation_overrides: merged } : { conjugations: merged },
  };

  const lang = currentLang();
  try {
    conjSaveBtn.disabled    = true;
    conjSaveBtn.textContent = 'Saving…';
    const result = await getAdminDataClient().updateWord(selectedVerb.word, lang, patch);
    selectedVerb = result.word as VerbWord;
    verbsByWord.set(selectedVerb.word, selectedVerb);
    showStatus('Saved: ' + selectedVerb.word, 'success');
  } catch (err) {
    showStatus('Save error: ' + (err instanceof Error ? err.message : String(err)), 'error');
  } finally {
    conjSaveBtn.disabled    = false;
    conjSaveBtn.textContent = '💾 Save';
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

export function initConjugation(): void {
  refreshConjLangFlag();

  conjLangSelect.addEventListener('change', () => {
    refreshConjLangFlag();
    selectedVerb = null;
    conjEmptyState.style.display = 'flex';
    conjTableCard.style.display  = 'none';
    verbListPage = 1;
    void loadVerbs();
  });

  const resetSearchAndLoad = (): void => { verbListPage = 1; void loadVerbs(); };
  // Live-narrows as you type, same as Word Editor's own search box — not
  // just on Enter/Search-click, which this used to be limited to.
  const debouncedSearch = debounce(resetSearchAndLoad, 350);
  conjSearchBtn.addEventListener('click', resetSearchAndLoad);
  conjSearchInput.addEventListener('input', debouncedSearch);
  conjSearchInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); resetSearchAndLoad(); }
  });

  conjVerbPrevBtn.addEventListener('click', () => { if (verbListPage > 1) { verbListPage--; void loadVerbs(); } });
  conjVerbNextBtn.addEventListener('click', () => { if (verbListPage < verbListPages) { verbListPage++; void loadVerbs(); } });
  conjVerbPageSelect.addEventListener('change', () => {
    const n = Number(conjVerbPageSelect.value);
    if (Number.isFinite(n) && n !== verbListPage) { verbListPage = n; void loadVerbs(); }
  });

  conjClearBtn.addEventListener('click', clearInputs);
  conjResetBtn.addEventListener('click', () => { renderTable(); });
  conjSaveBtn.addEventListener('click', () => void saveConjugation());

  conjTensesAllBtn.addEventListener('click', () => {
    selectedTenseKeys = new Set(TENSE_KEYS[currentLang()] ?? []);
    conjTenseChips.querySelectorAll('.conj-tense-chip').forEach(c => c.classList.add('active'));
    renderTable();
  });
  conjTensesNoneBtn.addEventListener('click', () => {
    // "None" leaves the first tense on, same as the main app's own
    // #conjTensesNone — an empty table says nothing.
    const keys = TENSE_KEYS[currentLang()] ?? [];
    selectedTenseKeys = new Set(keys[0] ? [keys[0]] : []);
    conjTenseChips.querySelectorAll<HTMLElement>('.conj-tense-chip').forEach((c, i) => {
      c.classList.toggle('active', i === 0);
    });
    renderTable();
  });

  void loadVerbs();
}
