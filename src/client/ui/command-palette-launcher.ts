/**
 * command-palette-launcher.ts — the small, always-loaded half of the command palette.
 *
 * Ctrl/Cmd+K opens it from anywhere, including inside a text box (it is the convention, and a field has no
 * use for Ctrl+K). The palette itself (ui/command-palette.ts) is fetched the first time it is wanted.
 */
export function initCommandPalette(): void {
  document.addEventListener('keydown', e => {
    if (e.key.toLowerCase() !== 'k' || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
    // A confirmation owns the keyboard until it is answered.
    if (document.querySelector('.app-dialog-overlay')) return;
    e.preventDefault();
    void import('./command-palette.ts').then(m => m.openPalette());
  });
}
