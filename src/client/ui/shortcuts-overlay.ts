/**
 * shortcuts-overlay.ts — keyboard shortcut reference panel.
 *
 * Opens via the ? button in the controls bar or the Shift+? keyboard shortcut.
 * Closes on Escape, backdrop click, or the ✕ button.
 */

interface ShortcutItem {
  keys: string[];
  desc: string;
}

interface ShortcutGroup {
  group: string;
  items: ShortcutItem[];
}

const SHORTCUTS: ShortcutGroup[] = [
  {
    group: 'Table Quiz',
    items: [
      { keys: ['Tab'],           desc: 'Next input' },
      { keys: ['Shift', 'Tab'], desc: 'Previous input' },
      { keys: ['Esc'],          desc: 'Skip to next unanswered' },
      { keys: ['Ctrl', '/'],    desc: 'Jump to first unanswered' },
      { keys: ['?'],            desc: 'Hint (first letter or full reveal)' },
    ],
  },
  {
    group: 'Conjugation',
    items: [
      { keys: ['Tab'],            desc: 'Next form within a verb' },
      { keys: ['Shift', 'Tab'],  desc: 'Previous form within a verb' },
      { keys: ['Ctrl', '↓'],     desc: 'Next verb' },
      { keys: ['Ctrl', '↑'],     desc: 'Previous verb' },
    ],
  },
  {
    group: 'Multiple choice (Picture click, Trivia choice)',
    items: [
      { keys: ['1', '–', '9'],  desc: 'Pick that option (numbered on screen)' },
    ],
  },
  {
    group: 'Go to (press g, then…)',
    items: [
      { keys: ['g', 't'], desc: 'Table' },
      { keys: ['g', 'p'], desc: 'Picture Quiz' },
      { keys: ['g', 'v'], desc: 'Trivia' },
      { keys: ['g', 'b'], desc: 'Guess the Blank' },
      { keys: ['g', 's'], desc: 'Sentence Scramble' },
      { keys: ['g', 'c'], desc: 'Conjugation' },
      { keys: ['g', 'l'], desc: 'My Lists' },
      { keys: ['g', 'm'], desc: 'My Content' },
      { keys: ['g', 'h'], desc: 'History' },
      { keys: ['g', ','], desc: 'Settings' },
    ],
  },
  {
    group: 'General',
    items: [
      { keys: ['r'],            desc: 'Review the words that are due' },
      { keys: ['←', '→'],       desc: 'Move between tabs (when the tab bar is focused)' },
      { keys: ['?'],            desc: 'Open this shortcuts reference' },
    ],
  },
];

// ── DOM building ──────────────────────────────────────────────────────────────

function buildKeysHtml(keys: string[]): string {
  return keys
    .map((k, i) => {
      const kbdHtml = `<kbd>${k}</kbd>`;
      return i < keys.length - 1 ? kbdHtml + `<span class="shortcuts-plus">+</span>` : kbdHtml;
    })
    .join('');
}

function buildOverlayHtml(): string {
  const groups = SHORTCUTS.map(g => {
    const rows = g.items
      .map(item => `
        <div class="shortcuts-row">
          <span class="shortcuts-desc">${item.desc}</span>
          <span class="shortcuts-keys">${buildKeysHtml(item.keys)}</span>
        </div>`)
      .join('');
    return `
      <div class="shortcuts-group">
        <div class="shortcuts-group-title">${g.group}</div>
        ${rows}
      </div>`;
  }).join('');

  return `
    <div class="shortcuts-panel" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
      <div class="shortcuts-header">
        <span class="shortcuts-title">Keyboard shortcuts</span>
        <button type="button" class="shortcuts-close" id="shortcutsClose" aria-label="Close">✕</button>
      </div>
      ${groups}
    </div>`;
}

// ── Public API ────────────────────────────────────────────────────────────────

function getOverlay(): HTMLElement {
  let el = document.getElementById('shortcutsOverlay');
  if (!el) {
    el = document.createElement('div');
    el.id        = 'shortcutsOverlay';
    el.innerHTML = buildOverlayHtml();
    document.body.appendChild(el);

    // Close on backdrop click (not panel click)
    el.addEventListener('click', e => {
      if (e.target === el) closeOverlay();
    });
    el.querySelector('#shortcutsClose')?.addEventListener('click', closeOverlay);
    // The close button is the dialog's only control, so it is the whole focus
    // trap: Tab has nowhere else to go, and must not escape to the page behind.
    el.addEventListener('keydown', e => {
      if (e.key === 'Tab') { e.preventDefault(); el?.querySelector<HTMLElement>('#shortcutsClose')?.focus(); }
    });
  }
  return el;
}

/** Where focus was before the dialog opened, so closing can put it back. */
let returnFocus: HTMLElement | null = null;

function openOverlay(): void {
  const el = getOverlay();
  if (el.classList.contains('open')) return;
  returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  el.classList.add('open');
  // aria-modal promises the page behind is inert, so focus has to move in.
  el.querySelector<HTMLElement>('#shortcutsClose')?.focus();
}

function closeOverlay(): void {
  const el = document.getElementById('shortcutsOverlay');
  if (!el?.classList.contains('open')) return;
  el.classList.remove('open');
  returnFocus?.focus();
  returnFocus = null;
}

export function initShortcuts(): void {
  // Trigger button in controls bar
  document.getElementById('shortcutsBtn')?.addEventListener('click', openOverlay);

  // Keyboard: Shift+? (= '?' char) when not focused on an input/textarea
  document.addEventListener('keydown', e => {
    if (e.key === '?' && !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) {
      e.preventDefault();
      openOverlay();
    }
    if (e.key === 'Escape') {
      closeOverlay();
    }
  });
}
