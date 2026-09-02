/**
 * sidebar.ts — the left pane: language, and the four kinds of list.
 *
 * Four sections, each the same shape (a head row with "+ New", then one card
 * per item with name/meta on top and Copy/Rename/Delete below) but backed by
 * a different store and driving a different right-pane renderer:
 *
 *   Single-Language Lists  →  panel.ts           (word arrays, per ctx.lang)
 *   Smart Lists             →  smart-panel.ts     (saved queries)
 *   Cross-Language Lists    →  multi-panel.ts     (word+language pairs)
 *   Testing Profiles        →  profile-panel.ts   (saved filter bundles)
 *
 * Keeping the shapes identical is deliberate — a learner who has found Copy/
 * Rename/Delete on one kind of list shouldn't have to relearn where they live
 * on the next.
 *
 * Backup and restore live up here next to the title because they operate on
 * every list in every language, not on the one that happens to be open.
 */

import {
  getListNames, getList, createList, deleteList, renameList, addToList,
  getMultiListNames, getMultiList, getMultiListLanguages, getMultiListCount,
  createMultiList, deleteMultiList, renameMultiList, addToMultiList,
} from '../../utils/word-lists.ts';
import { logger } from '../../utils/logger.ts';
import type { ListsCtx } from './context.ts';
import { migrateMastery } from './mastery.ts';
import { closePopover } from './move-popover.ts';
import { showUndo } from './undo-toast.ts';
import { downloadBackup, applyBackup } from './backup.ts';
import {
  getSmartNames, getSmartLists, saveSmartRule, deleteSmartList, renameSmartList,
  evaluateSmart, DEFAULT_SMART_RULE, type SmartRule,
} from './smart-lists.ts';
import { cachedVocab, fetchVocab } from './vocab-cache.ts';
import { buildLangBadge } from '../../ui/lang-badge.ts';
import { LANGUAGES } from '../../data/languages.ts';
import {
  modesWithPresets, listPresets, getPreset, deletePreset, renamePreset,
  duplicatePreset, savePreset, BLANK_BUNDLE,
} from '../../filters/presets.ts';
import { SCOPE_LABELS, type FilterScope } from '../../filters/filter-scope.ts';

const PROFILE_MODES: FilterScope[] = ['table', 'picture', 'conjugation'];

export interface SidebarUI {
  /** The whole left pane, ready to append. */
  leftPane: HTMLElement;
  /** Redraw. See ListsCtx.renderSidebar for what `rerenderPanel` is for. */
  render(rerenderPanel?: boolean): void;
}

