/**
 * language-dropdown.ts — the language `<select>`, drawn with each language's flag and colour.
 *
 * A native `<select>` can tint an option but cannot put an image in it, and the flags are SVG files (Windows
 * has no flag emoji — see data/languages.ts). So the native select stays in the page as the source of
 * truth, visually hidden and out of the tab order, and this listbox stands in for it: every read or write
 * of `select.value`, and every `change` listener, keeps working exactly as before. Choosing an entry sets
 * the select's value and fires `change`; setting the value from code (restoring a saved language) repaints
 * the trigger; rebuilding or disabling options (a language with no data yet) rebuilds the list.
 *
 * Each entry and the closed trigger use the language's own tint (`--lang-<name>-bg`, the colour Table's
 * language indicator uses, which Settings can override) and its flag (Settings can choose another).
 */

import { LANGUAGES, flagUrl } from '../data/languages.ts';
import { Settings } from '../settings.ts';

const langInfo = (name: string) => LANGUAGES.find(l => l.name === name);

export function enhanceLanguageSelect(target: HTMLSelectElement | null): void {
  if (!target || target.dataset['enhanced'] === 'true') return;
  const select: HTMLSelectElement = target;   // narrowed once, so the closures below see a non-null select
  select.dataset['enhanced'] = 'true';

  const root = document.createElement('div');
  root.className = 'lang-dd';

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'lang-dd-trigger';
  trigger.id = `${select.id}Btn`;
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');

  const list = document.createElement('ul');
  list.className = 'lang-dd-list';
  list.setAttribute('role', 'listbox');
  list.id = `${select.id}List`;
  list.tabIndex = -1;
  list.hidden = true;
  trigger.setAttribute('aria-controls', list.id);

  root.append(trigger, list);
  select.after(root);
  select.classList.add('lang-dd-native');
  select.tabIndex = -1;
  select.setAttribute('aria-hidden', 'true');
  // The label that used to focus the select now focuses the button.
  document.querySelectorAll<HTMLLabelElement>(`label[for="${select.id}"]`).forEach(l => { l.htmlFor = trigger.id; });
  trigger.setAttribute('aria-label', select.getAttribute('aria-label') ?? 'Language');

  const flag = (name: string): HTMLImageElement => {
    const img = document.createElement('img');
    img.className = 'lang-dd-flag';
    img.alt = '';
    img.width = 20; img.height = 14;
    const info = langInfo(name);
    if (info) img.src = flagUrl(Settings.getLangFlag(name) || info.flagCountry);
    return img;
  };
  const tint = (el: HTMLElement, name: string): void => {
    const info = langInfo(name);
    if (info) el.style.setProperty('--lang-tint', `var(${info.colorVar})`);
  };

  let active = -1;
  const items = (): HTMLLIElement[] => [...list.querySelectorAll<HTMLLIElement>('li')];
  const enabledIndexes = (): number[] => items().map((li, i) => (li.getAttribute('aria-disabled') === 'true' ? -1 : i)).filter(i => i >= 0);

  function paintTrigger(): void {
    const opt = select.selectedOptions[0];
    trigger.replaceChildren();
    if (!opt) return;
    trigger.append(flag(opt.value), Object.assign(document.createElement('span'), { className: 'lang-dd-name', textContent: opt.textContent ?? opt.value }),
      Object.assign(document.createElement('span'), { className: 'lang-dd-chevron', textContent: '▾', ariaHidden: 'true' }));
    tint(trigger, opt.value);
  }

  function rebuild(): void {
    list.replaceChildren(...[...select.options].map(opt => {
      const li = document.createElement('li');
      li.setAttribute('role', 'option');
      li.id = `${list.id}-${opt.value}`;
      li.dataset['value'] = opt.value;
      li.setAttribute('aria-selected', String(opt.selected));
      if (opt.disabled) li.setAttribute('aria-disabled', 'true');
      li.append(flag(opt.value), Object.assign(document.createElement('span'), { textContent: opt.textContent ?? opt.value }));
      tint(li, opt.value);
      return li;
    }));
    paintTrigger();
  }

  function highlight(i: number): void {
    active = i;
    items().forEach((li, n) => li.classList.toggle('lang-dd-active', n === i));
    const li = items()[i];
    if (li) { trigger.setAttribute('aria-activedescendant', li.id); li.scrollIntoView({ block: 'nearest' }); }
  }

  function open(): void {
    if (!list.hidden) return;
    rebuild();   // picks up a flag chosen in Settings since the last time
    list.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    highlight(Math.max(0, select.selectedIndex));
    list.focus();
  }
  function close(refocus = true): void {
    if (list.hidden) return;
    list.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    trigger.removeAttribute('aria-activedescendant');
    if (refocus) trigger.focus();
  }
  function choose(i: number): void {
    const li = items()[i];
    if (!li || li.getAttribute('aria-disabled') === 'true') return;
    const changed = select.value !== li.dataset['value'];
    select.value = li.dataset['value'] ?? select.value;
    if (changed) select.dispatchEvent(new Event('change', { bubbles: true }));
    close();
  }
  function step(delta: number): void {
    const ok = enabledIndexes();
    if (ok.length === 0) return;
    const at = ok.indexOf(active);
    highlight(ok[Math.min(ok.length - 1, Math.max(0, (at === -1 ? 0 : at) + delta))]);
  }

  trigger.addEventListener('click', () => (list.hidden ? open() : close()));
  trigger.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); open(); }
  });
  list.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); step(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); step(-1); }
    else if (e.key === 'Home') { e.preventDefault(); highlight(enabledIndexes()[0] ?? 0); }
    else if (e.key === 'End') { e.preventDefault(); const ok = enabledIndexes(); highlight(ok[ok.length - 1] ?? 0); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(active); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'Tab') close(false);
    else if (e.key.length === 1) {
      // Type-ahead: the next enabled language starting with that letter.
      const ok = enabledIndexes();
      const from = ok.indexOf(active);
      const ordered = [...ok.slice(from + 1), ...ok.slice(0, from + 1)];
      const hit = ordered.find(i => (items()[i].textContent ?? '').trim().toLowerCase().startsWith(e.key.toLowerCase()));
      if (hit !== undefined) highlight(hit);
    }
  });
  list.addEventListener('click', e => {
    const li = (e.target as Element).closest('li');
    if (li) choose(items().indexOf(li as HTMLLIElement));
  });
  list.addEventListener('mousemove', e => {
    const li = (e.target as Element).closest('li');
    if (li && li.getAttribute('aria-disabled') !== 'true') highlight(items().indexOf(li as HTMLLIElement));
  });
  document.addEventListener('mousedown', e => { if (!root.contains(e.target as Node)) close(false); });
  root.addEventListener('focusout', e => { if (!root.contains(e.relatedTarget as Node | null)) close(false); });

  // Code that sets `select.value` (restoring a saved language) does not fire an event, so repaint on the setter.
  const proto = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
  if (proto?.get && proto.set) {
    Object.defineProperty(select, 'value', {
      configurable: true,
      get() { return proto.get!.call(this); },
      set(v: string) {
        proto.set!.call(this, v);
        items().forEach(li => li.setAttribute('aria-selected', String(li.dataset['value'] === v)));
        paintTrigger();
      },
    });
  }
  select.addEventListener('change', () => { rebuild(); });
  new MutationObserver(rebuild).observe(select, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });
  rebuild();
}
