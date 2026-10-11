/**
 * command-palette.ts — Ctrl/Cmd+K: type to jump to a mode, a setting, a language or an action.
 *
 * Nothing is registered by hand. The palette reads what is already on the page when it opens: the mode
 * tabs that are switched on, every row in Settings (so a new setting is findable the day it is added),
 * the language dropdown, and a few actions that click the app's own controls — so each runs exactly the
 * handler a click would, with its saved state, and what is hidden (Simple Mode, a language with no
 * conjugation) is simply not offered.
 *
 * Loaded on first use (ui/command-palette-launcher.ts), so the quiz screen does not carry it.
 */
import '../styles-lazy/command-palette.css';
import { openSetting } from '../settings-search.ts';
import { t } from '../i18n/index.ts';

export interface PaletteItem {
  id: string;
  label: string;
  /** Where it lives / what kind of thing it is, shown at the right. */
  hint: string;
  /** Extra words that should find it. */
  keywords?: string;
  run: () => void;
}

// ── Ranking ──────────────────────────────────────────────────────────────────

/** Higher is better; 0 means "does not match". Every word of the query must be found. */
export function scoreItem(query: string, label: string, keywords = '', hint = ''): number {
  const q = query.trim().toLowerCase();
  if (!q) return 1;
  const l = label.toLowerCase();
  const extra = `${keywords} ${hint}`.toLowerCase();
  let total = 0;
  for (const word of q.split(/\s+/)) {
    let s = 0;
    if (l === word) s = 100;
    else if (l.startsWith(word)) s = 80;
    else if (new RegExp(`(^|[\\s—:/-])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(l)) s = 60;
    else if (l.includes(word)) s = 40;
    else if (extra.includes(word)) s = 20;
    else if (isSubsequence(word, l)) s = 8;
    if (s === 0) return 0;
    total += s;
  }
  return total;
}

function isSubsequence(needle: string, hay: string): boolean {
  let i = 0;
  for (const ch of hay) if (ch === needle[i] && ++i === needle.length) return true;
  return needle.length === 0;
}

export function rank(items: PaletteItem[], query: string, limit = 40): PaletteItem[] {
  return items
    .map((item, i) => ({ item, i, s: scoreItem(query, item.label, item.keywords, item.hint) }))
    .filter(r => r.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, limit)
    .map(r => r.item);
}

// ── What can be offered ──────────────────────────────────────────────────────

const clean = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();

function modeItems(): PaletteItem[] {
  const goTo = t('palette.goTo', 'Go to');
  return [...document.querySelectorAll<HTMLElement>('.mode-tablist .mode-tab')]
    .filter(tab => !tab.hidden && getComputedStyle(tab).display !== 'none' && !(tab as HTMLButtonElement).disabled)
    .map(tab => ({
      id: `mode:${tab.dataset['mode']}`,
      label: clean(tab.textContent),
      hint: goTo,
      keywords: `go open switch tab ${tab.dataset['mode'] ?? ''}`,
      run: () => tab.click(),
    }));
}

function languageItems(): PaletteItem[] {
  const select = document.getElementById('langSelect') as HTMLSelectElement | null;
  if (!select) return [];
  return [...select.options]
    .filter(o => !o.disabled)
    .map(o => ({
      id: `lang:${o.value}`,
      label: clean(o.textContent),
      hint: t('palette.language', 'Language'),
      keywords: 'language switch change study',
      run: () => { select.value = o.value; select.dispatchEvent(new Event('change', { bubbles: true })); },
    }));
}

function settingItems(): PaletteItem[] {
  const out: PaletteItem[] = [];
  const area = document.getElementById('settingsArea');
  if (!area) return out;
  const section = t('palette.setting', 'Setting');
  area.querySelectorAll<HTMLElement>('.settings-row').forEach(row => {
    const label = clean(row.querySelector('.settings-label > span:first-child')?.textContent);
    if (!label) return;
    // The control's id is what `openSetting` (and a `#setting=` link) takes.
    const control = row.querySelector<HTMLElement>('[id^="setting"]') ?? (row.id ? row : null);
    if (!control?.id) return;
    const sectionName = clean(row.closest('.settings-section')?.querySelector('.settings-section-title')?.textContent);
    out.push({
      id: `setting:${control.id}`,
      label,
      hint: sectionName || section,
      keywords: clean(row.querySelector('.settings-desc')?.textContent),
      run: () => openSetting(control.id),
    });
  });
  return out;
}

function actionItems(): PaletteItem[] {
  const out: PaletteItem[] = [];
  const action = t('palette.action', 'Action');
  const click = (sel: string) => (): void => { document.querySelector<HTMLElement>(sel)?.click(); };

  const start = document.getElementById('startBtn');
  if (start && start.offsetParent !== null) {
    out.push({ id: 'act:start', label: t('palette.start', 'Start quiz'), hint: action, keywords: 'begin go play', run: click('#startBtn') });
  }
  const due = document.getElementById('dueBadge');
  if (due && !due.hidden) {
    out.push({ id: 'act:due', label: t('palette.due', 'Review words that are due'), hint: action, keywords: 'srs spaced repetition review', run: click('#dueBadge') });
  }
  out.push(
    { id: 'act:dark', label: t('palette.dark', 'Dark mode'), hint: t('palette.theme', 'Theme'), keywords: 'theme night appearance', run: click('#settingTheme [data-theme="dark"]') },
    { id: 'act:light', label: t('palette.light', 'Light mode'), hint: t('palette.theme', 'Theme'), keywords: 'theme day appearance', run: click('#settingTheme [data-theme="light"]') },
    { id: 'act:shortcuts', label: t('palette.shortcuts', 'Keyboard shortcuts'), hint: action, keywords: 'keys help hotkeys', run: click('#shortcutsBtn') },
  );
  return out;
}

export function buildItems(): PaletteItem[] {
  return [...modeItems(), ...actionItems(), ...languageItems(), ...settingItems()];
}

// ── The dialog ───────────────────────────────────────────────────────────────

let overlay: HTMLElement | null = null;
let returnFocus: HTMLElement | null = null;

export function isPaletteOpen(): boolean { return overlay !== null && overlay.isConnected; }

export function closePalette(): void {
  if (!overlay) return;
  overlay.remove();
  overlay = null;
  returnFocus?.focus?.({ preventScroll: true });
  returnFocus = null;
}

export function openPalette(): void {
  if (overlay?.isConnected) { overlay.querySelector<HTMLInputElement>('input')?.focus(); return; }
  overlay = null;   // gone from the page some other way: start clean
  returnFocus = document.activeElement as HTMLElement | null;
  const items = buildItems();

  overlay = document.createElement('div');
  overlay.className = 'cmdk-overlay';
  const panel = document.createElement('div');
  panel.className = 'cmdk-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', t('palette.title', 'Command palette'));

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'cmdk-input';
  input.placeholder = t('palette.placeholder', 'Go to a mode, a setting, a language…');
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-expanded', 'true');
  input.setAttribute('aria-controls', 'cmdkList');
  input.setAttribute('aria-autocomplete', 'list');
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.setAttribute('autocapitalize', 'off');
  input.setAttribute('autocorrect', 'off');

  const list = document.createElement('ul');
  list.className = 'cmdk-list';
  list.id = 'cmdkList';
  list.setAttribute('role', 'listbox');

  const status = document.createElement('div');
  status.className = 'sr-only';
  status.setAttribute('role', 'status');

  panel.append(input, list, status);
  overlay.append(panel);
  document.body.append(overlay);

  let shown: PaletteItem[] = [];
  let active = 0;

  const setActive = (i: number): void => {
    if (!shown.length) { input.removeAttribute('aria-activedescendant'); return; }
    active = (i + shown.length) % shown.length;
    [...list.children].forEach((li, n) => li.classList.toggle('cmdk-active', n === active));
    const li = list.children[active] as HTMLElement;
    input.setAttribute('aria-activedescendant', li.id);
    li.scrollIntoView?.({ block: 'nearest' });
  };

  const render = (): void => {
    shown = rank(items, input.value);
    list.replaceChildren(...shown.map((item, n) => {
      const li = document.createElement('li');
      li.id = `cmdkItem${n}`;
      li.className = 'cmdk-item';
      li.setAttribute('role', 'option');
      const name = document.createElement('span');
      name.className = 'cmdk-label';
      name.textContent = item.label;
      const hint = document.createElement('span');
      hint.className = 'cmdk-hint';
      hint.textContent = item.hint;
      li.append(name, hint);
      li.addEventListener('mousemove', () => { if (active !== n) setActive(n); });
      li.addEventListener('click', () => run(n));
      return li;
    }));
    if (!shown.length) {
      const none = document.createElement('li');
      none.className = 'cmdk-empty';
      none.setAttribute('role', 'presentation');
      none.textContent = t('palette.none', 'Nothing matches');
      list.append(none);
    }
    status.textContent = shown.length ? `${shown.length}` : t('palette.none', 'Nothing matches');
    setActive(0);
  };

  const run = (n: number): void => {
    const item = shown[n];
    if (!item) return;
    closePalette();
    // After the dialog is gone, so a focus-moving action (a setting, a tab) is not undone by it returning focus.
    returnFocus = null;
    window.setTimeout(item.run, 0);
  };

  input.addEventListener('input', render);
  panel.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
    else if (e.key === 'End') { e.preventDefault(); setActive(shown.length - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); run(active); }
    else if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
    else if (e.key === 'Tab') { e.preventDefault(); input.focus(); }   // the input is the only stop: a trap
  });
  overlay.addEventListener('mousedown', e => { if (e.target === overlay) closePalette(); });

  render();
  input.focus();
}
