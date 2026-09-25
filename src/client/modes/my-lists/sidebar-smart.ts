import { closePopover } from './move-popover.ts';
import { getSmartNames, getSmartLists, saveSmartRule, deleteSmartList, renameSmartList, evaluateSmart, DEFAULT_SMART_RULE, type SmartRule } from './smart-lists.ts';
import { cachedVocab, fetchVocab } from './vocab-cache.ts';
import type { SidebarKit } from './sidebar-kit.ts';

/**
 * sidebar-smart.ts — the Smart Lists section (saved queries): its cards and the create / rename /
 * copy flows.
 */

export function createSmartSection(kit: SidebarKit) {
  const { ctx, render, sectionHead, buildActionMenu, emojiSpan, emojiItem, makeListDraggable, renderEmptyFolderPlaceholders } = kit;

  // ── Smart lists ────────────────────────────────────────────────────────────

  function renderSmartNav(): void {
    const folderScope = `smart_${ctx.lang}`;
    const head = sectionHead(
      'ml-smart-head', 'Smart Lists', 'Create a smart list — a saved query that stays current',
      () => startCreateSmart(head), folderScope,
    );
    ctx.listNav.appendChild(head);

    const smartNames = getSmartNames(ctx.lang);
    if (smartNames.length === 0) {
      const hint = document.createElement('li');
      hint.className = 'ml-list-empty ml-smart-hint';
      hint.textContent = 'e.g. "B1 verbs I haven’t learned"';
      ctx.listNav.appendChild(hint);
      renderEmptyFolderPlaceholders(folderScope, []);
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

    const usedFolders = new Set<string>();

    smartNames.forEach(name => {
      const rule = getSmartLists(ctx.lang)[name];
      const folders = rule.folders ?? [];
      folders.forEach(f => usedFolders.add(f));
      const instances = folders.length > 0 ? folders : [''];

      instances.forEach(folder => {
      const li = document.createElement('li');
      li.className = 'ml-list-item ml-list-item--full ml-smart-item'
        + (name === ctx.selectedSmart ? ' active' : '');
      li.dataset.folder = folder;
      makeListDraggable(li, { kind: 'smart', lang: ctx.lang, name });

      const topRow = document.createElement('div');
      topRow.className = 'ml-list-row-top';
      const nameSpan = document.createElement('span');
      nameSpan.className = 'ml-list-name';
      nameSpan.textContent = name;
      const countSpan = document.createElement('span');
      countSpan.className = 'ml-list-count';
      paintSmartCount(countSpan, rule);
      smartCountEls.push({ el: countSpan, rule });
      topRow.append(nameSpan);
      const manualN = rule.manualWords.length;
      if (manualN > 0) {
        const tag = document.createElement('span');
        tag.className = 'ml-manual-badge';
        tag.textContent = `✋ ${manualN}`;
        tag.title = `${manualN} manual addition${manualN === 1 ? '' : 's'} — words pinned by hand`;
        topRow.append(tag);
      }
      topRow.append(countSpan);

      topRow.append(buildActionMenu([
        emojiItem(rule.emoji, emoji => saveSmartRule(ctx.lang, name, { ...getSmartLists(ctx.lang)[name], emoji })),
        { glyph: '⧉', label: 'Copy', title: 'Duplicate smart list', tone: 'copy', onClick: () => {
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
        } },
        { glyph: '✏', label: 'Rename', title: 'Rename', tone: 'rename', onClick: () => {
          startRenameSmart(name, li, nameSpan);
        } },
        { glyph: '🗑', label: 'Delete', title: 'Delete this smart list', tone: 'delete', onClick: () => {
          if (!window.confirm(`Delete smart list "${name}"? The words themselves are untouched.`)) return;
          deleteSmartList(ctx.lang, name);
          if (ctx.selectedSmart === name) ctx.selectedSmart = null;
          render();
        } },
      ]));
      const em = emojiSpan(rule.emoji); if (em) topRow.prepend(em);
      li.append(topRow);
      li.addEventListener('click', () => {
        ctx.selectedSmart = name; ctx.selectedMultiList = null; ctx.selectedProfile = null;
        closePopover(); render();
      });
      ctx.listNav.appendChild(li);
      });
    });

    renderEmptyFolderPlaceholders(folderScope, [...usedFolders]);

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
    const rowTop = li.querySelector('.ml-list-row-top');
    rowTop?.insertBefore(okBtn, rowTop.querySelector('.ml-menu-wrap'));
    inp.focus(); inp.select();
  }

  return { renderNav: renderSmartNav };
}
