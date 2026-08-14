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
    group: 'Single Word Quiz',
    items: [
      { keys: ['Enter'],        desc: 'Submit answer' },
      { keys: ['←', '→'],      desc: 'Previous / next word' },
    ],
  },
  {
    group: 'General',
    items: [
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
  }
  return el;
}

function openOverlay(): void {
  getOverlay().classList.add('open');
}

function closeOverlay(): void {
  document.getElementById('shortcutsOverlay')?.classList.remove('open');
}

export function initShortcuts(): void {
  // Trigger button in controls bar
  document.getElementById('shortcutsBtn')?.addEventListener('click', openOverlay);

  // Keyboard: Shift+? (= '?' char) when not focused on an input/textarea
  document.addEventListener('keydown', e => {
    if (e.key === '?' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
      e.preventDefault();
      openOverlay();
    }
    if (e.key === 'Escape') {
      closeOverlay();
    }
  });
}
