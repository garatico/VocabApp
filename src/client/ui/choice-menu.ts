/**
 * choice-menu.ts — a click-to-open menu standing in for a row of option buttons.
 *
 * Settings' colour themes and background presets were long rows of buttons. This draws them as one
 * button showing the current choice that opens a list, and leaves the original row in the page — hidden
 * (`.ctl-proxied`) — as the source of truth: picking an entry clicks the matching hidden button, so the
 * existing handlers run exactly as before, and anything that changes the row from elsewhere (a saved
 * setting restored, Reset) is mirrored onto the trigger. The same pattern as ui/toggle-proxy.ts.
 */

export interface ChoiceMenuOptions {
  /** Accessible name for the trigger. */
  label: string;
  /** What to draw for one option: its swatch and its name. */
  render(button: HTMLButtonElement): Node[];
  /** Which option is the current one, or null when none is (shown as `placeholder`). Default: the `.active` button. */
  current?(buttons: HTMLButtonElement[]): HTMLButtonElement | null;
  /** Trigger text when there is no current option. */
  placeholder?: string;
  /** Lay the entries out in two columns (long lists of swatches). */
  grid?: boolean;
  /** Extra element the trigger should repaint on (e.g. the colour inputs a preset list is compared with). */
  watch?: Element[];
}

export function enhanceChoiceMenu(source: HTMLElement | null, opts: ChoiceMenuOptions): void {
  if (!source || source.dataset['enhanced'] === 'true') return;
  source.dataset['enhanced'] = 'true';
  source.classList.add('ctl-proxied');

  const buttons = (): HTMLButtonElement[] => [...source.querySelectorAll<HTMLButtonElement>('button')];
  const currentOf = opts.current ?? ((bs: HTMLButtonElement[]) => bs.find(b => b.classList.contains('active')) ?? null);

  const root = document.createElement('div');
  root.className = 'choice-menu';
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'choice-menu-trigger';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-label', opts.label);
  const list = document.createElement('ul');
  list.className = 'choice-menu-list' + (opts.grid ? ' choice-menu-list--grid' : '');
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', opts.label);
  list.tabIndex = -1;
  list.hidden = true;
  root.append(trigger, list);
  source.after(root);

  let active = 0;
  const items = (): HTMLLIElement[] => [...list.querySelectorAll<HTMLLIElement>('li')];

  function paintTrigger(): void {
    const cur = currentOf(buttons());
    trigger.replaceChildren(
      ...(cur ? opts.render(cur) : [document.createTextNode(opts.placeholder ?? opts.label)]),
      Object.assign(document.createElement('span'), { className: 'choice-menu-chevron', textContent: '▾', ariaHidden: 'true' }),
    );
  }

  function rebuild(): void {
    const bs = buttons();
    const cur = currentOf(bs);
    list.replaceChildren(...bs.map(b => {
      const li = document.createElement('li');
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', String(b === cur));
      li.append(...opts.render(b));
      return li;
    }));
    paintTrigger();
  }

  function highlight(i: number): void {
    active = Math.max(0, Math.min(items().length - 1, i));
    items().forEach((li, n) => li.classList.toggle('choice-menu-active', n === active));
    items()[active]?.scrollIntoView({ block: 'nearest' });
  }
  function open(): void {
    rebuild();
    list.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    highlight(Math.max(0, buttons().indexOf(currentOf(buttons()) as HTMLButtonElement)));
    list.focus();
  }
  function close(refocus = true): void {
    if (list.hidden) return;
    list.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    if (refocus) trigger.focus();
  }
  function choose(i: number): void {
    buttons()[i]?.click();
    paintTrigger();
    close();
  }

  trigger.addEventListener('click', () => (list.hidden ? open() : close()));
  trigger.addEventListener('keydown', e => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); open(); } });
  list.addEventListener('keydown', e => {
    const step = opts.grid ? 2 : 1;
    if (e.key === 'ArrowDown') { e.preventDefault(); highlight(active + step); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); highlight(active - step); }
    else if (e.key === 'ArrowRight' && opts.grid) { e.preventDefault(); highlight(active + 1); }
    else if (e.key === 'ArrowLeft' && opts.grid) { e.preventDefault(); highlight(active - 1); }
    else if (e.key === 'Home') { e.preventDefault(); highlight(0); }
    else if (e.key === 'End') { e.preventDefault(); highlight(items().length - 1); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(active); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'Tab') close(false);
  });
  list.addEventListener('click', e => {
    const li = (e.target as Element).closest('li');
    if (li) choose(items().indexOf(li as HTMLLIElement));
  });
  document.addEventListener('mousedown', e => { if (!root.contains(e.target as Node)) close(false); });
  root.addEventListener('focusout', e => { if (!root.contains(e.relatedTarget as Node | null)) close(false); });

  new MutationObserver(paintTrigger).observe(source, { subtree: true, attributes: true, attributeFilter: ['class'] });
  (opts.watch ?? []).forEach(el => { el.addEventListener('input', paintTrigger); el.addEventListener('change', paintTrigger); el.addEventListener('click', () => window.setTimeout(paintTrigger, 0)); });
  rebuild();
}
