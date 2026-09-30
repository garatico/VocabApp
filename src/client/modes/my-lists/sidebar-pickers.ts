import { getFolderStyle, setFolderStyle, FOLDER_COLORS } from './folders.ts';
import { SCOPE_LABELS, FILTER_SCOPES, type FilterScope } from '../../filters/filter-scope.ts';
import type { MenuItem } from './sidebar-menu.ts';

/**
 * sidebar-pickers.ts — the small popovers the sidebar opens: pick an emoji and a colour (every
 * card and every folder gets both, the same picker either way), and choose which modes a whole
 * folder of lists is hidden from.
 */

/** Bulk "Hide From" access for every member of one folder, at once — see
 *  buildFolderGroup's `bulkHideFrom` param. `get` reads the *union* of every
 *  member's own `hiddenModes` (a mode shows checked if any member already
 *  hides from it) since members can disagree; `set` overwrites every
 *  member's `hiddenModes` to match, which is the point — one action instead
 *  of opening each list's own Hide From dropdown in turn. */
export interface BulkHideFrom { get(): FilterScope[]; set(modes: FilterScope[]): void; }

export interface CardStyle { emoji?: string; color?: string; }

export interface StylePickerOptions extends CardStyle {
  onSave(style: CardStyle): void;
}

export interface CreatePickerKitDeps {
  render: (rerenderPanel?: boolean) => void;
  closeAllActionMenus: () => void;
}

/**
 * Emoji "selection window": a handful of hand-picked categories rather than
 * one long undifferentiated grid — a learner scanning for a travel or food
 * icon can jump straight to that row instead of reading every emoji in the
 * picker. The free-text input below still accepts anything outside this set.
 */
const EMOJI_CATEGORIES: { label: string; emoji: string[] }[] = [
  { label: 'Common',  emoji: ['⭐', '🔥', '💡', '✅', '❗', '❤️', '👍', '🎯', '🏆', '🔑', '📌', '🔖'] },
  { label: 'Study',   emoji: ['📚', '📖', '✏️', '📝', '🎓', '🧠', '🔤', '🗣️', '🔬', '🧮', '📐', '🎧'] },
  { label: 'Travel',  emoji: ['✈️', '🌍', '🗺️', '🏝️', '🏔️', '🚗', '🚆', '🏨', '🧳', '🗽', '⛺', '🚢'] },
  { label: 'Life',    emoji: ['🏠', '💼', '⚖️', '🩺', '💰', '👨‍👩‍👧', '🛒', '📅', '💻', '🔧', '🎨', '🎵'] },
  { label: 'Food',    emoji: ['🍽️', '🍎', '🍕', '☕', '🍷', '🥐', '🍔', '🍣', '🥗', '🍰', '🍺', '🍇'] },
  { label: 'Nature',  emoji: ['🌿', '🌳', '🌸', '🐾', '🐦', '🌞', '🌊', '⛰️', '🦋', '🌵', '🍄', '❄️'] },
  { label: 'Symbols', emoji: ['🎉', '⚡', '🎲', '🧩', '🔵', '🟢', '🟡', '🟣', '🔺', '⬛', '💬', '🚩'] },
];

