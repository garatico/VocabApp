import { getFolderStyle, setFolderStyle, FOLDER_COLORS } from './folders.ts';
import { SCOPE_LABELS, FILTER_SCOPES, type FilterScope } from '../../filters/filter-scope.ts';
import type { MenuItem } from './sidebar-menu.ts';

/**
 * sidebar-pickers.ts — the small popovers the sidebar opens: pick an emoji (and a colour, for
 * folders), and choose which modes a whole folder of lists is hidden from.
 */

/** Bulk "Hide From" access for every member of one folder, at once — see
 *  buildFolderGroup's `bulkHideFrom` param. `get` reads the *union* of every
 *  member's own `hiddenModes` (a mode shows checked if any member already
 *  hides from it) since members can disagree; `set` overwrites every
 *  member's `hiddenModes` to match, which is the point — one action instead
 *  of opening each list's own Hide From dropdown in turn. */
export interface BulkHideFrom { get(): FilterScope[]; set(modes: FilterScope[]): void; }

export interface StylePickerOptions {
  emoji?: string; color?: string;
  /** Folders get a colour too; a list is emoji-only. */
  withColor: boolean;
  onSave(style: { emoji?: string; color?: string }): void;
}

export interface CreatePickerKitDeps {
  render: (rerenderPanel?: boolean) => void;
  closeAllActionMenus: () => void;
}

export function createPickerKit(deps: CreatePickerKitDeps) {
  const { render, closeAllActionMenus } = deps;

  /** The gear menu's "Emoji" entry: pick (or clear) this list's emoji. */
  function emojiItem(current: string | undefined, save: (emoji: string | undefined) => void): MenuItem {
    return {
      glyph: '😀', label: 'Emoji', title: 'Choose an emoji for this list', tone: 'emoji',
      onClick: anchor => openStylePicker(anchor, {
        emoji: current, withColor: false,
        onSave: style => { save(style.emoji); render(false); },
      }),
    };
  }

  /** Emoji (and optionally colour) picker as a small popover under `anchor`
   *  (moved to <body> like the gear menu, for the same clipping reasons). */
  function openStylePicker(anchor: HTMLElement, opts: StylePickerOptions): void {
    closeAllActionMenus();
    document.querySelector('.ml-folder-style-pop')?.remove();
    const style = { emoji: opts.emoji, color: opts.color };
    const pop = document.createElement('div');
    pop.className = 'ml-folder-style-pop';

    const save = (): void => opts.onSave({ ...style });

    const emojiRow = document.createElement('label');
    emojiRow.className = 'ml-folder-style-row';
    emojiRow.append(document.createTextNode('Emoji'));
    const emojiInp = document.createElement('input');
    emojiInp.type = 'text'; emojiInp.maxLength = 8; emojiInp.placeholder = 'None';
    emojiInp.value = style.emoji ?? '';
    emojiInp.addEventListener('change', () => { style.emoji = emojiInp.value.trim() || undefined; save(); });
    emojiRow.appendChild(emojiInp);

    const quick = document.createElement('div');
    quick.className = 'ml-folder-style-quick';
    ['📚', '🩺', '🍽', '✈️', '💼', '🏠', '🌿', '💻', '⚖️', '🎨', '⭐', '🔥'].forEach(em => {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = em;
      b.addEventListener('click', () => { style.emoji = em; emojiInp.value = em; save(); });
      quick.appendChild(b);
    });
    const clear = document.createElement('button');
    clear.type = 'button'; clear.textContent = '∅'; clear.title = 'No emoji';
    clear.addEventListener('click', () => { style.emoji = undefined; emojiInp.value = ''; save(); });
    quick.appendChild(clear);

    pop.append(emojiRow, quick);

    if (opts.withColor) {
      const colorRow = document.createElement('div');
      colorRow.className = 'ml-folder-style-colors';
      const swatch = (color: string | undefined): void => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'ml-folder-swatch' + (style.color === color ? ' ml-folder-swatch--on' : '');
        b.title = color ? color : 'No colour';
        if (color) b.style.background = color; else b.textContent = '∅';
        b.addEventListener('click', () => {
          style.color = color; save();
          colorRow.querySelectorAll('.ml-folder-swatch').forEach(x => x.classList.remove('ml-folder-swatch--on'));
          b.classList.add('ml-folder-swatch--on');
        });
        colorRow.appendChild(b);
      };
      swatch(undefined);
      FOLDER_COLORS.forEach(swatch);
      pop.appendChild(colorRow);
    }

    document.body.appendChild(pop);
    const r = anchor.getBoundingClientRect();
    pop.style.left = `${Math.max(4, Math.min(r.right - pop.offsetWidth, window.innerWidth - pop.offsetWidth - 4))}px`;
    pop.style.top = `${r.bottom + pop.offsetHeight + 8 > window.innerHeight ? Math.max(4, r.top - pop.offsetHeight - 4) : r.bottom + 4}px`;
    pop.addEventListener('click', e => e.stopPropagation());
    const dismiss = (e: Event): void => {
      if (pop.contains(e.target as Node)) return;
      pop.remove(); document.removeEventListener('click', dismiss, true);
    };
    setTimeout(() => document.addEventListener('click', dismiss, true), 0);
  }

  function openFolderStylePicker(anchor: HTMLElement, scope: string, folder: string): void {
    const cur = getFolderStyle(scope, folder);
    openStylePicker(anchor, {
      ...cur, withColor: true,
      onSave: next => { setFolderStyle(scope, folder, next); render(false); },
    });
  }

  /** "Hide From" for a whole folder: a checkbox per mode in a popover on
   *  <body>, so — unlike the dropdown this replaced — the sidebar's own
   *  scrolling/overflow can't clip it. */
  function openHideFromPicker(anchor: HTMLElement, bulk: BulkHideFrom): void {
    closeAllActionMenus();
    document.querySelector('.ml-folder-style-pop')?.remove();
    const selected = new Set<FilterScope>(bulk.get());
    const pop = document.createElement('div');
    pop.className = 'ml-folder-style-pop';
    const heading = document.createElement('div');
    heading.className = 'ml-folder-style-row';
    heading.textContent = 'Hide this folder\'s lists from';
    pop.appendChild(heading);
    FILTER_SCOPES.forEach(scope => {
      const row = document.createElement('label');
      row.className = 'ml-chip-dropdown-item';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = selected.has(scope);
      cb.addEventListener('change', () => {
        if (cb.checked) selected.add(scope); else selected.delete(scope);
        bulk.set([...selected]);
      });
      row.append(cb, document.createTextNode(SCOPE_LABELS[scope]));
      pop.appendChild(row);
    });
    document.body.appendChild(pop);
    const r = anchor.getBoundingClientRect();
    pop.style.left = `${Math.max(4, Math.min(r.right - pop.offsetWidth, window.innerWidth - pop.offsetWidth - 4))}px`;
    pop.style.top = `${r.bottom + pop.offsetHeight + 8 > window.innerHeight ? Math.max(4, r.top - pop.offsetHeight - 4) : r.bottom + 4}px`;
    pop.addEventListener('click', e => e.stopPropagation());
    const dismiss = (e: Event): void => {
      if (pop.contains(e.target as Node)) return;
      pop.remove(); document.removeEventListener('click', dismiss, true);
    };
    setTimeout(() => document.addEventListener('click', dismiss, true), 0);
  }

  return { emojiItem, openFolderStylePicker, openHideFromPicker };
}
