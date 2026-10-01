import '../../styles-lazy/my-lists.css';


/**
 * sidebar-menu.ts — the ⚙ gear menu every list card carries, and the emoji span that
 * fronts a card's name. No dependencies: it is the bottom layer the other sidebar
 * modules build on.
 */

/** One entry in a card's gear menu. `tone` picks its color (see .ml-menu-item--*). */
export interface MenuItem {
  glyph: string; label: string; title: string;
  tone: 'emoji' | 'hide' | 'copy' | 'export' | 'rename' | 'delete';
  /** `anchor` is the card's gear button, for a popover that opens beside it. */
  onClick: (anchor: HTMLElement) => void;
  /** Makes this entry a parent: clicking it opens these beneath it instead of doing anything itself. */
  submenu?: MenuItem[];
}

/**
 * The order every gear menu — list cards and folders alike — is shown in, whatever order a section
 * builds its entries in: name it, make another one (Copy / Add Subfolder), style it, then what it
 * can be sent to or hidden from, and Delete last, apart from the rest. Lists therefore read
 * Rename · Copy · Emoji & Colour · Export ▸ · Delete, and folders Rename · Add Subfolder ·
 * Emoji & Colour · Hide From · Delete.
 */
const TONE_ORDER: Record<MenuItem['tone'], number> = { rename: 0, copy: 1, emoji: 2, export: 3, hide: 4, delete: 5 };

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

    /** Sits the open menu under the gear (or above it, if there's no room below). */
    function place(): void {
      const r = gear.getBoundingClientRect();
      const w = menu.offsetWidth, h = menu.offsetHeight;
      menu.style.left = `${Math.max(4, Math.min(r.right - w, window.innerWidth - w - 4))}px`;
      menu.style.top = `${r.bottom + h + 8 > window.innerHeight ? Math.max(4, r.top - h - 4) : r.bottom + 4}px`;
    }

    const collapseSubmenus = (): void => {
      menu.querySelectorAll<HTMLElement>('.ml-submenu').forEach(s => { s.hidden = true; });
      menu.querySelectorAll<HTMLElement>('.ml-menu-item--parent').forEach(p => {
        p.setAttribute('aria-expanded', 'false');
        const chev = p.querySelector('.ml-menu-chevron'); if (chev) chev.textContent = '\u25B8';
      });
    };

    const ordered = [...items].sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone]);
    ordered.forEach(item => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `ml-menu-item ml-menu-item--${item.tone}`;
      b.setAttribute('role', 'menuitem');
      b.title = item.title;
      if (item.submenu) {
        b.classList.add('ml-menu-item--parent');
        b.setAttribute('aria-haspopup', 'menu');
        b.setAttribute('aria-expanded', 'false');
        b.innerHTML = `<span aria-hidden="true">${item.glyph}</span> ${item.label} <span class="ml-menu-chevron" aria-hidden="true">\u25B8</span>`;
        const sub = document.createElement('div');
        sub.className = 'ml-submenu';
        sub.setAttribute('role', 'menu');
        sub.hidden = true;
        item.submenu.forEach(subItem => {
          const sb = document.createElement('button');
          sb.type = 'button';
          sb.className = `ml-menu-item ml-menu-item--${subItem.tone} ml-menu-subitem`;
          sb.setAttribute('role', 'menuitem');
          sb.title = subItem.title;
          sb.innerHTML = `<span aria-hidden="true">${subItem.glyph}</span> ${subItem.label}`;
          sb.addEventListener('click', e => {
            e.stopPropagation();
            closeAllActionMenus();
            subItem.onClick(gear);
          });
          sub.appendChild(sb);
        });
        b.addEventListener('click', e => {
          e.stopPropagation();
          const open = sub.hidden;
          collapseSubmenus();
          sub.hidden = !open;
          b.setAttribute('aria-expanded', String(open));
          const chev = b.querySelector('.ml-menu-chevron'); if (chev) chev.textContent = open ? '\u25BE' : '\u25B8';
          place();                                   // the menu just got taller or shorter
        });
        menu.append(b, sub);
        return;
      }
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
      collapseSubmenus();
      document.body.appendChild(menu);
      menu.hidden = false;
      place();
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
