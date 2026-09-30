import {
  getConjOverride, setConjOverrideTense, clearConjOverride, type ConjForms,
} from '../../data/user-content.ts';
import { LANGUAGES, languageInfo } from '../../data/languages.ts';
import { loadRawWords } from '../../data/data-loader.ts';
import { createFlagImg } from '../../ui/flag-icon.ts';
import { foldKey } from '../../utils/match.ts';
import type { Word } from '../../types.ts';
import { PRONOUNS, TENSE_DEFS } from '../conjugation/data.ts';
import { el } from './shared.ts';

/**
 * my-content/conjugations.ts — correct a verb's conjugation table, in the same layout as the Admin
 * panel's Conjugation tab: a verb list on the left, and on the right the chosen tenses as coloured
 * columns of editable forms (one row per pronoun), with the gerund and past participle below.
 *
 * Saving stores only the tenses that now differ from the real vocabulary (an edit back to the original
 * un-overrides that tense); data/user-content.ts's applyConjOverrideRecord lays them over the verb
 * everywhere it is read. The real database is never touched — the Admin panel's tab is what edits that.
 */

type Forms = string[] | string;

const PAGE_SIZE = 50;
const EXTRA_KEYS = ['gerund', 'past_participle'] as const;
const EXTRA_LABELS: Record<string, string> = { gerund: 'Gerund', past_participle: 'Past Participle' };

/** Languages with a conjugation table to edit — those the Conjugation mode has tenses for. */
const CONJ_LANGS = LANGUAGES.filter(l => (TENSE_DEFS[l.name] ?? []).length > 0);

const baseForms = (w: Word): ConjForms => (w.linguistic?.conjugations ?? {}) as ConjForms;

/** A verb worth listing: it has a table, is not a function word, and is not the impersonal "hay". */
function isConjugable(w: Word): boolean {
  return w.pos === 'verb'
    && !w.tags?.includes('function_word')
    && w.linguistic?.conjugation_class !== 'irregular-hay'
    && !!w.linguistic?.conjugations && Object.keys(w.linguistic.conjugations).length > 0;
}

function sameForms(a: Forms | undefined, b: Forms | undefined): boolean {
  if (typeof a === 'string' || typeof b === 'string') return (a ?? '') === (b ?? '');
  const x = a ?? [], y = b ?? [];
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) if ((x[i] ?? '') !== (y[i] ?? '')) return false;
  return true;
}

interface ConjugationEditor {
  wrap: HTMLElement;
  /** Switches to `lang`, finds `word` in the list and opens it. */
  openWord: (lang: string, word: string) => Promise<void>;
}

let current: ConjugationEditor | null = null;

/** Opens `word` in the Conjugations editor (built with the tab). Does nothing if the tab isn't on the page. */
export async function openConjugationEditor(lang: string, word: string): Promise<void> {
  await current?.openWord(lang, word);
}

export function buildConjugationsSection(currentLang: string): HTMLElement {
  const editor = buildEditor(CONJ_LANGS.some(l => l.name === currentLang) ? currentLang : CONJ_LANGS[0]?.name ?? currentLang);
  current = editor;
  return editor.wrap;
}