export function createSidebar(ctx: ListsCtx): SidebarUI {
  const leftPane = document.createElement('div');
  leftPane.className = 'ml-left-pane';

  // ── Language ───────────────────────────────────────────────────────────────

  const langRow = document.createElement('div');
  langRow.className = 'ml-lang-row';
  const langLabel = document.createElement('span');
  langLabel.className = 'ml-lang-label';
  langLabel.textContent = 'Language';
  const langSel = document.createElement('select');
  langSel.className = 'ml-lang-select';
  LANGUAGES.forEach(({ name, label }) => {
    const opt = document.createElement('option');
    opt.value = name; opt.textContent = label;
    opt.selected = name === ctx.lang; langSel.appendChild(opt);
  });
  langSel.addEventListener('change', () => {
    ctx.lang = langSel.value; migrateMastery(ctx.lang);
    ctx.selectedList = getListNames(ctx.lang)[0] ?? '';
    closePopover(); render();
  });
  langRow.appendChild(langLabel); langRow.appendChild(langSel);
  leftPane.appendChild(langRow);

  // ── Header: title, backup, restore ──────────────────────────────────────────

  const header = document.createElement('div');
  header.className = 'ml-header';
  const titleSpan = document.createElement('span');
  titleSpan.className = 'ml-sidebar-title'; titleSpan.textContent = 'Lists';

  const backupBtn = document.createElement('button');
  backupBtn.type = 'button'; backupBtn.className = 'ml-icon-btn ml-text-btn ml-backup-btn';
  backupBtn.title = 'Download a backup of every list, in every language';
  // ⭳ (U+2B73) has no glyph in the default font on a lot of mobile browsers —
  // it rendered as an invisible box there, making the button look unlabeled.
  // ↓ is in every font.
  backupBtn.innerHTML = '<span aria-hidden="true">↓</span> Backup';
  backupBtn.addEventListener('click', () => downloadBackup());

  const restoreBtn = document.createElement('button');
  restoreBtn.type = 'button'; restoreBtn.className = 'ml-icon-btn ml-text-btn ml-restore-btn';
  restoreBtn.title = 'Restore lists from a backup file (merges, never overwrites)';
  restoreBtn.innerHTML = '<span aria-hidden="true">↑</span> Restore';

  const restoreInput = document.createElement('input');
  restoreInput.type = 'file'; restoreInput.accept = 'application/json,.json';
  restoreInput.hidden = true;
  restoreBtn.addEventListener('click', () => restoreInput.click());
  restoreInput.addEventListener('change', () => {
    const file = restoreInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const summary = applyBackup(String(reader.result));
        ctx.updateBadge(); render();
        // Restore is additive, so there is nothing meaningful to undo.
        showUndo(summary, null, 6000);
      } catch (err) {
        logger.warn('list restore failed', err);
        alert((err as Error).message || 'Could not read that backup file.');
      }
      restoreInput.value = '';
    };
    reader.readAsText(file);
  });

  header.appendChild(titleSpan);
  header.appendChild(backupBtn); header.appendChild(restoreBtn);
  leftPane.appendChild(header);
  leftPane.appendChild(restoreInput);
  leftPane.appendChild(ctx.listNav);

  // ── Keyboard navigation ──────────────────────────────────────────────────────
  //
  // Every card across all four sections got tabIndex=0 in render() above, so
  // Tab/Shift+Tab already move between them in DOM order for free. This adds
  // the arrow-key shorthand a sighted mouse user gets from scanning the list
  // visually — Up/Down to the next card (skipping section heads and hints,
  // which aren't cards), Home/End to the first/last, Enter/Space to open
  // whichever card has focus. Bound once on the stable listNav container
  // (event delegation), so it survives every render() rebuilding the <li>s.
  ctx.listNav.addEventListener('keydown', e => {
    // An inline rename/create row's text input or mode <select> lives inside
    // listNav too — leave arrow keys alone there (moving a text cursor,
    // changing a select) rather than hijacking them to move between cards.
    if ((e.target as HTMLElement).matches('input, select, textarea')) return;

    const cards = [...ctx.listNav.querySelectorAll<HTMLElement>('.ml-list-item')];
    const active = document.activeElement as HTMLElement | null;
    const idx = active ? cards.indexOf(active) : -1;

    switch (e.key) {
      case 'ArrowDown':
        if (cards.length === 0) return;
        e.preventDefault();
        cards[idx === -1 ? 0 : Math.min(idx + 1, cards.length - 1)].focus();
        break;
      case 'ArrowUp':
        if (cards.length === 0) return;
        e.preventDefault();
        cards[idx === -1 ? cards.length - 1 : Math.max(idx - 1, 0)].focus();
        break;
      case 'Home':
        if (cards.length === 0) return;
        e.preventDefault();
        cards[0].focus();
        break;
      case 'End':
        if (cards.length === 0) return;
        e.preventDefault();
        cards[cards.length - 1].focus();
        break;
      case 'Enter':
      case ' ':
        // Only when the card itself has focus — an inline rename input or an
        // action button inside it handles its own Enter/Space, and this
        // would otherwise re-fire on top of that.
        if (active && idx !== -1 && active === e.target) {
          e.preventDefault();
          active.click();
        }
        break;
    }
  });

  // ── Shared row-building helpers ─────────────────────────────────────────────

  /** A section head: label + optional "+ New". Shared shape across all four
   *  sections so the sidebar reads as one family of lists. */
  function sectionHead(cls: string, label: string, newTitle?: string, onNew?: () => void): HTMLLIElement {
    const head = document.createElement('li');
    head.className = cls;
    const headLabel = document.createElement('span');
    headLabel.textContent = label;
    head.appendChild(headLabel);
    if (onNew) {
      const addBtn = document.createElement('button');
      addBtn.type = 'button'; addBtn.className = 'ml-new-list-btn';
      addBtn.title = newTitle ?? 'Create new'; addBtn.textContent = '+ New';
      addBtn.addEventListener('click', onNew);
      head.appendChild(addBtn);
    }
    return head;
  }

  /** One Copy/Rename/Delete (or a subset) button, in the shared labeled style. */
  function actionBtn(
    glyph: string, label: string, title: string, onClick: (e: MouseEvent) => void, danger = false,
  ): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ml-icon-btn ml-icon-btn--labeled' + (danger ? ' ml-icon-btn--danger' : '');
    btn.title = title;
    btn.innerHTML = `<span aria-hidden="true">${glyph}</span> ${label}`;
    btn.addEventListener('click', onClick);
    return btn;
  }

  // ── Single-Language Lists ───────────────────────────────────────────────────

  function renderSingleNav(): void {
    ctx.listNav.appendChild(sectionHead(
      'ml-single-head', 'Single-Language Lists', 'Create a new list', () => startCreateList(),
    ));

    const names = getListNames(ctx.lang);
    if (names.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'ml-list-empty'; empty.textContent = 'No lists yet.';
      ctx.listNav.appendChild(empty);
      ctx.selectedList = '';
      return;
    }
    if (!names.includes(ctx.selectedList)) ctx.selectedList = names[0];

    names.forEach(name => {
      const li = document.createElement('li');
      li.className = 'ml-list-item ml-list-item--full ml-single-item'
        + (name === ctx.selectedList ? ' active' : '');

      const topRow = document.createElement('div');
      topRow.className = 'ml-list-row-top';
      const nameSpan = document.createElement('span');
      nameSpan.className = 'ml-list-name'; nameSpan.textContent = name; nameSpan.title = name;
      const countSpan = document.createElement('span');
      countSpan.className = 'ml-list-count';
      const n = getList(ctx.lang, name).length;
      countSpan.textContent = `${n} word${n === 1 ? '' : 's'}`;
      topRow.append(nameSpan, countSpan);

      const actions = document.createElement('span');
      actions.className = 'ml-list-actions ml-list-actions--full';

      const dupBtn = actionBtn('⧉', 'Copy', 'Duplicate list', e => {
        e.stopPropagation();
        const copied = startCopyList(ctx.lang, name);
        if (copied) { ctx.selectedList = copied; ctx.updateBadge(); render(); }
      });
      const renameBtn = actionBtn('✏', 'Rename', 'Rename', e => {
        e.stopPropagation(); startRenameList(name, li, nameSpan);
      });
      const deleteBtn = actionBtn('🗑', 'Delete', 'Delete list', e => {
        e.stopPropagation();
        if (!window.confirm(`Delete list "${name}" and all its words?`)) return;
        // Snapshot before deleting so the whole list can come back intact.
        const words       = [...getList(ctx.lang, name)];
        const wasSelected = ctx.selectedList === name;

        deleteList(ctx.lang, name);
        if (wasSelected) ctx.selectedList = '';
        ctx.updateBadge(); render();

        showUndo(`Deleted "${name}" (${words.length} words)`, () => {
          createList(ctx.lang, name);
          words.forEach(w => addToList(ctx.lang, name, w));
          if (wasSelected) ctx.selectedList = name;
          ctx.updateBadge(); render();
        });
      }, true);

      actions.append(dupBtn, renameBtn, deleteBtn);
      li.append(topRow, actions);
      li.addEventListener('click', () => {
        ctx.selectedList = name; ctx.selectedSmart = null;
        ctx.selectedMultiList = null; ctx.selectedProfile = null;
        closePopover(); render(); ctx.renderPanel();
      });
      ctx.listNav.appendChild(li);
    });
  }

  // ── Smart lists ────────────────────────────────────────────────────────────

  function renderSmartNav(): void {
    const head = sectionHead(
      'ml-smart-head', 'Smart Lists', 'Create a smart list — a saved query that stays current',
      () => startCreateSmart(head),
    );
    ctx.listNav.appendChild(head);

    const smartNames = getSmartNames(ctx.lang);
    if (smartNames.length === 0) {
      const hint = document.createElement('li');
      hint.className = 'ml-list-empty ml-smart-hint';
      hint.textContent = 'e.g. "B1 verbs I haven’t learned"';
      ctx.listNav.appendChild(hint);
      return;
    }

    // How many words each rule currently matches — computed against whatever
    // vocabulary is cached right now, then refreshed in place (not a full
    // re-render — that would re-trigger this same fetch and loop) once it
    // finishes loading for a language that wasn't cached yet.
    const smartCountEls: { el: HTMLElement; rule: SmartRule }[] = [];
    function paintSmartCount(el: HTMLElement, rule: SmartRule, vocab = cachedVocab(ctx.lang)): void {
      const n = evaluateSmart(ctx.lang, rule, vocab).length;
      el.textContent = `${n} word${n === 1 ? '' : 's'}`;
    }

    smartNames.forEach(name => {
      const rule = getSmartLists(ctx.lang)[name];
      const li = document.createElement('li');
      li.className = 'ml-list-item ml-list-item--full ml-smart-item'
        + (name === ctx.selectedSmart ? ' active' : '');

      const topRow = document.createElement('div');
      topRow.className = 'ml-list-row-top';
      const nameSpan = document.createElement('span');
      nameSpan.className = 'ml-list-name';
      nameSpan.textContent = name;
      const countSpan = document.createElement('span');
      countSpan.className = 'ml-list-count';
      paintSmartCount(countSpan, rule);
      smartCountEls.push({ el: countSpan, rule });
      topRow.append(nameSpan, countSpan);

      const actions = document.createElement('span');
      actions.className = 'ml-list-actions ml-list-actions--full';

      const dupBtn = actionBtn('⧉', 'Copy', 'Duplicate smart list', e => {
        e.stopPropagation();
        const proposed = suggestSmartCopyName(ctx.lang, name);
        const input = window.prompt(`Name for the copy of "${name}":`, proposed);
        if (input === null) return;
        const newName = input.trim();
        if (!newName) return;
        if (getSmartNames(ctx.lang).includes(newName)) {
          alert(`A smart list named "${newName}" already exists.`); return;
        }
        saveSmartRule(ctx.lang, newName, { ...rule });
        ctx.selectedSmart = newName; ctx.selectedList = ''; ctx.selectedMultiList = null; ctx.selectedProfile = null;
        render();
      });
      const renameBtn = actionBtn('✏', 'Rename', 'Rename', e => {
        e.stopPropagation(); startRenameSmart(name, li, nameSpan);
      });
      const deleteBtn = actionBtn('🗑', 'Delete', 'Delete this smart list', e => {
        e.stopPropagation();
        if (!window.confirm(`Delete smart list "${name}"? The words themselves are untouched.`)) return;
        deleteSmartList(ctx.lang, name);
        if (ctx.selectedSmart === name) ctx.selectedSmart = null;
        render();
      }, true);

      actions.append(dupBtn, renameBtn, deleteBtn);
      li.append(topRow, actions);
      li.addEventListener('click', () => {
        ctx.selectedSmart = name; ctx.selectedMultiList = null; ctx.selectedProfile = null;
        closePopover(); render();
      });
      ctx.listNav.appendChild(li);
    });

    if (cachedVocab(ctx.lang).length === 0) {
      fetchVocab(ctx.lang).then(vocab => {
        smartCountEls.forEach(({ el, rule }) => paintSmartCount(el, rule, vocab));
      }).catch(() => {});
    }
  }

  function suggestSmartCopyName(lang: string, sourceName: string): string {
    const names = getSmartNames(lang);
    let candidate = sourceName + ' (copy)';
    let n = 2;
    while (names.includes(candidate)) candidate = `${sourceName} (${n++})`;
    return candidate;
  }

  /** Inline creation row, the same shape startCreateList/startCreateProfile
   *  use — this used to be a window.prompt() with no collision check at all,
   *  so naming a new smart list the same as an existing one silently
   *  overwrote that list's rule with a fresh default one. */
  function startCreateSmart(afterHead: HTMLElement): void {
    const li = document.createElement('li');
    li.className = 'ml-list-item ml-list-item--editing';
    const inp = document.createElement('input');
    inp.type = 'text'; inp.placeholder = 'Smart list name...'; inp.className = 'ml-list-name-input';
    const okBtn = document.createElement('button');
    okBtn.type = 'button'; okBtn.className = 'ml-icon-btn'; okBtn.textContent = '✓';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button'; cancelBtn.className = 'ml-icon-btn'; cancelBtn.textContent = '✕';
    function confirmCreate(): void {
      const name = inp.value.trim(); if (!name) { li.remove(); return; }
      if (getSmartNames(ctx.lang).includes(name)) {
        alert(`A smart list named "${name}" already exists.`); return;
      }
      saveSmartRule(ctx.lang, name, { ...DEFAULT_SMART_RULE });
      ctx.selectedList = ''; ctx.selectedMultiList = null; ctx.selectedProfile = null;
      ctx.selectedSmart = name;
      render();
    }
    okBtn.addEventListener('click', confirmCreate);
    cancelBtn.addEventListener('click', () => li.remove());
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') confirmCreate(); if (e.key === 'Escape') li.remove();
    });
    li.append(inp, okBtn, cancelBtn);
    afterHead.insertAdjacentElement('afterend', li);
    inp.focus();
  }

  function startRenameSmart(oldName: string, li: HTMLElement, nameSpan: HTMLElement): void {
    const inp = document.createElement('input');
    inp.type = 'text'; inp.value = oldName; inp.className = 'ml-list-name-input';
    const okBtn = document.createElement('button');
    okBtn.type = 'button'; okBtn.className = 'ml-icon-btn'; okBtn.textContent = '✓';
    function confirmRename(): void {
      const newName = inp.value.trim();
      if (!newName || newName === oldName) { done(); return; }
      if (renameSmartList(ctx.lang, oldName, newName)) {
        if (ctx.selectedSmart === oldName) ctx.selectedSmart = newName;
        render();
      } else { alert(`A smart list named "${newName}" already exists.`); inp.focus(); }
    }
    function done(): void { inp.replaceWith(nameSpan); okBtn.remove(); }
    okBtn.addEventListener('click', confirmRename);
    inp.addEventListener('click', e => e.stopPropagation());
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') confirmRename(); if (e.key === 'Escape') done();
    });
    nameSpan.replaceWith(inp);
    li.querySelector('.ml-list-row-top')?.appendChild(okBtn);
    inp.focus(); inp.select();
  }

  // ── Cross-language lists ────────────────────────────────────────────────────
  //
  // Not scoped to ctx.lang — a cross-language list holds words from however
  // many languages have been added to it, either from the star-button picker
  // on a word elsewhere, or from its own Add Vocabulary box (multi-panel.ts).

  function renderMultiNav(): void {
    const head = sectionHead(
      'ml-multi-head', 'Cross-Language Lists', 'Create a list that can hold words from any language',
      () => startCreateMulti(head),
    );
    ctx.listNav.appendChild(head);

    const names = getMultiListNames();
    if (names.length === 0) {
      const hint = document.createElement('li');
      hint.className = 'ml-list-empty ml-smart-hint';
      hint.textContent = 'Add words from its own panel, or the ★ button on any word';
      ctx.listNav.appendChild(hint);
      ctx.selectedMultiList = null;
      return;
    }
    // Same fallback the single-language list section runs above:
    // removeFromMultiList deletes a cross-language list the instant its last
    // word leaves (same as an ordinary list), so the one just emptied can
    // vanish out from under whichever list happened to be selected. Without
    // this, the sidebar dropped it from the nav entirely while the panel on
    // the right kept rendering it as still selected — a "0 words" ghost of a
    // list that no longer existed in storage.
    if (ctx.selectedMultiList && !names.includes(ctx.selectedMultiList)) ctx.selectedMultiList = null;

    names.forEach(name => {
      const li = document.createElement('li');
      li.className = 'ml-list-item ml-list-item--full ml-multi-item'
        + (name === ctx.selectedMultiList ? ' active' : '');

      // Name on its own line — the flags can run to several, and a word
      // count next to a long name plus several flags was cramped onto one
      // line together.
      const topRow = document.createElement('div');
      topRow.className = 'ml-list-row-top';
      const nameSpan = document.createElement('span');
      nameSpan.className = 'ml-list-name'; nameSpan.textContent = name; nameSpan.title = name;
      topRow.appendChild(nameSpan);

      const metaRow = document.createElement('div');
      metaRow.className = 'ml-list-row-meta';
      const badge = buildLangBadge(getMultiListLanguages(name));
      const countSpan = document.createElement('span');
      countSpan.className = 'ml-list-count';
      const n = getMultiListCount(name);
      countSpan.textContent = `${n} word${n === 1 ? '' : 's'}`;
      metaRow.append(badge, countSpan);

      const actions = document.createElement('span');
      actions.className = 'ml-list-actions ml-list-actions--full';

      const dupBtn = actionBtn('⧉', 'Copy', 'Duplicate cross-language list', e => {
        e.stopPropagation();
        const proposed = suggestMultiCopyName(name);
        const input = window.prompt(`Name for the copy of "${name}":`, proposed);
        if (input === null) return;
        const newName = input.trim();
        if (!newName) return;
        if (!createMultiList(newName)) { alert(`A cross-language list named "${newName}" already exists.`); return; }
        for (const entry of getMultiList(name)) addToMultiList(newName, entry.word, entry.language);
        ctx.selectedMultiList = newName; ctx.selectedList = ''; ctx.selectedSmart = null; ctx.selectedProfile = null;
        render();
      });
      const renameBtn = actionBtn('✏', 'Rename', 'Rename', e => {
        e.stopPropagation();
        const newName = window.prompt('Rename cross-language list:', name);
        if (!newName?.trim() || newName.trim() === name) return;
        if (renameMultiList(name, newName.trim())) {
          if (ctx.selectedMultiList === name) ctx.selectedMultiList = newName.trim();
          render();
        } else {
          alert(`A cross-language list named "${newName.trim()}" already exists.`);
        }
      });
      const deleteBtn = actionBtn('🗑', 'Delete', 'Delete list', e => {
        e.stopPropagation();
        if (!window.confirm(`Delete cross-language list "${name}" and all its words?`)) return;
        const entries      = getMultiList(name);
        const wasSelected  = ctx.selectedMultiList === name;

        deleteMultiList(name);
        if (wasSelected) ctx.selectedMultiList = null;
        render();

        showUndo(`Deleted "${name}" (${entries.length} words)`, () => {
          createMultiList(name);
          entries.forEach(e => addToMultiList(name, e.word, e.language));
          if (wasSelected) ctx.selectedMultiList = name;
          render();
        });
      }, true);

      actions.append(dupBtn, renameBtn, deleteBtn);
      li.append(topRow, metaRow, actions);
      li.addEventListener('click', () => {
        ctx.selectedList = ''; ctx.selectedSmart = null; ctx.selectedProfile = null;
        ctx.selectedMultiList = name;
        closePopover(); render();
      });
      ctx.listNav.appendChild(li);
    });
  }

  function suggestMultiCopyName(sourceName: string): string {
    const names = getMultiListNames();
    let candidate = sourceName + ' (copy)';
    let n = 2;
    while (names.includes(candidate)) candidate = `${sourceName} (${n++})`;
    return candidate;
  }

  /** Inline creation row, the same shape startCreateList/startCreateProfile
   *  use — this used to be a window.prompt(). */
  function startCreateMulti(afterHead: HTMLElement): void {
    const li = document.createElement('li');
    li.className = 'ml-list-item ml-list-item--editing';
    const inp = document.createElement('input');
    inp.type = 'text'; inp.placeholder = 'List name...'; inp.className = 'ml-list-name-input';
    const okBtn = document.createElement('button');
    okBtn.type = 'button'; okBtn.className = 'ml-icon-btn'; okBtn.textContent = '✓';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button'; cancelBtn.className = 'ml-icon-btn'; cancelBtn.textContent = '✕';
    function confirmCreate(): void {
      const name = inp.value.trim(); if (!name) { li.remove(); return; }
      if (!createMultiList(name)) { alert(`A cross-language list named "${name}" already exists.`); return; }
      ctx.selectedList = ''; ctx.selectedSmart = null; ctx.selectedProfile = null;
      ctx.selectedMultiList = name;
      render();
    }
    okBtn.addEventListener('click', confirmCreate);
    cancelBtn.addEventListener('click', () => li.remove());
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') confirmCreate(); if (e.key === 'Escape') li.remove();
    });
    li.append(inp, okBtn, cancelBtn);
    afterHead.insertAdjacentElement('afterend', li);
    inp.focus();
  }

  // ── Testing Profiles ──────────────────────────────────────────────────────
  //
  // Not scoped to ctx.lang (a profile can apply to any language it was saved
  // under — see presets.ts) and not tied to a word list at all, but otherwise
  // the same shape as every other section: select a row to open it in the
  // main panel (profile-panel.ts), Copy/Rename/Delete below each row.
  // Grouped by the mode the profile belongs to (Table/Picture/Conjugation),
  // since a name is only unique within its own mode.

  function renderProfilesNav(): void {
    const head = sectionHead(
      'ml-profile-head', 'Testing Profiles', 'Create a new testing profile', () => startCreateProfile(head),
    );
    ctx.listNav.appendChild(head);

    const modes = modesWithPresets();
    if (modes.length === 0) {
      const hint = document.createElement('li');
      hint.className = 'ml-list-empty ml-smart-hint';
      hint.textContent = 'Create one here, or save one from the Profiles button on Table, Picture Quiz or Conjugation';
      ctx.listNav.appendChild(hint);
      return;
    }

    modes.forEach(mode => {
      const modeHead = document.createElement('li');
      modeHead.className = 'ml-profile-mode-head';
      modeHead.textContent = SCOPE_LABELS[mode];
      ctx.listNav.appendChild(modeHead);

      listPresets(mode).forEach(name => {
        const selected = ctx.selectedProfile?.mode === mode && ctx.selectedProfile.name === name;
        const li = document.createElement('li');
        li.className = 'ml-list-item ml-list-item--full ml-profile-item' + (selected ? ' active' : '');

        const topRow = document.createElement('div');
        topRow.className = 'ml-list-row-top';
        const nameSpan = document.createElement('span');
        nameSpan.className = 'ml-list-name';
        nameSpan.textContent = name;
        topRow.appendChild(nameSpan);

        const actions = document.createElement('span');
        actions.className = 'ml-list-actions ml-list-actions--full';

        const dupBtn = actionBtn('⧉', 'Copy', 'Duplicate profile', e => {
          e.stopPropagation();
          const proposed = suggestProfileCopyName(mode, name);
          const input = window.prompt(`Name for the copy of "${name}":`, proposed);
          if (input === null) return;
          const newName = input.trim();
          if (!newName) return;
          if (!duplicatePreset(mode, name, newName)) {
            alert(`A profile named "${newName}" already exists for ${SCOPE_LABELS[mode]}.`); return;
          }
          ctx.selectedList = ''; ctx.selectedSmart = null; ctx.selectedMultiList = null;
          ctx.selectedProfile = { mode, name: newName };
          render();
        });
        const renameBtn = actionBtn('✏', 'Rename', 'Rename', e => {
          e.stopPropagation(); startRenameProfile(mode, name, li, nameSpan);
        });
        const deleteBtn = actionBtn('🗑', 'Delete', 'Delete profile', e => {
          e.stopPropagation();
          if (!window.confirm(`Delete profile "${name}"?`)) return;
          deletePreset(mode, name);
          if (selected) ctx.selectedProfile = null;
          render();
        }, true);

        actions.append(dupBtn, renameBtn, deleteBtn);
        li.append(topRow, actions);
        li.addEventListener('click', () => {
          ctx.selectedList = ''; ctx.selectedSmart = null; ctx.selectedMultiList = null;
          ctx.selectedProfile = { mode, name };
          closePopover(); render();
        });
        ctx.listNav.appendChild(li);
      });
    });
  }

  function suggestProfileCopyName(mode: FilterScope, sourceName: string): string {
    const names = listPresets(mode);
    let candidate = sourceName + ' (copy)';
    let n = 2;
    while (names.includes(candidate)) candidate = `${sourceName} (${n++})`;
    return candidate;
  }

  /** Inline "mode + name" creation row, inserted right after the section
   *  head — the same "+ New" shape every other section uses, widened by one
   *  field since a profile name is only unique within its own mode. */
  function startCreateProfile(afterHead: HTMLElement): void {
    const li = document.createElement('li');
    li.className = 'ml-list-item ml-list-item--editing ml-list-item--editing-wide';

    const modeSel = document.createElement('select');
    modeSel.className = 'ml-list-name-input';
    PROFILE_MODES.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m; opt.textContent = SCOPE_LABELS[m];
      modeSel.appendChild(opt);
    });

    const inp = document.createElement('input');
    inp.type = 'text'; inp.placeholder = 'Profile name...'; inp.className = 'ml-list-name-input';

    const okBtn = document.createElement('button');
    okBtn.type = 'button'; okBtn.className = 'ml-icon-btn'; okBtn.textContent = '✓';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button'; cancelBtn.className = 'ml-icon-btn'; cancelBtn.textContent = '✕';

    function confirmCreate(): void {
      const name = inp.value.trim(); if (!name) { li.remove(); return; }
      const mode = modeSel.value as FilterScope;
      if (getPreset(mode, name)) {
        alert(`A profile named "${name}" already exists for ${SCOPE_LABELS[mode]}.`); return;
      }
      savePreset(mode, name, { ...BLANK_BUNDLE });
      ctx.selectedList = ''; ctx.selectedSmart = null; ctx.selectedMultiList = null;
      ctx.selectedProfile = { mode, name };
      render();
    }
    okBtn.addEventListener('click', confirmCreate);
    cancelBtn.addEventListener('click', () => li.remove());
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') confirmCreate(); if (e.key === 'Escape') li.remove();
    });

    li.append(modeSel, inp, okBtn, cancelBtn);
    afterHead.insertAdjacentElement('afterend', li);
    inp.focus();
  }

  function startRenameProfile(mode: FilterScope, oldName: string, li: HTMLElement, nameSpan: HTMLElement): void {
    const inp = document.createElement('input');
    inp.type = 'text'; inp.value = oldName; inp.className = 'ml-list-name-input';
    const okBtn = document.createElement('button');
    okBtn.type = 'button'; okBtn.className = 'ml-icon-btn'; okBtn.textContent = '✓';
    function confirmRename(): void {
      const newName = inp.value.trim();
      if (!newName || newName === oldName) { done(); return; }
      if (renamePreset(mode, oldName, newName)) {
        if (ctx.selectedProfile?.mode === mode && ctx.selectedProfile.name === oldName) {
          ctx.selectedProfile = { mode, name: newName };
        }
        render();
      } else {
        alert(`A profile named "${newName}" already exists for this tab.`);
        inp.focus();
      }
    }
    function done(): void { inp.replaceWith(nameSpan); okBtn.remove(); }
    okBtn.addEventListener('click', confirmRename);
    inp.addEventListener('click', e => e.stopPropagation());
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') confirmRename(); if (e.key === 'Escape') done();
    });
    nameSpan.replaceWith(inp);
    li.querySelector('.ml-list-row-top')?.appendChild(okBtn);
    inp.focus(); inp.select();
  }

  // ── Top-level render ─────────────────────────────────────────────────────────

  function render(rerenderPanel = true): void {
    // render() rebuilds every <li> from scratch, which would otherwise drop
    // keyboard focus back to document.body on every arrow-key move (selecting
    // a card re-renders the sidebar to show it as .active) — losing exactly
    // the thing keyboard navigation is for. Only restores it when the
    // keyboard was actually driving (focus already inside listNav), so this
    // never steals focus from something else re-rendering the sidebar in the
    // background (e.g. a word add/remove elsewhere calling renderSidebar(false)).
    const hadFocus = ctx.listNav.contains(document.activeElement);

    ctx.listNav.innerHTML = '';
    renderSingleNav();
    renderSmartNav();
    renderMultiNav();
    renderProfilesNav();
    // Every card, whichever of the four sections it belongs to, is a
    // keyboard-navigable stop — see the listNav keydown handler below.
    ctx.listNav.querySelectorAll<HTMLElement>('.ml-list-item').forEach(li => {
      li.tabIndex = 0;
      li.setAttribute('role', 'button');
    });
    if (hadFocus) ctx.listNav.querySelector<HTMLElement>('.ml-list-item.active')?.focus();
    if (rerenderPanel) ctx.renderPanel();
  }

  // ── Create / rename / duplicate (Single-Language Lists) ─────────────────────

  /** The name a fresh copy would get, before the user has a chance to rename it. */
  function suggestCopyName(lang: string, sourceName: string): string {
    const names = getListNames(lang);
    let candidate = sourceName + ' (copy)';
    let n = 2;
    while (names.includes(candidate)) candidate = `${sourceName} (${n++})`;
    return candidate;
  }

  /**
   * Prompt for a name before copying — cancelling the prompt cancels the copy
   * entirely, rather than silently creating "X (copy)" and leaving the user to
   * notice and rename it after the fact.
   */
  function startCopyList(lang: string, sourceName: string): string | null {
    const proposed = suggestCopyName(lang, sourceName);
    const input = window.prompt(`Name for the copy of "${sourceName}":`, proposed);
    if (input === null) return null;               // Cancelled
    const newName = input.trim();
    if (!newName) return null;
    if (getListNames(lang).includes(newName)) {
      alert(`A list named "${newName}" already exists.`);
      return null;
    }
    createList(lang, newName);
    for (const w of getList(lang, sourceName)) addToList(lang, newName, w);
    return newName;
  }

  function startCreateList(): void {
    const li = document.createElement('li');
    li.className = 'ml-list-item ml-list-item--editing';
    const inp = document.createElement('input');
    inp.type = 'text'; inp.placeholder = 'List name...'; inp.className = 'ml-list-name-input';
    const okBtn = document.createElement('button');
    okBtn.type = 'button'; okBtn.className = 'ml-icon-btn'; okBtn.textContent = '✓';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button'; cancelBtn.className = 'ml-icon-btn'; cancelBtn.textContent = '✕';
    function confirmCreate(): void {
      const name = inp.value.trim(); if (!name) { li.remove(); return; }
      createList(ctx.lang, name); ctx.selectedList = name; ctx.updateBadge(); render();
    }
    okBtn.addEventListener('click', confirmCreate);
    cancelBtn.addEventListener('click', () => li.remove());
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') confirmCreate(); if (e.key === 'Escape') li.remove();
    });
    li.appendChild(inp); li.appendChild(okBtn); li.appendChild(cancelBtn);
    ctx.listNav.prepend(li); inp.focus();
  }

  function startRenameList(oldName: string, li: HTMLElement, nameSpan: HTMLElement): void {
    const inp = document.createElement('input');
    inp.type = 'text'; inp.value = oldName; inp.className = 'ml-list-name-input';
    const okBtn = document.createElement('button');
    okBtn.type = 'button'; okBtn.className = 'ml-icon-btn'; okBtn.textContent = '✓';
    function confirmRename(): void {
      const newName = inp.value.trim();
      if (!newName || newName === oldName) { done(); return; }
      if (renameList(ctx.lang, oldName, newName)) {
        if (ctx.selectedList === oldName) ctx.selectedList = newName;
        ctx.updateBadge(); render();
      } else { alert(`A list named "${newName}" already exists.`); inp.focus(); }
    }
    function done(): void { inp.replaceWith(nameSpan); okBtn.remove(); }
    okBtn.addEventListener('click', confirmRename);
    // The list item itself has a click listener that selects it and
    // re-renders the sidebar — without this, clicking inside the input to
    // place the caret (rather than just typing over the select-all) bubbled
    // up and wiped the rename out from under the user before they could edit.
    inp.addEventListener('click', e => e.stopPropagation());
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') confirmRename(); if (e.key === 'Escape') done();
    });
    nameSpan.replaceWith(inp);
    li.querySelector('.ml-list-row-top')?.appendChild(okBtn);
    inp.focus(); inp.select();
  }

  return { leftPane, render };
}
