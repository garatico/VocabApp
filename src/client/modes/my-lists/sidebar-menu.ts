

/**
 * sidebar-menu.ts — the ⚙ gear menu every list card carries, and the emoji span that
 * fronts a card's name. No dependencies: it is the bottom layer the other sidebar
 * modules build on.
 */

/** One entry in a card's gear menu. `tone` picks its color (see .ml-menu-item--*). */
export interface MenuItem {
  glyph: string; label: string; title: string;
  tone: 'emoji' | 'hide' | 'copy' | 'rename' | 'delete';
  /** `anchor` is the card's gear button, for a popover that opens beside it. */
  onClick: (anchor: HTMLElement) => void;
}

export function createMenuKit() {
  // An open menu is moved to <body> (see buildActionMenu) so an ancestor's
  // transform/overflow can't offset or clip its fixed position; closing puts
  // it back inside its own card's wrapper.
  const menuOwners = new WeakMap<HTMLElement, HTMLElement>();

  function closeAllActionMenus(): void {
    document.querySelectorAll<HTMLElement>('.ml-action-menu').forEach(m => {
      m.hidden = true;
      menuOwners.get(m)?.appendChild(m);
    });
    document.querySelectorAll<HTMLElement>('.ml-menu-gear[aria-expanded="true"]')
      .forEach(b => b.setAttribute('aria-expanded', 'false'));
  }

  /**
   * A card's ⚙ gear: one button that opens a dropdown of the card's actions
   * (Copy / Rename / Delete, plus Settings where a card has one), each with
   * its own icon and color. The menu is `position: fixed`, placed from the
   * button's rect on open, so the sidebar's scroll container can't clip it.
   */
  function buildActionMenu(items: MenuItem[]): HTMLElement {
    const wrap = document.createElement('span');
    wrap.className = 'ml-menu-wrap';

    const gear = document.createElement('button');
    gear.type = 'button';
    gear.className = 'ml-menu-gear';
    gear.title = 'Actions';
    gear.setAttribute('aria-haspopup', 'menu');
    gear.setAttribute('aria-expanded', 'false');
    gear.setAttribute('aria-label', 'Actions');
    gear.textContent = '⚙';

    const menu = document.createElement('div');
    menuOwners.set(menu, wrap);
    menu.className = 'ml-action-menu';
    menu.setAttribute('role', 'menu');
    menu.hidden = true;

    items.forEach(item => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `ml-menu-item ml-menu-item--${item.tone}`;
      b.setAttribute('role', 'menuitem');
      b.title = item.title;
      b.innerHTML = `<span aria-hidden="true">${item.glyph}</span> ${item.label}`;
      b.addEventListener('click', e => {
        e.stopPropagation();
        closeAllActionMenus();
        item.onClick(gear);
      });
      menu.appendChild(b);
    });

    gear.addEventListener('click', e => {
      // The card is itself a click target that selects + re-renders.
      e.stopPropagation();
      const opening = menu.hidden;
      closeAllActionMenus();
      if (!opening) return;
      const r = gear.getBoundingClientRect();
      document.body.appendChild(menu);
      menu.hidden = false;
      const w = menu.offsetWidth, h = menu.offsetHeight;
      menu.style.left = `${Math.max(4, Math.min(r.right - w, window.innerWidth - w - 4))}px`;
      menu.style.top = `${r.bottom + h + 8 > window.innerHeight ? Math.max(4, r.top - h - 4) : r.bottom + 4}px`;
      gear.setAttribute('aria-expanded', 'true');
    });
    menu.addEventListener('click', e => e.stopPropagation());
    const onEscape = (e: KeyboardEvent): void => { if (e.key === 'Escape') { closeAllActionMenus(); gear.focus(); } };
    wrap.addEventListener('keydown', onEscape);
    menu.addEventListener('keydown', onEscape);

    wrap.append(gear, menu);
    return wrap;
  }

  /** A list's own emoji, as a span for the front of its name row (or null). */
  function emojiSpan(emoji: string | undefined): HTMLElement | null {
    if (!emoji) return null;
    const el = document.createElement('span');
    el.className = 'ml-list-emoji';
    el.setAttribute('aria-hidden', 'true');
    el.textContent = emoji;
    return el;
  }

  return { buildActionMenu, closeAllActionMenus, emojiSpan };
}
