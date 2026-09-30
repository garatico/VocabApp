/**
 * fit-to-screen.ts — size a pane to what is left of the window below everything above it, so the whole
 * app fits on one screen with no page scroll (the panes inside scroll on their own). Shared by My Lists
 * and My Content.
 *
 * Re-run whenever the window changes size or something above the pane grows or shrinks (the welcome card
 * being dismissed). Phones keep the stacked, page-scrolling layout. Registering the same container again
 * (a tab redrawn) replaces its earlier registration instead of stacking listeners.
 */

const GUTTER = 44;       // the area's own border and margin, and a small gap below it
const MIN_HEIGHT = 360;

const registrations = new WeakMap<HTMLElement, () => void>();

export function fitToScreen(container: HTMLElement): void {
  registrations.get(container)?.();

  const apply = (): void => {
    if (!container.isConnected || container.offsetParent === null) return; // another tab is showing
    if (window.matchMedia('(max-width: 767px)').matches) {
      container.style.height = container.style.minHeight = container.style.maxHeight = '';
      return;
    }
    const top = container.getBoundingClientRect().top + window.scrollY;
    container.style.minHeight = '0';
    container.style.maxHeight = 'none';
    container.style.height = `${Math.max(MIN_HEIGHT, Math.floor(window.innerHeight - top - GUTTER))}px`;
  };

  const observer = new ResizeObserver(apply);
  observer.observe(document.body);
  window.addEventListener('resize', apply);
  registrations.set(container, () => { observer.disconnect(); window.removeEventListener('resize', apply); });
  apply();
}
