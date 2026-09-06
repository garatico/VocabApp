/**
 * list-picker.ts
 *
 * Renders a small popover near a star button that lets the user:
 *  - Toggle the word in/out of each existing list
 *  - Create a new list (inline text input)
 */

import { positionPopover } from './popover-position.ts';
import {
  getListNames,
  isInList,
  addToList,
  removeFromList,
  createList,
  getWordLists,
  getMultiListNames,
  isInMultiList,
  addToMultiList,
  removeFromMultiList,
  createMultiList,
  getMultiListLanguages,
} from './word-lists.ts';
import { buildLangBadge } from '../ui/lang-badge.ts';

export interface ListPickerOptions {
  anchorEl: HTMLElement;
  lang:     string;
  word:     string;
  onClose?: () => void;
}

export function openListPicker({ anchorEl, lang, word, onClose }: ListPickerOptions): void {
  closeExistingPicker();

  const picker = document.createElement('div');
  picker.className = 'list-picker-popover';
  picker.id        = 'listPickerPopover';

  function rebuild(): void {
    picker.innerHTML = '';

    const names      = getListNames(lang);
    const multiNames = getMultiListNames();

    if (names.length === 0 && multiNames.length === 0) {
      const empty       = document.createElement('p');
      empty.className   = 'list-picker-empty';
      empty.textContent = 'No lists yet.';
      picker.appendChild(empty);
    } else {
      names.forEach(listName => {
        const row     = document.createElement('label');
        row.className = 'list-picker-row';

        const cb   = document.createElement('input');
        cb.type    = 'checkbox';
        cb.checked = isInList(lang, listName, word);
        cb.addEventListener('change', () => {
          if (cb.checked) {
            addToList(lang, listName, word);
          } else {
            removeFromList(lang, listName, word);
          }
          updateAnchorState();
        });

        const label       = document.createElement('span');
        label.textContent = listName;

        row.appendChild(cb);
        row.appendChild(label);
        picker.appendChild(row);
      });

      // Cross-language lists — shown for any word regardless of its own
      // language, so a French word can join a list that also holds Spanish
      // and Portuguese ones. Checking a box tags this word with `lang`, the
      // language it actually is, not whatever else is already in the list.
      if (multiNames.length > 0) {
        const divider = document.createElement('div');
        divider.className = 'list-picker-divider';
        divider.textContent = 'Cross-language lists';
        picker.appendChild(divider);

        multiNames.forEach(listName => {
          const row     = document.createElement('label');
          row.className = 'list-picker-row';

          const cb   = document.createElement('input');
          cb.type    = 'checkbox';
          cb.checked = isInMultiList(listName, word, lang);
          cb.addEventListener('change', () => {
            if (cb.checked) {
              addToMultiList(listName, word, lang);
            } else {
              removeFromMultiList(listName, word, lang);
            }
            updateAnchorState();
          });

          const label       = document.createElement('span');
          label.className   = 'list-picker-row-label';
          label.textContent = listName;

          row.appendChild(cb);
          row.appendChild(label);
          row.appendChild(buildLangBadge(getMultiListLanguages(listName)));
          picker.appendChild(row);
        });
      }
    }

    const newBtn         = document.createElement('button');
    newBtn.type          = 'button';
    newBtn.className     = 'list-picker-new-btn';
    newBtn.textContent   = '+ New list…';
    newBtn.addEventListener('click', e => {
      e.stopPropagation();
      showNewListInput();
    });
    picker.appendChild(newBtn);
  }

  function showNewListInput(): void {
    picker.innerHTML = '';

    const inp       = document.createElement('input');
    inp.type        = 'text';
    inp.placeholder = 'List name…';
    inp.className   = 'list-picker-new-input';

    const okBtn         = document.createElement('button');
    okBtn.type          = 'button';
    okBtn.className     = 'list-picker-ok-btn';
    okBtn.textContent   = 'Create';

    const cancelBtn       = document.createElement('button');
    cancelBtn.type        = 'button';
    cancelBtn.className   = 'list-picker-cancel-btn';
    cancelBtn.textContent = '✕';

    const crossLabel      = document.createElement('label');
    crossLabel.className  = 'list-picker-cross-toggle';
    const crossCb         = document.createElement('input');
    crossCb.type          = 'checkbox';
    const crossText       = document.createElement('span');
    crossText.textContent = 'Cross-language list';
    crossLabel.append(crossCb, crossText);

    function confirm(): void {
      const name = inp.value.trim();
      if (!name) return;
      if (crossCb.checked) {
        createMultiList(name);
        addToMultiList(name, word, lang);
      } else {
        createList(lang, name);
        addToList(lang, name, word);
      }
      rebuild();
      updateAnchorState();
    }

    okBtn.addEventListener('click', confirm);
    cancelBtn.addEventListener('click', () => rebuild());
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') confirm();
      if (e.key === 'Escape') rebuild();
    });

    const row     = document.createElement('div');
    row.className = 'list-picker-new-row';
    row.appendChild(inp);
    row.appendChild(okBtn);
    row.appendChild(cancelBtn);
    picker.appendChild(row);
    picker.appendChild(crossLabel);
    inp.focus();
  }

  function updateAnchorState(): void {
    const lists = [
      ...getWordLists(lang, word),
      ...getMultiListNames().filter(name => isInMultiList(name, word, lang)),
    ];
    if (lists.length > 0) {
      anchorEl.classList.add('known-btn--active');
    } else {
      anchorEl.classList.remove('known-btn--active');
    }
    anchorEl.title = lists.length > 0
      ? 'In lists: ' + lists.join(', ')
      : 'Add to a list';
  }

  rebuild();

  document.body.appendChild(picker);
  positionNear(picker, anchorEl);

  function onOutside(e: MouseEvent): void {
    if (!picker.contains(e.target as Node) && e.target !== anchorEl) {
      close();
    }
  }

  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') close();
  }

  function close(): void {
    picker.remove();
    document.removeEventListener('mousedown', onOutside, true);
    document.removeEventListener('keydown', onKey,      true);
    onClose?.();
  }

  (picker as HTMLElement & { _close?: () => void })._close = close;

  setTimeout(() => {
    document.addEventListener('mousedown', onOutside, true);
    document.addEventListener('keydown', onKey,       true);
  }, 0);
}

