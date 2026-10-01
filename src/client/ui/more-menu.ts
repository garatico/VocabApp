/**
 * more-menu.ts — open/close behaviour for a "⋯" popover menu: toggles on its button, closes on an outside
 * click, Escape, or after a button inside it is used (except ones marked `data-keep-open`). Table mode's
 * sticky bar does the same inline; this is for modes that re-render, so the document listeners remove
 * themselves once `root` leaves the page.
 */
export function attachMoreMenu(root: HTMLElement, btn: HTMLElement, menu: HTMLElement): void {
  const setOpen = (open: boolean): void => {
    menu.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
  };
  const onDocClick = (e: MouseEvent): void => {
    if (!root.isConnected) { cleanup(); return; }
    if (!menu.hidden && !root.contains(e.target as Node)) setOpen(false);
  };
  const onKey = (e: KeyboardEvent): void => {
    if (!root.isConnected) { cleanup(); return; }
    if (e.key === 'Escape' && !menu.hidden) { setOpen(false); btn.focus(); }
  };
  function cleanup(): void {
    document.removeEventListener('click', onDocClick);
    document.removeEventListener('keydown', onKey);
  }
  btn.addEventListener('click', e => { e.stopPropagation(); setOpen(menu.hidden); });
  menu.addEventListener('click', e => {
    if ((e.target as Element).closest('button:not([data-keep-open])')) setOpen(false);
  });
  document.addEventListener('click', onDocClick);
  document.addEventListener('keydown', onKey);
  setOpen(false);
}
