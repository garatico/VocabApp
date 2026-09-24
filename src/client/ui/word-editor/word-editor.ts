/**
 * word-editor/word-editor.ts — the whole Word Editor: filter bar, paged word
 * list, and the edit form, behind a small adapter.
 *
 * This is the Admin panel's Word Editor tab, lifted out so My Content can use
 * the same one. The host supplies a WordEditorAdapter (where words come from
 * and go to) and mounts the result; everything the learner or admin sees and
 * clicks is here.
 */

import { buildChipFilter } from './chip-filter.ts';
import { buildWordForm, type WordFormHandle, type WordFormOptions } from './form.ts';
import { escapeHtml, debounce } from './util.ts';
import type { ChipOption, WordData, WordEditorMeta, WordEditorOptions } from './types.ts';

export interface WordEditorHandle {
  /** Appends the filter bar and the list+form layout to `container`. */
  mount(container: HTMLElement): void;
  /** What the host learned about its data (POS/domain values, languages, …). */
  applyMeta(meta: WordEditorMeta): void;
  /** (Re)loads the current page of words. */
  load(): Promise<void>;
  /** Back to page 1, then loads — for when the host changed what is being listed. */
  reload(): void;
  isDirty(): boolean;
  /** Closes whatever is open without saving. */
  discard(): void;
  setPageSize(n: number): void;
  getLang(): string;
  form: WordFormHandle;
}

