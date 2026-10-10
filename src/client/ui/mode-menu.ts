/**
 * mode-menu.ts — on a phone, the row of mode tabs becomes one button and a sheet.
 *
 * Ten tabs in a sideways-scrolling row showed about four at a time; the rest sat off-screen. Below 600px
 * the row is replaced by a single button naming the current mode that opens a grouped list of every mode
 * that is switched on. The tabs themselves stay in the page, hidden, as the real state — choosing an
 * entry clicks the matching tab, so `updateModeUI`, saved state, shortcuts and everything listening for
 * tab clicks run exactly as before (the same pattern as ui/toggle-proxy.ts and ui/choice-menu.ts).
 * Above 600px nothing here is visible and the tab row is unchanged.
 */
import { t } from '../i18n/index.ts';

const GROUPS: { key: string; fallback: string; modes: string[] }[] = [
  { key: 'nav.groupQuizzes', fallback: 'Quizzes', modes: ['table', 'picture', 'trivia', 'guessBlank', 'sentenceScramble', 'conjugation'] },
  { key: 'nav.groupLibrary', fallback: 'Library', modes: ['mylists', 'myContent', 'history'] },
  { key: 'nav.groupApp',     fallback: 'App',     modes: ['settings', 'chat'] },
];

const labelOf = (tab: HTMLElement): string => (tab.textContent ?? '').replace(/\s+/g, ' ').trim();

export function initModeMenu(): void {
  const bar = document.querySelector<HTMLElement>('.mode-tabs');
  const tablist = bar?.querySelector<HTMLElement>('.mode-tablist');
  if (!bar || !tablist || bar.querySelector('.mode-menu')) return;

  const root = document.createElement('div');
  root.className = 'mode-menu';
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.id = 'modeMenuBtn';
  trigger.className = 'mode-menu-trigger';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  const sheet = document.createElement('ul');
  sheet.className = 'mode-menu-sheet';
  sheet.id = 'modeMenuList';
  sheet.setAttribute('role', 'listbox');
  sheet.setAttribute('aria-label', t('nav.menuLabel', 'Change mode'));
  sheet.tabIndex = -1;
  sheet.hidden = true;
  trigger.setAttribute('aria-controls', sheet.id);
  root.append(trigger, sheet);
  bar.append(root);
  bar.classList.add('mode-tabs--menu');

  const tabs = (): HTMLElement[] => [...tablist.querySelectorAll<HTMLElement>('.mode-tab')];
  const adminLink = (): HTMLAnchorElement | null => bar.querySelector<HTMLAnchorElement>('a.admin-tab');
  const available = (tab: HTMLElement): boolean => !tab.hidden && getComputedStyle(tab).display !== 'none';
  const current = (): HTMLElement | undefined => tabs().find(x => x.classList.contains('active'));

  function paintTrigger(): void {
    const cur = current();
    const name = document.createElement('span');
    name.className = 'mode-menu-name';
    name.textContent = cur ? labelOf(cur) : t('nav.menuLabel', 'Change mode');
    const chevron = Object.assign(document.createElement('span'), { className: 'mode-menu-chevron', textContent: '▾' });
    chevron.setAttribute('aria-hidden', 'true');
    trigger.replaceChildren(name, chevron);
    trigger.setAttribute('aria-label', `${t('nav.menuLabel', 'Change mode')}: ${cur ? labelOf(cur) : ''}`);
  }

  let focusIdx = 0;
  const options = (): HTMLLIElement[] => [...sheet.querySelectorAll<HTMLLIElement>('li[role="option"]')];

  function build(): void {
    const byMode = new Map(tabs().map(x => [x.dataset['mode'] ?? '', x]));
    const admin = adminLink();
    const rows: HTMLLIElement[] = [];
    for (const g of GROUPS) {
      const items = g.modes.map(m => byMode.get(m)).filter((x): x is HTMLElement => !!x && available(x));
      const showAdmin = g.key === 'nav.groupApp' && !!admin && !admin.hidden;
      if (!items.length && !showAdmin) continue;
      const head = document.createElement('li');
      head.className = 'mode-menu-group';
      head.setAttribute('role', 'presentation');
      head.textContent = t(g.key, g.fallback);
      rows.push(head);
      for (const tab of items) {
        const li = document.createElement('li');
        li.className = 'mode-menu-item';
        li.setAttribute('role', 'option');
        li.setAttribute('aria-selected', String(tab.classList.contains('active')));
        li.dataset['mode'] = tab.dataset['mode'] ?? '';
        li.textContent = labelOf(tab);
        if ((tab as HTMLButtonElement).disabled) {
          li.setAttribute('aria-disabled', 'true');
          li.title = tab.title;
        }
        rows.push(li);
      }
      if (showAdmin && admin) {
        const li = document.createElement('li');
        li.className = 'mode-menu-item';
        li.setAttribute('role', 'option');
        li.setAttribute('aria-selected', 'false');
        li.dataset['href'] = admin.getAttribute('href') ?? '/admin';
        li.textContent = labelOf(admin);
        rows.push(li);
      }
    }
    sheet.replaceChildren(...rows);
  }

  function highlight(i: number): void {
    const o = options();
    if (!o.length) return;
    focusIdx = Math.max(0, Math.min(o.length - 1, i));
    o.forEach((li, n) => li.classList.toggle('mode-menu-active', n === focusIdx));
    o[focusIdx].scrollIntoView({ block: 'nearest' });
  }

  function place(): void {
    const r = trigger.getBoundingClientRect();
    sheet.style.top = `${Math.round(r.bottom + 4)}px`;
    sheet.style.maxHeight = `${Math.max(160, window.innerHeight - r.bottom - 16)}px`;
  }

  function open(): void {
    build();
    sheet.hidden = false;
    place();
    trigger.setAttribute('aria-expanded', 'true');
    highlight(options().findIndex(li => li.getAttribute('aria-selected') === 'true'));
    sheet.focus({ preventScroll: true });
  }

  function close(refocus = true): void {
    if (sheet.hidden) return;
    sheet.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    if (refocus) trigger.focus({ preventScroll: true });
  }

  function choose(li: HTMLLIElement | null | undefined): void {
    if (!li || li.getAttribute('aria-disabled') === 'true') return;
    const href = li.dataset['href'];
    const mode = li.dataset['mode'];
    close();
    if (href) { window.location.href = href; return; }
    tabs().find(x => x.dataset['mode'] === mode)?.click();
  }

  trigger.addEventListener('click', () => { if (sheet.hidden) open(); else close(); });
  sheet.addEventListener('click', e => {
    choose((e.target as Element).closest<HTMLLIElement>('li[role="option"]'));
  });
  sheet.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); highlight(focusIdx + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); highlight(focusIdx - 1); }
    else if (e.key === 'Home') { e.preventDefault(); highlight(0); }
    else if (e.key === 'End') { e.preventDefault(); highlight(options().length - 1); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(options()[focusIdx]); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'Tab') close(false);
  });
  document.addEventListener('pointerdown', e => { if (!root.contains(e.target as Node)) close(false); });
  window.addEventListener('resize', () => close(false));

  // Whatever changes a tab from elsewhere — a mode switched on, a label translated, a keyboard shortcut — repaints the button.
  new MutationObserver(paintTrigger).observe(tablist, {
    subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class', 'hidden', 'disabled'],
  });
  paintTrigger();
}
