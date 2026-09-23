/**
 * admin-emoji-picker.ts
 *
 * A browsable emoji grid for the Word Editor's "Emoji fallback" field —
 * search box + category tabs + a grid of emoji buttons, the same shape as
 * an emoji picker in a chat app (Discord, Slack), rather than requiring the
 * admin to already know or copy-paste the character they want.
 */
import { EMOJI_CATEGORIES, ALL_EMOJIS, type EmojiEntry } from './admin-emoji-data.js';
import { escapeHtml } from './admin-api.js';

function matchesSearch(entry: EmojiEntry, needle: string): boolean {
  return entry.keywords.some(k => k.includes(needle)) || entry.char === needle;
}

/** Wires a trigger button + an (initially empty) panel <div> into a working
 *  picker. `inputId` is the text field the chosen emoji gets written into —
 *  a plain 'input' event, not a direct value set some other module has to
 *  know to also listen for, so anything already watching that field (dirty-
 *  state tracking, live previews) picks it up the same way typing would. */
export function setupEmojiPicker(fieldId: string, triggerId: string, panelId: string, inputId: string): void {
  const fieldEl = document.getElementById(fieldId);
  const triggerEl = document.getElementById(triggerId);
  const panelEl = document.getElementById(panelId);
  const inputEl = document.getElementById(inputId);
  if (!fieldEl || !triggerEl || !panelEl || !inputEl) return;

  // Cast to non-nullable types once, here — every nested function below
  // (open/close/render*, each defined once and reused across multiple
  // events) then just uses field/trigger/panel/input directly with no
  // narrowing needed, since the type itself is no longer a union with null.
  const field   = fieldEl as HTMLElement;
  const trigger = triggerEl as HTMLButtonElement;
  const panel   = panelEl as HTMLElement;
  const input   = inputEl as HTMLInputElement;

  let activeCategory = 0;
  let searchQuery = '';
  let searchInput: HTMLInputElement | null = null;

  function renderGrid(): void {
    const grid = panel.querySelector<HTMLElement>('.emoji-picker-grid');
    if (!grid) return;
    const query = searchQuery.trim().toLowerCase();
    const entries = query
      ? ALL_EMOJIS.filter(e => matchesSearch(e, query))
      : (EMOJI_CATEGORIES[activeCategory]?.emojis ?? []);

    if (!entries.length) {
      grid.innerHTML = `<div class="emoji-picker-empty">No emoji match "${escapeHtml(searchQuery.trim())}"</div>`;
      return;
    }

    grid.innerHTML = '';
    entries.forEach(entry => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'emoji-picker-cell';
      btn.textContent = entry.char;
      btn.title = entry.keywords[0] ?? entry.char;
      btn.addEventListener('click', () => {
        input.value = entry.char;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        close();
      });
      grid.appendChild(btn);
    });
  }

  function renderTabs(): void {
    const tabs = panel.querySelector<HTMLElement>('.emoji-picker-tabs');
    if (!tabs) return;
    const searching = searchQuery.trim().length > 0;
    tabs.hidden = searching;
    if (searching) return;

    tabs.innerHTML = '';
    EMOJI_CATEGORIES.forEach((cat, i) => {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'emoji-picker-tab' + (i === activeCategory ? ' active' : '');
      tab.textContent = cat.name;
      tab.addEventListener('click', () => {
        activeCategory = i;
        renderTabs();
        renderGrid();
      });
      tabs.appendChild(tab);
    });
  }

  function buildPanel(): void {
    panel.innerHTML = `
      <input type="text" class="emoji-picker-search" placeholder="Search emoji…" aria-label="Search emoji">
      <div class="emoji-picker-tabs"></div>
      <div class="emoji-picker-grid"></div>
    `;
    const search = panel.querySelector<HTMLInputElement>('.emoji-picker-search');
    searchInput = search;
    search?.addEventListener('input', () => {
      searchQuery = search.value;
      renderTabs();
      renderGrid();
    });
    renderTabs();
    renderGrid();
  }

  function open(): void {
    searchQuery = '';
    buildPanel();
    panel.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    searchInput?.focus();
  }
  function close(): void {
    panel.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
  }

  trigger.addEventListener('click', () => { if (panel.hidden) open(); else close(); });
  document.addEventListener('click', e => { if (!field.contains(e.target as Node)) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) close(); });
}