export function createPickerKit(deps: CreatePickerKitDeps) {
  const { render, closeAllActionMenus } = deps;

  /** The gear menu's "Emoji & Colour" entry: pick (or clear) this card's emoji and accent colour. */
  function styleItem(current: CardStyle, save: (style: CardStyle) => void): MenuItem {
    return {
      glyph: '🎨', label: 'Emoji & Colour', title: 'Choose an emoji and a colour for this list', tone: 'emoji',
      onClick: anchor => openStylePicker(anchor, {
        ...current,
        onSave: style => { save(style); },
      }),
    };
  }

  /** Emoji and colour picker as a small popover under `anchor` (moved to
   *  <body> like the gear menu, for the same clipping reasons). */
  function openStylePicker(anchor: HTMLElement, opts: StylePickerOptions): void {
    closeAllActionMenus();
    document.querySelector('.ml-folder-style-pop')?.remove();
    const style = { emoji: opts.emoji, color: opts.color };
    const pop = document.createElement('div');
    pop.className = 'ml-folder-style-pop';

    const save = (): void => { opts.onSave({ ...style }); render(false); };

    const emojiRow = document.createElement('label');
    emojiRow.className = 'ml-folder-style-row';
    emojiRow.append(document.createTextNode('Emoji'));
    const emojiInp = document.createElement('input');
    emojiInp.type = 'text'; emojiInp.maxLength = 8; emojiInp.placeholder = 'None';
    emojiInp.value = style.emoji ?? '';
    emojiInp.addEventListener('change', () => { style.emoji = emojiInp.value.trim() || undefined; save(); });
    emojiRow.appendChild(emojiInp);
    pop.appendChild(emojiRow);

    // Category tabs above the grid — clicking one swaps which row of emoji is
    // shown below, so the popover stays a fixed, small size regardless of how
    // many categories exist. Starts on whichever category (if any) already
    // contains the card's current emoji, so re-opening the picker doesn't
    // always dump the user back on "Common".
    const startCategory = EMOJI_CATEGORIES.find(c => style.emoji && c.emoji.includes(style.emoji)) ?? EMOJI_CATEGORIES[0];
    const tabs = document.createElement('div');
    tabs.className = 'ml-emoji-tabs';
    const grid = document.createElement('div');
    grid.className = 'ml-folder-style-quick';

    function paintGrid(category: typeof EMOJI_CATEGORIES[number]): void {
      grid.innerHTML = '';
      category.emoji.forEach(em => {
        const b = document.createElement('button');
        b.type = 'button'; b.textContent = em; b.title = em;
        b.addEventListener('click', () => { style.emoji = em; emojiInp.value = em; save(); });
        grid.appendChild(b);
      });
      const clear = document.createElement('button');
      clear.type = 'button'; clear.textContent = '∅'; clear.title = 'No emoji';
      clear.addEventListener('click', () => { style.emoji = undefined; emojiInp.value = ''; save(); });
      grid.appendChild(clear);
    }

    EMOJI_CATEGORIES.forEach(cat => {
      const tab = document.createElement('button');
      tab.type = 'button'; tab.textContent = cat.label;
      tab.className = 'ml-emoji-tab' + (cat === startCategory ? ' ml-emoji-tab--on' : '');
      tab.addEventListener('click', () => {
        tabs.querySelectorAll('.ml-emoji-tab').forEach(t => t.classList.remove('ml-emoji-tab--on'));
        tab.classList.add('ml-emoji-tab--on');
        paintGrid(cat);
      });
      tabs.appendChild(tab);
    });
    paintGrid(startCategory);
    pop.append(tabs, grid);

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
        customColor.classList.remove('ml-folder-swatch--on');
        b.classList.add('ml-folder-swatch--on');
      });
      colorRow.appendChild(b);
    };
    swatch(undefined);
    FOLDER_COLORS.forEach(swatch);

    // The OS's own colour picker (Windows' classic "Custom Colors" dialog,
    // with a hex field, on top of a plain browser <input type="color">) —
    // the swatches above are quick presets, this is for any exact colour.
    const customColor = document.createElement('input');
    customColor.type = 'color';
    customColor.className = 'ml-folder-swatch ml-folder-swatch--custom';
    customColor.title = 'Custom colour…';
    const currentColor = style.color;
    customColor.value = currentColor && /^#[0-9a-f]{6}$/i.test(currentColor) ? currentColor : '#888888';
    const isPreset = (c: string | undefined): boolean => c === undefined || FOLDER_COLORS.includes(c);
    if (!isPreset(style.color)) customColor.classList.add('ml-folder-swatch--on');
    customColor.addEventListener('input', () => {
      style.color = customColor.value; save();
      colorRow.querySelectorAll('.ml-folder-swatch').forEach(x => x.classList.remove('ml-folder-swatch--on'));
      customColor.classList.add('ml-folder-swatch--on');
    });
    colorRow.appendChild(customColor);
    pop.appendChild(colorRow);

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
      ...cur,
      onSave: next => { setFolderStyle(scope, folder, next); },
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

  return { styleItem, openFolderStylePicker, openHideFromPicker };
}
