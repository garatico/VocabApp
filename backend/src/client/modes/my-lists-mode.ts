/**
 * my-lists-mode.ts — "My Lists" management tab.
 */

import {
  getListNames,
  getList,
  createList,
  deleteList,
  renameList,
  removeFromList,
  refreshFilterSelect,
  getTotalListedCount,
} from '../utils/word-lists.ts';

export function renderMyLists(container: HTMLElement, lang: string): void {
  container.innerHTML = '';

  let selectedList = getListNames(lang)[0] ?? '';

  const root = document.createElement('div');
  root.className = 'ml-root';

  const sidebar = document.createElement('div');
  sidebar.className = 'ml-sidebar';

  const sidebarHeader = document.createElement('div');
  sidebarHeader.className = 'ml-sidebar-header';
  sidebarHeader.innerHTML = '<span class="ml-sidebar-title">Lists</span>';

  const newListBtn       = document.createElement('button');
  newListBtn.type        = 'button';
  newListBtn.className   = 'ml-new-list-btn';
  newListBtn.title       = 'Create new list';
  newListBtn.textContent = '+ New';
  newListBtn.addEventListener('click', () => startCreateList());
  sidebarHeader.appendChild(newListBtn);

  const listNav = document.createElement('ul');
  listNav.className = 'ml-list-nav';

  sidebar.appendChild(sidebarHeader);
  sidebar.appendChild(listNav);

  const panel = document.createElement('div');
  panel.className = 'ml-panel';

  root.appendChild(sidebar);
  root.appendChild(panel);
  container.appendChild(root);

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
      const li = document.createElement('li');
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
        if (confirm('Delete list "' + name + '" and all its words?')) {
          deleteList(lang, name);
          if (selectedList === name) selectedList = '';
          updateBadge();
          refreshFilterSelect(lang);
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

    const header     = document.createElement('div');
    header.className = 'ml-panel-header';

    const title       = document.createElement('h2');
    title.className   = 'ml-panel-title';
    title.textContent = selectedList;

    const searchInp       = document.createElement('input');
    searchInp.type        = 'text';
    searchInp.placeholder = 'Search…';
    searchInp.className   = 'ml-search';

    header.appendChild(title);
    header.appendChild(searchInp);
    panel.appendChild(header);

    const listEl     = document.createElement('ul');
    listEl.className = 'ml-word-list';
    panel.appendChild(listEl);

    function renderWords(filter: string = ''): void {
      listEl.innerHTML = '';
      const words = getList(lang, selectedList)
        .filter(w => !filter || w.toLowerCase().includes(filter.toLowerCase()))
        .sort();

      if (words.length === 0) {
        const empty       = document.createElement('li');
        empty.className   = 'ml-word-empty';
        empty.textContent = filter ? 'No matches.' : 'No words in this list.';
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
        removeBtn.textContent = '×';
        removeBtn.addEventListener('click', () => {
          removeFromList(lang, selectedList, word);
          updateBadge();
          renderSidebar();
        });

        li.appendChild(wordSpan);
        li.appendChild(removeBtn);
        listEl.appendChild(li);
      });
    }

    renderWords();
    searchInp.addEventListener('input', () => renderWords(searchInp.value));
  }

  function startCreateList(): void {
    const li     = document.createElement('li');
    li.className = 'ml-list-item ml-list-item--editing';

    const inp       = document.createElement('input');
    inp.type        = 'text';
    inp.placeholder = 'List name…';
    inp.className   = 'ml-list-name-input';

    const okBtn       = document.createElement('button');
    okBtn.type        = 'button';
    okBtn.className   = 'ml-icon-btn';
    okBtn.textContent = '✓';

    const cancelBtn       = document.createElement('button');
    cancelBtn.type        = 'button';
    cancelBtn.className   = 'ml-icon-btn';
    cancelBtn.textContent = '✕';

    function confirm(): void {
      const name = inp.value.trim();
      if (!name) { li.remove(); return; }
      createList(lang, name);
      selectedList = name;
      refreshFilterSelect(lang);
      renderSidebar();
    }

    okBtn.addEventListener('click', confirm);
    cancelBtn.addEventListener('click', () => li.remove());
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') confirm();
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

    function confirm(): void {
      const newName = inp.value.trim();
      if (!newName || newName === oldName) { done(); return; }
      if (renameList(lang, oldName, newName)) {
        if (selectedList === oldName) selectedList = newName;
        refreshFilterSelect(lang);
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

    okBtn.addEventListener('click', confirm);
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') confirm();
      if (e.key === 'Escape') done();
    });

    nameSpan.replaceWith(inp);
    const actionsEl = li.querySelector('.ml-list-actions');
    if (actionsEl) li.insertBefore(okBtn, actionsEl);
    inp.focus();
    inp.select();
  }

  function updateBadge(): void {
    const el = document.getElementById('knownWordCount');
    if (el) el.textContent = String(getTotalListedCount(lang));
  }

  renderSidebar();
}