export interface BulkWordRef {
  word:     string;
  /** Own language, for Compare-mode selections mixing languages — only
   *  read for cross-language (Multi) lists; single-language lists below
   *  always use `fallbackLang`, since that storage is inherently per-
   *  language and a bulk selection is overwhelmingly a single language's
   *  words in practice (see openBulkListPicker's own comment). */
  language?: string;
}

export interface BulkListPickerOptions {
  anchorEl:     HTMLElement;
  words:        BulkWordRef[];
  fallbackLang: string;
  onClose?:     () => void;
}

/**
 * Same anchored-popover mechanics as openListPicker above (positioning,
 * outside-click/Escape dismissal, the shared .list-picker-popover shell),
 * generalized to N words at once — Table mode's "Add N to list(s)" bulk
 * action, checking multiple rows first rather than the star button's one
 * word at a time. A list's checkbox is checked when every selected word is
 * already in it, indeterminate when only some are, and toggling it adds/
 * removes every selected word in one pass.
 */
export function openBulkListPicker({ anchorEl, words, fallbackLang, onClose }: BulkListPickerOptions): void {
  closeExistingPicker();

  const picker = document.createElement('div');
  picker.className = 'list-picker-popover list-picker-popover--bulk';
  picker.id        = 'listPickerPopover';

  const countLabel = document.createElement('p');
  countLabel.className = 'list-picker-bulk-count';
  countLabel.textContent = `${words.length} word${words.length === 1 ? '' : 's'} selected`;
  picker.appendChild(countLabel);

  function rebuild(): void {
    picker.innerHTML = '';
    picker.appendChild(countLabel);

    const names      = getListNames(fallbackLang);
    const multiNames = getMultiListNames();

    if (names.length === 0 && multiNames.length === 0) {
      const empty       = document.createElement('p');
      empty.className   = 'list-picker-empty';
      empty.textContent = 'No lists yet.';
      picker.appendChild(empty);
    } else {
      names.forEach(listName => {
        const row     = document.createElement('label');
        row.className = 'list-picker-row';

        const cb   = document.createElement('input');
        cb.type    = 'checkbox';
        const allIn  = words.every(w => isInList(fallbackLang, listName, w.word));
        const someIn = words.some(w => isInList(fallbackLang, listName, w.word));
        cb.checked       = allIn;
        cb.indeterminate = someIn && !allIn;
        cb.addEventListener('change', () => {
          words.forEach(w => {
            if (cb.checked) addToList(fallbackLang, listName, w.word);
            else removeFromList(fallbackLang, listName, w.word);
          });
          cb.indeterminate = false;
        });

        const label       = document.createElement('span');
        label.textContent = listName;

        row.appendChild(cb);
        row.appendChild(label);
        picker.appendChild(row);
      });

      if (multiNames.length > 0) {
        const divider = document.createElement('div');
        divider.className = 'list-picker-divider';
        divider.textContent = 'Cross-language lists';
        picker.appendChild(divider);

        multiNames.forEach(listName => {
          const row     = document.createElement('label');
          row.className = 'list-picker-row';

          const cb   = document.createElement('input');
          cb.type    = 'checkbox';
          const allIn  = words.every(w => isInMultiList(listName, w.word, w.language ?? fallbackLang));
          const someIn = words.some(w => isInMultiList(listName, w.word, w.language ?? fallbackLang));
          cb.checked       = allIn;
          cb.indeterminate = someIn && !allIn;
          cb.addEventListener('change', () => {
            words.forEach(w => {
              const wl = w.language ?? fallbackLang;
              if (cb.checked) addToMultiList(listName, w.word, wl);
              else removeFromMultiList(listName, w.word, wl);
            });
            cb.indeterminate = false;
          });

          const label       = document.createElement('span');
          label.className   = 'list-picker-row-label';
          label.textContent = listName;

          row.appendChild(cb);
          row.appendChild(label);
          row.appendChild(buildLangBadge(getMultiListLanguages(listName)));
          picker.appendChild(row);
        });
      }
    }

    const newBtn         = document.createElement('button');
    newBtn.type          = 'button';
    newBtn.className     = 'list-picker-new-btn';
    newBtn.textContent   = '+ New list…';
    newBtn.addEventListener('click', e => {
      e.stopPropagation();
      showNewListInput();
    });
    picker.appendChild(newBtn);
  }

  function showNewListInput(): void {
    picker.innerHTML = '';
    picker.appendChild(countLabel);

    const inp       = document.createElement('input');
    inp.type        = 'text';
    inp.placeholder = 'List name…';
    inp.className   = 'list-picker-new-input';

    const okBtn         = document.createElement('button');
    okBtn.type          = 'button';
    okBtn.className     = 'list-picker-ok-btn';
    okBtn.textContent   = 'Create';

    const cancelBtn       = document.createElement('button');
    cancelBtn.type        = 'button';
    cancelBtn.className   = 'list-picker-cancel-btn';
    cancelBtn.textContent = '✕';

    const crossLabel      = document.createElement('label');
    crossLabel.className  = 'list-picker-cross-toggle';
    const crossCb         = document.createElement('input');
    crossCb.type          = 'checkbox';
    const crossText       = document.createElement('span');
    crossText.textContent = 'Cross-language list';
    crossLabel.append(crossCb, crossText);

    function confirm(): void {
      const name = inp.value.trim();
      if (!name) return;
      if (crossCb.checked) {
        createMultiList(name);
        words.forEach(w => addToMultiList(name, w.word, w.language ?? fallbackLang));
      } else {
        createList(fallbackLang, name);
        words.forEach(w => addToList(fallbackLang, name, w.word));
      }
      rebuild();
    }

    okBtn.addEventListener('click', confirm);
    cancelBtn.addEventListener('click', () => rebuild());
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') confirm();
      if (e.key === 'Escape') rebuild();
    });

    const row     = document.createElement('div');
    row.className = 'list-picker-new-row';
    row.appendChild(inp);
    row.appendChild(okBtn);
    row.appendChild(cancelBtn);
    picker.appendChild(row);
    picker.appendChild(crossLabel);
    inp.focus();
  }

  rebuild();

  document.body.appendChild(picker);
  positionNear(picker, anchorEl);

  function onOutside(e: MouseEvent): void {
    if (!picker.contains(e.target as Node) && e.target !== anchorEl) {
      close();
    }
  }

  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') close();
  }

  function close(): void {
    picker.remove();
    document.removeEventListener('mousedown', onOutside, true);
    document.removeEventListener('keydown', onKey,      true);
    onClose?.();
  }

  (picker as HTMLElement & { _close?: () => void })._close = close;

  setTimeout(() => {
    document.addEventListener('mousedown', onOutside, true);
    document.addEventListener('keydown', onKey,       true);
  }, 0);
}

function closeExistingPicker(): void {
  const existing = document.getElementById('listPickerPopover') as (HTMLElement & { _close?: () => void }) | null;
  if (existing?._close) existing._close();
  else existing?.remove();
}

function positionNear(picker: HTMLElement, anchor: HTMLElement): void {
  // Measured and clamped by the shared helper. This used to clamp against a
  // hardcoded 200px that the CSS had since outgrown (max-width is 260px), so
  // a star near the right edge of a phone put the picker partly off screen.
  positionPopover(picker, anchor);
  picker.style.zIndex = '9999';
}