function buildEditor(defaultLang: string): ConjugationEditor {
  const wrap = el('div', 'mcc');
  let lang = defaultLang;
  let verbs: Word[] = [];
  let loaded = false;
  let query = '';
  let editedOnly = false;
  let page = 1;
  let selected: Word | null = null;
  let selectedTenses = new Set<string>();

  // ── Filter bar: language, search, "edited only" ──────────────────────────
  const bar = el('div', 'mcc-filter-bar');
  const langField = el('div', 'mcc-filter-field');
  langField.appendChild(el('span', 'mcc-filter-label', 'Language'));
  const langSelect = el('select', 'mcc-select') as HTMLSelectElement;
  langSelect.setAttribute('aria-label', 'Language');
  CONJ_LANGS.forEach(l => {
    const opt = el('option', undefined, l.label) as HTMLOptionElement;
    opt.value = l.name; opt.selected = l.name === lang;
    langSelect.appendChild(opt);
  });
  const flag = el('span', 'mcc-flag');
  const syncFlag = (): void => { flag.replaceChildren(createFlagImg(languageInfo(lang).flagCountry, languageInfo(lang).label)); };
  langField.append(langSelect, flag);
  const search = el('input', 'mcc-search') as HTMLInputElement;
  search.type = 'text'; search.placeholder = 'Search verbs…';
  search.setAttribute('aria-label', 'Search verbs');
  const editedLabel = el('label', 'mcc-edited-toggle');
  const editedBox = el('input', undefined) as HTMLInputElement;
  editedBox.type = 'checkbox';
  editedLabel.append(editedBox, document.createTextNode(' Edited only'));
  bar.append(langField, el('div', 'mcc-divider'), search, editedLabel);

  // ── Split layout ─────────────────────────────────────────────────────────
  const layout = el('div', 'mcc-layout');

  const verbPanel = el('div', 'mcc-verb-panel');
  const verbHead = el('div', 'mcc-verb-panel-header');
  verbHead.appendChild(el('span', 'mcc-verb-panel-title', 'Verbs'));
  const verbCount = el('span', 'mcc-count', '—');
  verbHead.appendChild(verbCount);
  const verbList = el('div', 'mcc-verb-list');
  const pager = el('div', 'mcc-pager');
  const prevBtn = el('button', 'mcc-btn mcc-btn--secondary', '← Prev') as HTMLButtonElement;
  const nextBtn = el('button', 'mcc-btn mcc-btn--secondary', 'Next →') as HTMLButtonElement;
  const pageSelect = el('select', 'mcc-select mcc-page-select') as HTMLSelectElement;
  pageSelect.setAttribute('aria-label', 'Jump to page');
  prevBtn.type = 'button'; nextBtn.type = 'button';
  pager.append(prevBtn, pageSelect, nextBtn);
  verbPanel.append(verbHead, verbList, pager);

  const tablePanel = el('div', 'mcc-table-panel');
  const empty = el('div', 'mcc-empty-state');
  empty.append(el('div', 'mcc-hint-icon', '🔤'), el('div', 'mcc-hint-text', 'Select a verb to edit its conjugations'));
  const card = el('div', 'mcc-table-card');
  card.hidden = true;
  tablePanel.append(empty, card);
  layout.append(verbPanel, tablePanel);

  wrap.append(bar, layout);

  // ── Verb list ────────────────────────────────────────────────────────────
  const hasOverride = (w: Word): boolean => !!getConjOverride(lang, w.word);

  function filtered(): Word[] {
    const q = foldKey(query.trim());
    return verbs.filter(w =>
      (!editedOnly || hasOverride(w))
      && (!q || foldKey(w.word).includes(q) || foldKey(w.translation).includes(q)));
  }

  function renderList(): void {
    const all = filtered();
    const pages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
    page = Math.min(Math.max(1, page), pages);
    verbCount.textContent = String(all.length);

    if (pageSelect.options.length !== pages) {
      pageSelect.replaceChildren();
      for (let i = 1; i <= pages; i++) {
        const o = el('option', undefined, `Page ${i} of ${pages}`) as HTMLOptionElement;
        o.value = String(i);
        pageSelect.appendChild(o);
      }
    }
    pageSelect.value = String(page);
    prevBtn.disabled = page <= 1;
    nextBtn.disabled = page >= pages;

    verbList.replaceChildren();
    if (!loaded) { verbList.appendChild(el('div', 'mcc-verb-list-empty', 'Loading…')); return; }
    if (all.length === 0) { verbList.appendChild(el('div', 'mcc-verb-list-empty', 'No verbs found')); return; }
    all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).forEach(w => {
      const item = el('div', 'mcc-verb-item' + (selected?.word === w.word ? ' active' : ''));
      item.dataset.word = w.word;
      item.appendChild(el('span', 'mcc-verb-rank', w.rank != null ? String(w.rank) : '—'));
      item.appendChild(el('span', 'mcc-verb-key', w.word));
      if (w.translation) item.appendChild(el('span', 'mcc-verb-translation', w.translation));
      if (hasOverride(w)) item.appendChild(el('span', 'mcc-badge-edited', 'edited'));
      item.addEventListener('click', () => selectVerb(w));
      verbList.appendChild(item);
    });
  }

  async function loadVerbsFor(l: string): Promise<void> {
    lang = l;
    loaded = false;
    renderList();
    const words = await loadRawWords(l);
    if (lang !== l) return;                              // the language changed while this was loading
    verbs = words.filter(isConjugable).sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999));
    loaded = true;
    renderList();
  }

  // ── The table for the selected verb ──────────────────────────────────────
  const tenseDefs = (): { key: string; label: string }[] =>
    (TENSE_DEFS[lang] ?? []).filter(d => !(EXTRA_KEYS as readonly string[]).includes(d.key));

  function selectVerb(w: Word): void {
    selected = w;
    if (selectedTenses.size === 0) selectedTenses = new Set(['present']);
    selectedTenses = new Set([...selectedTenses].filter(k => tenseDefs().some(d => d.key === k)));
    if (selectedTenses.size === 0 && tenseDefs()[0]) selectedTenses.add(tenseDefs()[0].key);
    verbList.querySelectorAll<HTMLElement>('.mcc-verb-item').forEach(i => i.classList.toggle('active', i.dataset.word === w.word));
    renderCard();
  }

  function renderCard(): void {
    const w = selected;
    if (!w) return;
    empty.hidden = true;
    card.hidden = false;
    card.replaceChildren();

    const base = baseForms(w);
    const stored = getConjOverride(lang, w.word) ?? {};
    const effective = (tense: string): Forms | undefined => stored[tense] ?? base[tense];
    const pronouns = PRONOUNS[lang] ?? [];

    // Header: name, meaning, actions.
    const head = el('div', 'mcc-table-header');
    const titleBox = el('div');
    titleBox.append(el('div', 'mcc-verb-name', w.word), el('div', 'mcc-verb-meta', `${w.translation}${w.glosses?.length > 1 ? ' — ' + w.glosses.join(', ') : ''}`));
    const actions = el('div', 'mcc-actions');
    const save = el('button', 'mcc-btn', '💾 Save') as HTMLButtonElement;
    const reset = el('button', 'mcc-btn mcc-btn--secondary', 'Reset') as HTMLButtonElement;
    const clear = el('button', 'mcc-btn mcc-btn--ghost', 'Clear') as HTMLButtonElement;
    const revert = el('button', 'mcc-btn mcc-btn--danger', 'Revert to original') as HTMLButtonElement;
    [save, reset, clear, revert].forEach(b => { b.type = 'button'; });
    reset.title = 'Discard changes not yet saved';
    clear.title = 'Blank every box shown';
    revert.title = 'Remove every override for this verb and go back to the real forms';
    revert.hidden = Object.keys(stored).length === 0;
    actions.append(save, reset, clear, revert);
    head.append(titleBox, actions);

    // Tense chips (multi-select) with All / None.
    const chipsRow = el('div', 'mcc-chips-row');
    const chips = el('div', 'mcc-chips');
    tenseDefs().filter(d => d.key in base || d.key in stored).forEach(d => {
      const chip = el('button', 'mcc-chip' + (selectedTenses.has(d.key) ? ' active' : '') + (d.key in stored ? ' mcc-chip--changed' : ''), d.label);
      chip.type = 'button';
      chip.dataset.tense = d.key;
      chip.addEventListener('click', () => {
        if (selectedTenses.has(d.key)) selectedTenses.delete(d.key); else selectedTenses.add(d.key);
        if (selectedTenses.size === 0) selectedTenses.add(d.key);        // an empty table says nothing
        renderCard();
      });
      chips.appendChild(chip);
    });
    const chipActions = el('div', 'mcc-chips-actions');
    const allBtn = el('button', 'mcc-btn mcc-btn--ghost', 'All') as HTMLButtonElement;
    const noneBtn = el('button', 'mcc-btn mcc-btn--ghost', 'None') as HTMLButtonElement;
    allBtn.type = 'button'; noneBtn.type = 'button';
    allBtn.addEventListener('click', () => {
      selectedTenses = new Set(tenseDefs().filter(d => d.key in base || d.key in stored).map(d => d.key));
      renderCard();
    });
    noneBtn.addEventListener('click', () => {
      const first = tenseDefs().find(d => d.key in base || d.key in stored);
      selectedTenses = new Set(first ? [first.key] : []);
      renderCard();
    });
    chipActions.append(allBtn, noneBtn);
    chipsRow.append(chips, chipActions);

    // The table: a column per chosen tense, a row per pronoun.
    const shown = tenseDefs().filter(d => selectedTenses.has(d.key) && (d.key in base || d.key in stored));
    const scroll = el('div', 'mcc-table-scroll');
    const table = el('table', 'mcc-table');
    const thead = el('thead');
    const headRow = el('tr');
    headRow.appendChild(el('th', 'mcc-th-pronoun', 'Pronoun'));
    shown.forEach(d => {
      const th = el('th', 'mcc-th-form', d.label);
      th.dataset.tense = d.key;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    const tbody = el('tbody');
    const inputs: HTMLInputElement[] = [];
    const cellsByTense = new Map<string, HTMLInputElement[]>();
    const decorate = (input: HTMLInputElement, original: string): void => {
      input.classList.toggle('mcc-input--changed', input.value.trim() !== original);
    };
    pronouns.forEach((pronoun, i) => {
      const tr = el('tr');
      const th = el('td', 'mcc-pronoun', pronoun);
      th.dataset.pi = String(i);
      tr.appendChild(th);
      shown.forEach(d => {
        const eff = effective(d.key);
        const orig = Array.isArray(base[d.key]) ? (base[d.key] as string[])[i] ?? '' : '';
        const td = el('td', 'mcc-input-cell');
        const input = el('input', 'mcc-input') as HTMLInputElement;
        input.type = 'text';
        input.value = Array.isArray(eff) ? eff[i] ?? '' : '';
        input.dataset.tense = d.key;
        input.autocomplete = 'off'; input.spellcheck = false; input.placeholder = '…';
        input.setAttribute('aria-label', `${d.label}, ${pronoun}`);
        decorate(input, orig);
        input.addEventListener('input', () => decorate(input, orig));
        inputs.push(input);
        (cellsByTense.get(d.key) ?? cellsByTense.set(d.key, []).get(d.key)!)[i] = input;
        td.appendChild(input);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    inputs.forEach((inp, idx) => inp.addEventListener('keydown', e => {
      if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) { e.preventDefault(); inputs[(idx + 1) % inputs.length].focus(); }
    }));
    table.append(thead, tbody);
    scroll.appendChild(table);

    // Gerund / past participle: single strings below the table.
    const extra = el('div', 'mcc-extra-forms');
    const extraInputs = new Map<string, HTMLInputElement>();
    EXTRA_KEYS.filter(k => k in base || k in stored || (TENSE_DEFS[lang] ?? []).some(d => d.key === k)).forEach(k => {
      const eff = effective(k);
      const group = el('div', 'mcc-extra-group');
      const label = el('label', undefined, EXTRA_LABELS[k]);
      label.dataset.tense = k;
      const input = el('input', 'mcc-input') as HTMLInputElement;
      input.type = 'text'; input.value = typeof eff === 'string' ? eff : '';
      input.dataset.tense = k; input.placeholder = '…'; input.autocomplete = 'off'; input.spellcheck = false;
      input.id = `mccExtra-${k}`; label.setAttribute('for', input.id);
      const orig = typeof base[k] === 'string' ? base[k] as string : '';
      decorate(input, orig);
      input.addEventListener('input', () => decorate(input, orig));
      extraInputs.set(k, input);
      group.append(label, input);
      extra.appendChild(group);
    });
    extra.hidden = extraInputs.size === 0;

    card.append(head, chipsRow, scroll, extra);

    // ── Buttons ────────────────────────────────────────────────────────────
    save.addEventListener('click', () => {
      cellsByTense.forEach((cells, tense) => {
        const edited = pronouns.map((_, i) => (cells[i]?.value ?? '').trim());
        if (sameForms(edited, base[tense])) setConjOverrideTense(lang, w.word, tense, null);
        else setConjOverrideTense(lang, w.word, tense, edited);
      });
      extraInputs.forEach((input, key) => {
        const edited = input.value.trim();
        if (sameForms(edited, base[key])) setConjOverrideTense(lang, w.word, key, null);
        else setConjOverrideTense(lang, w.word, key, edited);
      });
      renderCard();
      renderList();
    });
    reset.addEventListener('click', () => renderCard());
    clear.addEventListener('click', () => {
      inputs.forEach(i => { i.value = ''; i.dispatchEvent(new Event('input')); });
      extraInputs.forEach(i => { i.value = ''; i.dispatchEvent(new Event('input')); });
      inputs[0]?.focus();
    });
    revert.addEventListener('click', () => { clearConjOverride(lang, w.word); renderCard(); renderList(); });
  }

  // ── Wiring ───────────────────────────────────────────────────────────────
  const resetAndRender = (): void => { page = 1; renderList(); };
  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  search.addEventListener('input', () => {
    query = search.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(resetAndRender, 200);
  });
  editedBox.addEventListener('change', () => { editedOnly = editedBox.checked; resetAndRender(); });
  prevBtn.addEventListener('click', () => { page--; renderList(); });
  nextBtn.addEventListener('click', () => { page++; renderList(); });
  pageSelect.addEventListener('change', () => { page = Number(pageSelect.value) || 1; renderList(); });
  langSelect.addEventListener('change', () => {
    selected = null;
    card.hidden = true; empty.hidden = false;
    query = ''; search.value = ''; page = 1;
    syncFlag();
    void loadVerbsFor(langSelect.value);
  });

  syncFlag();
  void loadVerbsFor(lang);

  async function openWord(l: string, word: string): Promise<void> {
    if (l !== lang) {
      langSelect.value = l;
      syncFlag();
      selected = null;
      await loadVerbsFor(l);
    }
    while (!loaded) await new Promise(r => setTimeout(r, 30));
    const w = verbs.find(v => v.word === word);
    if (!w) return;
    query = ''; search.value = ''; editedOnly = false; editedBox.checked = false;
    const idx = filtered().findIndex(v => v.word === word);
    page = Math.floor(Math.max(0, idx) / PAGE_SIZE) + 1;
    selectVerb(w);
    renderList();
    verbList.querySelector<HTMLElement>('.mcc-verb-item.active')?.scrollIntoView({ block: 'nearest' });
  }

  return { wrap, openWord };
}
