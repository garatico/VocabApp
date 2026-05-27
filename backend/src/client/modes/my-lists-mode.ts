/**
 * my-lists-mode.ts — My Lists tab panel.
 *
 * renderMyLists(container) — call once on app init.
 * Left pane: language selector + list nav.
 * Right pane: add-words search + existing word list.
 */

import {
  getListNames,
  getList,
  addToList,
  createList,
  deleteList,
  renameList,
  removeFromList,
  refreshFilterSelect,
  getTotalListedCount,
} from '../utils/word-lists.ts';

// ── Vocabulary cache (lazy-loaded per language) ───────────────────
const vocabCache = new Map<string, string[]>();

async function fetchVocab(lang: string): Promise<string[]> {
  if (vocabCache.has(lang)) return vocabCache.get(lang)!;
  try {
    // Server expects full language names: spanish, portuguese, italian, french
    const res  = await fetch(`/api/vocab/${lang}`);
    const json = await res.json();
    const data: any[] = json.data ?? [];
    const words = data.map(w => w.word ?? '').filter(Boolean);
    vocabCache.set(lang, words);
    return words;
  } catch {
    return [];
  }
}

export function renderMyLists(container: HTMLElement): void {
  container.innerHTML = '';

  // Tab-local language -- defaults to whatever the quiz is using
  let lang: string =
    (document.getElementById('langSelect') as HTMLSelectElement | null)?.value ?? 'spanish';
  let selectedList = getListNames(lang)[0] ?? '';

  // Left pane: lang selector + header + list nav
  const leftPane     = document.createElement('div');
  leftPane.className = 'ml-left-pane';

  const langRow     = document.createElement('div');
  langRow.className = 'ml-lang-row';

  const langLabel       = document.createElement('span');
  langLabel.className   = 'ml-lang-label';
  langLabel.textContent = 'Language';

  const langSel     = document.createElement('select');
  langSel.className = 'ml-lang-select';
  (['spanish', 'portuguese', 'italian', 'french'] as const).forEach(l => {
    const opt       = document.createElement('option');
    opt.value       = l;
    opt.textContent = l.charAt(0).toUpperCase() + l.slice(1);
    opt.selected    = l === lang;
    langSel.appendChild(opt);
  });
  langSel.addEventListener('change', () => {
    lang         = langSel.value;
    selectedList = getListNames(lang)[0] ?? '';
    renderSidebar();
  });

  langRow.appendChild(langLabel);
  langRow.appendChild(langSel);
  leftPane.appendChild(langRow);

  const header     = document.createElement('div');
  header.className = 'ml-header';

  const titleSpan       = document.createElement('span');
  titleSpan.className   = 'ml-sidebar-title';
  titleSpan.textContent = 'Lists';

  const newListBtn       = document.createElement('button');
  newListBtn.type        = 'button';
  newListBtn.className   = 'ml-new-list-btn';
  newListBtn.title       = 'Create new list';
  newListBtn.textContent = '+ New';
  newListBtn.addEventListener('click', () => startCreateList());

  header.appendChild(titleSpan);
  header.appendChild(newListBtn);
  leftPane.appendChild(header);

  const listNav     = document.createElement('ul');
  listNav.className = 'ml-list-nav';
  leftPane.appendChild(listNav);

  container.appendChild(leftPane);

  // Right pane
  const panel     = document.createElement('div');
  panel.className = 'ml-panel';
  container.appendChild(panel);

  // ── Render functions ───────────────────────────────────────────

  function renderSidebar(): void {
    listNav.innerHTML = '';
    const names = getListNames(lang);

    if (names.length === 0) {
      const empty       = document.createElement('li');
      empty.className   = 'ml-list-empty';
      empty.textContent = 'No lists yet.';
      listNav.appendChild(empty);
      selectedList = '';
      renderPanel();
      return;
    }

    if (!names.includes(selectedList)) selectedList = names[0];

    names.forEach(name => {
      const li     = document.createElement('li');
      li.className = 'ml-list-item' + (name === selectedList ? ' active' : '');

      const nameSpan       = document.createElement('span');
      nameSpan.className   = 'ml-list-name';
      nameSpan.textContent = name;
      nameSpan.title       = name;

      const countSpan       = document.createElement('span');
      countSpan.className   = 'ml-list-count';
      countSpan.textContent = String(getList(lang, name).length);

      const actions     = document.createElement('span');
      actions.className = 'ml-list-actions';

      const renameBtn       = document.createElement('button');
      renameBtn.type        = 'button';
      renameBtn.className   = 'ml-icon-btn';
      renameBtn.title       = 'Rename';
      renameBtn.textContent = '✏';
      renameBtn.addEventListener('click', e => {
        e.stopPropagation();
        startRenameList(name, li, nameSpan);
      });

      const deleteBtn       = document.createElement('button');
      deleteBtn.type        = 'button';
      deleteBtn.className   = 'ml-icon-btn ml-icon-btn--danger';
      deleteBtn.title       = 'Delete list';
      deleteBtn.textContent = '🗑';
      deleteBtn.addEventListener('click', e => {
        e.stopPropagation();
        if (window.confirm('Delete list "' + name + '" and all its words?')) {
          deleteList(lang, name);
          if (selectedList === name) selectedList = '';
          updateBadge();
          renderSidebar();
        }
      });

      actions.appendChild(renameBtn);
      actions.appendChild(deleteBtn);

      li.appendChild(nameSpan);
      li.appendChild(countSpan);
      li.appendChild(actions);

      li.addEventListener('click', () => {
        selectedList = name;
        renderSidebar();
        renderPanel();
      });

      listNav.appendChild(li);
    });

    renderPanel();
  }

  function renderPanel(): void {
    panel.innerHTML = '';

    if (!selectedList) {
      const empty       = document.createElement('p');
      empty.className   = 'ml-panel-empty';
      empty.textContent = 'Create a list to get started.';
      panel.appendChild(empty);
      return;
    }

    // Panel header: list title + filter search
    const panelHeader     = document.createElement('div');
    panelHeader.className = 'ml-panel-header';

    const title       = document.createElement('h2');
    title.className   = 'ml-panel-title';
    title.textContent = selectedList;

    const filterInp       = document.createElement('input');
    filterInp.type        = 'text';
    filterInp.placeholder = 'Filter...';
    filterInp.className   = 'ml-search';
    filterInp.title       = 'Filter words already in this list';

    panelHeader.appendChild(title);
    panelHeader.appendChild(filterInp);
    panel.appendChild(panelHeader);

    // Add-words search
    const addSection     = document.createElement('div');
    addSection.className = 'ml-add-section';

    const addRow     = document.createElement('div');
    addRow.className = 'ml-add-row';

    const addIcon       = document.createElement('span');
    addIcon.className   = 'ml-add-icon';
    addIcon.textContent = '+';

    const addInp         = document.createElement('input');
    addInp.type          = 'text';
    addInp.placeholder   = 'Search vocabulary to add...';
    addInp.className     = 'ml-add-input';

    addRow.appendChild(addIcon);
    addRow.appendChild(addInp);
    addSection.appendChild(addRow);

    const addResults     = document.createElement('ul');
    addResults.className = 'ml-add-results';
    addResults.hidden    = true;
    addSection.appendChild(addResults);

    panel.appendChild(addSection);

    // Existing words list
    const listEl     = document.createElement('ul');
    listEl.className = 'ml-word-list';
    panel.appendChild(listEl);

    // Add-search logic
    let allVocab: string[] = vocabCache.get(lang) ?? [];
    fetchVocab(lang).then(words => {
      allVocab = words;
      if (document.activeElement === addInp && addInp.value.trim()) {
        renderAddResults(addInp.value.trim());
      }
    });

    function renderAddResults(query: string): void {
      addResults.innerHTML = '';
      if (!query) { addResults.hidden = true; return; }

      const currentWords = new Set(getList(lang, selectedList).map(w => w.toLowerCase()));
      const q = query.toLowerCase();
      const matches = allVocab
        .filter(w => w.toLowerCase().includes(q) && !currentWords.has(w.toLowerCase()))
        .slice(0, 10);

      if (matches.length === 0) {
        addResults.hidden = true;
        return;
      }

      matches.forEach(word => {
        const li     = document.createElement('li');
        li.className = 'ml-add-result-item';

        const wordSpan       = document.createElement('span');
        wordSpan.className   = 'ml-add-result-word';
        wordSpan.textContent = word;

        const addBtn       = document.createElement('button');
        addBtn.type        = 'button';
        addBtn.className   = 'ml-add-btn';
        addBtn.title       = 'Add to list';
        addBtn.textContent = '+';

        function doAdd(): void {
          addToList(lang, selectedList, word);
          updateBadge();
          renderAddResults(addInp.value.trim());
          renderWords(filterInp.value.trim());
          renderSidebar();
        }

        addBtn.addEventListener('click', e => { e.stopPropagation(); doAdd(); });
        li.addEventListener('click', doAdd);

        li.appendChild(wordSpan);
        li.appendChild(addBtn);
        addResults.appendChild(li);
      });

      addResults.hidden = false;
    }

    addInp.addEventListener('input', () => renderAddResults(addInp.value.trim()));

    const onClickOutside = (e: MouseEvent) => {
      if (!addSection.contains(e.target as Node)) {
        addResults.hidden = true;
      }
    };
    document.addEventListener('click', onClickOutside, true);

    // Existing words render
    function renderWords(filter = ''): void {
      listEl.innerHTML = '';
      const words = getList(lang, selectedList)
        .filter(w => !filter || w.toLowerCase().includes(filter.toLowerCase()))
        .sort();

      if (words.length === 0) {
        const empty       = document.createElement('li');
        empty.className   = 'ml-word-empty';
        empty.textContent = filter ? 'No matches.' : 'No words in this list yet.';
        listEl.appendChild(empty);
        return;
      }

      words.forEach(word => {
        const li     = document.createElement('li');
        li.className = 'ml-word-item';

        const wordSpan       = document.createElement('span');
        wordSpan.className   = 'ml-word-text';
        wordSpan.textContent = word;

        const removeBtn       = document.createElement('button');
        removeBtn.type        = 'button';
        removeBtn.className   = 'ml-remove-btn';
        removeBtn.title       = 'Remove from list';
        removeBtn.textContent = '\xD7';
        removeBtn.addEventListener('click', () => {
          removeFromList(lang, selectedList, word);
          updateBadge();
          if (addInp.value.trim()) renderAddResults(addInp.value.trim());
          renderSidebar();
        });

        li.appendChild(wordSpan);
        li.appendChild(removeBtn);
        listEl.appendChild(li);
      });
    }

    renderWords();
    filterInp.addEventListener('input', () => renderWords(filterInp.value));
  }

  function startCreateList(): void {
    const li     = document.createElement('li');
    li.className = 'ml-list-item ml-list-item--editing';

    const inp       = document.createElement('input');
    inp.type        = 'text';
    inp.placeholder = 'List name...';
    inp.className   = 'ml-list-name-input';

    const okBtn       = document.createElement('button');
    okBtn.type        = 'button';
    okBtn.className   = 'ml-icon-btn';
    okBtn.textContent = '✓';

    const cancelBtn       = document.createElement('button');
    cancelBtn.type        = 'button';
    cancelBtn.className   = 'ml-icon-btn';
    cancelBtn.textContent = '✕';

    function confirmCreate(): void {
      const name = inp.value.trim();
      if (!name) { li.remove(); return; }
      createList(lang, name);
      selectedList = name;
      updateBadge();
      renderSidebar();
    }

    okBtn.addEventListener('click', confirmCreate);
    cancelBtn.addEventListener('click', () => li.remove());
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') confirmCreate();
      if (e.key === 'Escape') li.remove();
    });

    li.appendChild(inp);
    li.appendChild(okBtn);
    li.appendChild(cancelBtn);
    listNav.prepend(li);
    inp.focus();
  }

  function startRenameList(oldName: string, li: HTMLElement, nameSpan: HTMLElement): void {
    const inp     = document.createElement('input');
    inp.type      = 'text';
    inp.value     = oldName;
    inp.className = 'ml-list-name-input';

    const okBtn       = document.createElement('button');
    okBtn.type        = 'button';
    okBtn.className   = 'ml-icon-btn';
    okBtn.textContent = '✓';

    function confirmRename(): void {
      const newName = inp.value.trim();
      if (!newName || newName === oldName) { done(); return; }
      if (renameList(lang, oldName, newName)) {
        if (selectedList === oldName) selectedList = newName;
        updateBadge();
        renderSidebar();
      } else {
        alert('A list named "' + newName + '" already exists.');
        inp.focus();
      }
    }

    function done(): void {
      inp.replaceWith(nameSpan);
      okBtn.remove();
    }

    okBtn.addEventListener('click', confirmRename);
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') confirmRename();
      if (e.key === 'Escape') done();
    });

    nameSpan.replaceWith(inp);
    const actionsEl = li.querySelector('.ml-list-actions');
    if (actionsEl) li.insertBefore(okBtn, actionsEl);
    inp.focus();
    inp.select();
  }

  function updateBadge(): void {
    const globalLang = (document.getElementById('langSelect') as HTMLSelectElement | null)?.value ?? 'spanish';
    const el = document.getElementById('knownWordCount');
    if (el) el.textContent = String(getTotalListedCount(globalLang));
    refreshFilterSelect(globalLang);
  }

  renderSidebar();
}