const DEFAULT_POS_OPTIONS: ChipOption[] = [
  'adjective', 'adverb', 'article', 'conjunction', 'noun', 'preposition', 'pronoun', 'verb',
].map(v => ({ value: v, label: v.charAt(0).toUpperCase() + v.slice(1) }));
const BAND_OPTIONS: ChipOption[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map(b => ({ value: b, label: b }));

export function createWordEditor(
  options: WordEditorOptions & Pick<WordFormOptions, 'readOnlyFields' | 'relationFields' | 'meaningNotes' | 'reorderGlosses' | 'trackOriginal'>,
): WordEditorHandle {
  const { adapter } = options;
  const p = options.idPrefix ?? '';
  const id = (name: string): string => p + name;

  // Header buttons only for what the host can actually do.
  const revertBtn = adapter.revertWord ? document.createElement('button') : null;
  if (revertBtn) {
    revertBtn.type = 'button'; revertBtn.className = 'secondary'; revertBtn.hidden = true;
    revertBtn.id = id('revertWordBtn');
    revertBtn.textContent = '↺ Revert word';
    revertBtn.title = 'Drop every edit made to this word and go back to the original';
  }
  const deleteBtn = adapter.deleteWord ? document.createElement('button') : null;
  if (deleteBtn) {
    deleteBtn.type = 'button'; deleteBtn.className = 'danger'; deleteBtn.hidden = true;
    deleteBtn.id = id('deleteWordBtn');
    deleteBtn.textContent = '🗑 Delete word';
    deleteBtn.title = 'Delete this word (one you added)';
  }
  const form = buildWordForm({
    idPrefix: p,
    readOnlyFields: options.readOnlyFields,
    relationFields: options.relationFields,
    meaningNotes: options.meaningNotes,
    reorderGlosses: options.reorderGlosses,
    trackOriginal: options.trackOriginal,
    extraHeaderButtons: [revertBtn, deleteBtn].filter((b): b is HTMLButtonElement => !!b),
  });
  /** Revert / Delete only make sense for a word that has edits / that the user added. */
  function syncHostButtons(word: WordData | null): void {
    if (revertBtn) revertBtn.hidden = !word?.edited;
    if (deleteBtn) deleteBtn.hidden = !word?.custom;
  }
  const formHost = form.host;

  let currentWord: WordData | null = null;
  let pageSize = options.pageSize ?? 50;
  let page = 1;
  let pages = 1;
  let loadToken = 0;   // a slow response from an earlier search must not overwrite a newer one

  // ── Filter bar ─────────────────────────────────────────────────────────────
  const filterBar = document.createElement('div');
  filterBar.className = 'filter-bar';
  filterBar.innerHTML = `
    <div class="filter-field">
      <span class="filter-label">Language</span>
      <select id="${id('langSelect')}"></select>
      <span class="lang-select-flag" id="${id('langSelectFlag')}"></span>
    </div>
    <div class="filter-divider"></div>
    <input type="text" id="${id('searchInput')}" placeholder="Search word, display, translation…" style="flex:1;min-width:180px;">
    <div class="filter-divider"></div>
  `;
  const langSelect = filterBar.querySelector<HTMLSelectElement>('select') as HTMLSelectElement;
  const langFlag   = filterBar.querySelector<HTMLElement>('.lang-select-flag') as HTMLElement;
  const searchInput = filterBar.querySelector<HTMLInputElement>('input[type="text"]') as HTMLInputElement;

  const initialLang = options.initialLang ?? 'spanish';
  langSelect.innerHTML = `<option value="${escapeHtml(initialLang)}">${escapeHtml(initialLang.charAt(0).toUpperCase() + initialLang.slice(1))}</option>`;
  langSelect.value = initialLang;

  function refreshLangFlag(): void {
    langFlag.innerHTML = '';
    const flag = langSelect.value ? options.langFlag?.(langSelect.value) : null;
    if (flag) langFlag.appendChild(flag);
  }

  function resetPageAndLoad(): void { page = 1; void load(); }

  const posFilter    = buildChipFilter({ stem: 'pos',    idPrefix: p, label: 'POS',    hueAttrName: 'data-pos',    onChange: resetPageAndLoad });
  const bandFilter   = buildChipFilter({ stem: 'band',   idPrefix: p, label: 'Band',   hueAttrName: 'data-band',   onChange: resetPageAndLoad });
  const domainFilter = buildChipFilter({ stem: 'domain', idPrefix: p, label: 'Domain', hueAttrName: 'data-domain', onChange: resetPageAndLoad });
  posFilter.setOptions(DEFAULT_POS_OPTIONS);
  bandFilter.setOptions(BAND_OPTIONS);
  filterBar.append(posFilter.el, bandFilter.el, domainFilter.el);

  const searchBtn = document.createElement('button');
  searchBtn.id = id('searchBtn');
  searchBtn.textContent = 'Search';
  const clearFiltersBtn = document.createElement('button');
  clearFiltersBtn.id = id('clearFiltersBtn');
  clearFiltersBtn.className = 'ghost';
  clearFiltersBtn.textContent = 'Clear';
  filterBar.append(searchBtn, clearFiltersBtn);
  if (options.filterBarExtra) filterBar.appendChild(options.filterBarExtra);

  // ── Layout: word list + form ───────────────────────────────────────────────
  const layout = document.createElement('div');
  layout.className = 'editor-layout';
  const wordPanel = document.createElement('div');
  wordPanel.className = 'word-panel';
  wordPanel.innerHTML = `
    <div class="word-list-header">
      <span class="word-list-header-title">
        <span class="word-list-title">Words</span>
        <span class="word-count" id="${id('wordCountLabel')}">—</span>
      </span>
      <button type="button" class="ghost word-list-new-btn" id="${id('newWordBtn')}" title="Add a new word">+ New Word</button>
    </div>
    <div class="word-list" id="${id('wordList')}">
      <div class="word-list-empty">Search to load words</div>
    </div>
    <div class="word-list-pager">
      <button id="${id('wordListPrevBtn')}" class="secondary" disabled>← Prev</button>
      <select id="${id('wordListPageSelect')}" class="word-list-page-select" aria-label="Jump to page">
        <option value="0">Page 1 of 1</option>
      </select>
      <button id="${id('wordListNextBtn')}" class="secondary" disabled>Next →</button>
      <span class="word-list-page-jump">
        <input type="number" id="${id('wordListPageInput')}" class="word-list-page-input" min="1" value="1" aria-label="Page number">
        <span>of <span id="${id('wordListPageTotal')}">1</span></span>
      </span>
    </div>
  `;
  layout.append(wordPanel, formHost);

  const $ = <T extends HTMLElement>(name: string): T => wordPanel.querySelector<T>(`[id="${id(name)}"]`) as T;
  const wordList      = $('wordList');
  const wordCount     = $('wordCountLabel');
  const newWordBtn    = $<HTMLButtonElement>('newWordBtn');
  const prevBtn       = $<HTMLButtonElement>('wordListPrevBtn');
  const nextBtn       = $<HTMLButtonElement>('wordListNextBtn');
  const pageSelect    = $<HTMLSelectElement>('wordListPageSelect');
  const pageInput     = $<HTMLInputElement>('wordListPageInput');
  const pageTotal     = $('wordListPageTotal');

  // ── Loading ────────────────────────────────────────────────────────────────
  async function load(): Promise<void> {
    const token = ++loadToken;
    try {
      wordList.innerHTML = '<div class="word-list-empty">Loading…</div>';
      wordCount.textContent = '…';
      const result = await adapter.fetchPage({
        lang: langSelect.value,
        limit: pageSize,
        page,
        search: searchInput.value.trim() || undefined,
        pos:    posFilter.getSelected().join(',')    || undefined,
        band:   bandFilter.getSelected().join(',')   || undefined,
        domain: domainFilter.getSelected().join(',') || undefined,
      });
      if (token !== loadToken) return;
      page = result.page;
      pages = Math.max(1, result.pages);
      renderWordList(result.words, result.total);
    } catch (err) {
      if (token !== loadToken) return;
      wordList.innerHTML = `<div class="word-list-empty" style="color:var(--danger);">Error: ${escapeHtml(err instanceof Error ? err.message : String(err))}</div>`;
      wordCount.textContent = '';
      pages = 1;
      updatePager();
    }
  }

  /** Rebuilds the jump-to-page <select> only when the page count changes — a
   *  500+ page list means 500+ options, not worth rebuilding on every turn. */
  function updatePager(): void {
    if (pageSelect.options.length !== pages) {
      pageSelect.innerHTML = '';
      for (let i = 0; i < pages; i++) {
        const opt = document.createElement('option');
        opt.value = String(i + 1);
        opt.textContent = `Page ${i + 1} of ${pages}`;
        pageSelect.appendChild(opt);
      }
    }
    pageSelect.value = String(page);
    pageInput.value = String(page);
    pageInput.max = String(pages);
    pageTotal.textContent = String(pages);
    prevBtn.disabled = page <= 1;
    nextBtn.disabled = page >= pages;
  }

  function renderWordList(words: WordData[], total: number): void {
    wordCount.textContent = String(total);
    updatePager();
    if (!words.length) {
      wordList.innerHTML = '<div class="word-list-empty">No words found</div>';
      return;
    }
    wordList.innerHTML = '';
    words.forEach(word => {
      const item = document.createElement('div');
      // A reload after a save rebuilds the list — keep the open word highlighted.
      item.className = currentWord && word.word === currentWord.word ? 'word-item active' : 'word-item';
      const badges = [
        word.custom ? '<span class="badge badge-custom" title="A word you added">added</span>' : '',
        word.edited ? '<span class="badge badge-edited" title="You have edited this word">edited</span>' : '',
        word.pos             ? `<span class="badge badge-pos" data-pos="${escapeHtml(word.pos)}">${escapeHtml(word.pos)}</span>` : '',
        word.frequency?.band ? `<span class="badge badge-band" data-band="${escapeHtml(word.frequency.band)}">${escapeHtml(word.frequency.band)}</span>` : '',
      ].join('');
      const translation = word.translation
        ? `<span class="word-item-translation">${escapeHtml(word.translation)}</span>` : '';
      const rank = word.frequency?.rank != null
        ? `<span class="word-item-rank">${escapeHtml(String(word.frequency.rank))}</span>`
        : '<span class="word-item-rank">—</span>';
      item.innerHTML = `
        ${rank}
        <span class="word-item-key">${escapeHtml(word.word)}</span>${translation}
        <span class="word-item-badges">${badges}</span>
      `;
      item.addEventListener('click', () => {
        wordList.querySelectorAll('.word-item').forEach(w => w.classList.remove('active'));
        item.classList.add('active');
        currentWord = word;
        form.populate(word);
        syncHostButtons(word);
      });
      wordList.appendChild(item);
    });
  }

  // ── Actions ────────────────────────────────────────────────────────────────
  function clearForm(): void {
    currentWord = null;
    syncHostButtons(null);
    form.close();
    wordList.querySelectorAll('.word-item').forEach(w => w.classList.remove('active'));
  }

  function startNewWord(): void {
    currentWord = null;
    syncHostButtons(null);
    wordList.querySelectorAll('.word-item').forEach(w => w.classList.remove('active'));
    form.startNew();
  }

  async function saveWord(): Promise<void> {
    const creating = form.isCreating();
    if (!currentWord && !creating) return;
    const key = form.getKey();
    if (creating && !key) { adapter.notify('Enter a word key before saving', 'error'); return; }

    try {
      form.saveBtn.disabled = true;
      form.saveBtn.textContent = 'Saving…';
      const data = form.collect();
      const saved = creating || !currentWord
        ? await adapter.createWord(key, langSelect.value, data)
        : await adapter.updateWord(currentWord.word, langSelect.value, data);
      currentWord = saved;
      // A host that tracks the original (My Content) gets the form reloaded from
      // what was saved, so "edited" markers and restorable senses reflect it;
      // otherwise the form just keeps what was typed and refreshes its header.
      if (saved.original) form.populate(saved); else form.showSaved(saved);
      syncHostButtons(saved);
      adapter.notify('Saved: ' + saved.word, 'success');
      void load();
    } catch (err) {
      adapter.notify('Save error: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally {
      // A failed save leaves the form dirty (there is still something to
      // retry); a successful one already set it clean.
      form.saveBtn.disabled = !form.isDirty();
      form.saveBtn.textContent = '💾 Save';
    }
  }

  // ── Wiring ─────────────────────────────────────────────────────────────────
  refreshLangFlag();
  langSelect.addEventListener('change', () => { refreshLangFlag(); clearForm(); resetPageAndLoad(); });

  const debouncedLoad = debounce(resetPageAndLoad, 350);
  searchInput.addEventListener('input', debouncedLoad);
  searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); resetPageAndLoad(); } });
  searchBtn.addEventListener('click', resetPageAndLoad);
  clearFiltersBtn.addEventListener('click', () => {
    searchInput.value = '';
    posFilter.clear(); bandFilter.clear(); domainFilter.clear();
    resetPageAndLoad();
  });

  prevBtn.addEventListener('click', () => { if (page > 1) { page--; void load(); } });
  nextBtn.addEventListener('click', () => { if (page < pages) { page++; void load(); } });
  const goToEnteredPage = (): void => {
    const n = parseInt(pageInput.value, 10);
    if (!Number.isFinite(n)) { pageInput.value = String(page); return; }
    const clamped = Math.min(Math.max(n, 1), pages);
    pageInput.value = String(clamped);
    if (clamped !== page) { page = clamped; void load(); }
  };
  pageInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); goToEnteredPage(); } });
  pageInput.addEventListener('blur', goToEnteredPage);
  pageSelect.addEventListener('change', () => {
    const n = Number(pageSelect.value);
    if (Number.isFinite(n) && n !== page) { page = n; void load(); }
  });

  form.saveBtn.addEventListener('click', () => { void saveWord(); });
  revertBtn?.addEventListener('click', () => {
    if (!currentWord || !adapter.revertWord) return;
    const key = currentWord.word;
    if (adapter.confirmRevert && !adapter.confirmRevert(key)) return;
    void adapter.revertWord(key, langSelect.value).then(word => {
      currentWord = word;
      form.populate(word);
      syncHostButtons(word);
      adapter.notify(`Reverted: ${key}`, 'success');
      void load();
    }).catch(err => adapter.notify('Revert error: ' + (err instanceof Error ? err.message : String(err)), 'error'));
  });
  deleteBtn?.addEventListener('click', () => {
    if (!currentWord || !adapter.deleteWord) return;
    const key = currentWord.word;
    if (!window.confirm(`Delete "${key}"? This can't be undone.`)) return;
    void adapter.deleteWord(key, langSelect.value).then(() => {
      clearForm();
      adapter.notify(`Deleted: ${key}`, 'success');
      void load();
    }).catch(err => adapter.notify('Delete error: ' + (err instanceof Error ? err.message : String(err)), 'error'));
  });
  form.resetBtn.addEventListener('click', () => {
    if (form.isCreating()) startNewWord();
    else if (currentWord) form.populate(currentWord);
  });
  form.cancelBtn.addEventListener('click', clearForm);
  newWordBtn.addEventListener('click', startNewWord);

  return {
    mount(container) { container.append(filterBar, layout); },
    applyMeta(meta) {
      form.applyMeta(meta);
      if (meta.languages?.length) {
        const cur = langSelect.value;
        langSelect.innerHTML = meta.languages
          .map(l => `<option value="${escapeHtml(l)}">${escapeHtml(l.charAt(0).toUpperCase() + l.slice(1))}</option>`)
          .join('');
        langSelect.value = meta.languages.includes(cur) ? cur : meta.languages[0];
        refreshLangFlag();
      }
      if (meta.domains.length) domainFilter.setOptions(meta.domains.map(d => ({ value: d, label: d })));
      // The placeholder POS list is capitalised; the real one is capitalised the same way.
      if (meta.pos.length) posFilter.setOptions(meta.pos.map(v => ({ value: v, label: v.charAt(0).toUpperCase() + v.slice(1) })));
    },
    load,
    reload: resetPageAndLoad,
    isDirty: () => form.isDirty(),
    discard: clearForm,
    setPageSize(n) { pageSize = n; resetPageAndLoad(); },
    getLang: () => langSelect.value,
    form,
  };
}
