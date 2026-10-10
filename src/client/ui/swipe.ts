/**
 * swipe.ts — horizontal swipe gestures for touch screens.
 *
 * `attachSwipe` turns a left or right swipe on an element into a callback, optionally letting the element
 * follow the finger a little first. It looks only at touch and pen input (a mouse has the buttons), only
 * acts on a clearly horizontal drag (so vertical scrolling is never taken), and ignores a drag that starts
 * in a field or inside something that scrolls sideways on its own. After a swipe it swallows the click the
 * browser would otherwise deliver, so a row that was swiped is not also opened.
 *
 * `initPagerSwipe` uses it to make a swipe on a quiz's word area turn the page: left for next, right for
 * previous, by pressing the pager's own buttons — so the same handlers, limits and saved state apply.
 */

export interface SwipeOptions {
  onLeft?: () => void;
  onRight?: () => void;
  /** Distance, in px, that makes it a swipe. Default 64. */
  threshold?: number;
  /** Move the element with the finger (at most `maxFollow` px) and tint it via `data-swipe`. Default false. */
  follow?: boolean;
  maxFollow?: number;
}

const FIELD = 'input, textarea, select, [contenteditable="true"], [contenteditable=""]';
const INTENT_PX = 10;

/** True when `target` is inside something between it and `root` that scrolls sideways. */
function insideHorizontalScroller(target: Element | null, root: HTMLElement): boolean {
  for (let n: Element | null = target; n && n !== root; n = n.parentElement) {
    if (n.scrollWidth <= n.clientWidth + 1) continue;
    const ox = getComputedStyle(n).overflowX;
    if (ox === 'auto' || ox === 'scroll') return true;
  }
  return false;
}

export function attachSwipe(el: HTMLElement, o: SwipeOptions): () => void {
  const threshold = o.threshold ?? 64;
  const maxFollow = o.maxFollow ?? 72;
  let id: number | null = null;
  let x0 = 0, y0 = 0, dx = 0;
  let horizontal = false;

  const reset = (animate: boolean): void => {
    if (o.follow) {
      el.style.transition = animate ? 'transform 0.18s ease' : '';
      el.style.transform = '';
    }
    el.removeAttribute('data-swipe');
    id = null; dx = 0; horizontal = false;
  };

  const down = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse' || !e.isPrimary || id !== null) return;
    const t = e.target as Element | null;
    if (t?.closest(FIELD) || insideHorizontalScroller(t, el)) return;
    id = e.pointerId; x0 = e.clientX; y0 = e.clientY; dx = 0; horizontal = false;
    el.style.transition = '';
  };

  const move = (e: PointerEvent): void => {
    if (e.pointerId !== id) return;
    dx = e.clientX - x0;
    const dy = e.clientY - y0;
    if (!horizontal) {
      if (Math.abs(dy) > INTENT_PX && Math.abs(dy) > Math.abs(dx)) { reset(false); return; }   // a scroll
      if (Math.abs(dx) < INTENT_PX || Math.abs(dx) < Math.abs(dy) * 1.4) return;
      horizontal = true;
    }
    if (o.follow) {
      const wants = dx < 0 ? o.onLeft : o.onRight;
      const shown = wants ? Math.max(-maxFollow, Math.min(maxFollow, dx * 0.6)) : 0;
      el.style.transform = `translateX(${shown}px)`;
      if (wants) el.dataset['swipe'] = Math.abs(dx) >= threshold ? (dx < 0 ? 'left-ready' : 'right-ready') : (dx < 0 ? 'left' : 'right');
    }
  };

  const up = (e: PointerEvent): void => {
    if (e.pointerId !== id) return;
    const fired = horizontal && Math.abs(dx) >= threshold;
    const dir = dx < 0 ? 'left' : 'right';
    reset(!fired);   // a fired swipe snaps back at once: its action may open a menu positioned from the row
    if (!fired) return;
    // The click that follows a swipe belongs to the swipe, not to whatever was under the finger.
    const swallow = (c: Event): void => { c.stopPropagation(); c.preventDefault(); };
    el.addEventListener('click', swallow, { capture: true, once: true });
    window.setTimeout(() => el.removeEventListener('click', swallow, true), 400);
    (dir === 'left' ? o.onLeft : o.onRight)?.();
  };

  const cancel = (e: PointerEvent): void => { if (e.pointerId === id) reset(true); };

  el.style.touchAction = 'pan-y pinch-zoom';
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', cancel);
  return () => {
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', cancel);
    el.style.touchAction = '';
  };
}

/** The page buttons of whichever pager is showing in `area`: the first pair of visible, enabled `.pager-btn`s. */
export function findPager(area: HTMLElement): { prev: HTMLButtonElement | null; next: HTMLButtonElement | null } | null {
  const buttons = [...area.querySelectorAll<HTMLButtonElement>('.pager-btn')].filter(b => b.offsetParent !== null || b.getClientRects().length > 0);
  if (!buttons.length) return null;
  const group = buttons.filter(b => b.parentElement === buttons[0].parentElement);
  const prev = group[0] ?? null;
  const next = group.length > 1 ? group[group.length - 1] : null;
  return { prev, next };
}

export function initPagerSwipe(): void {
  for (const id of ['tableArea', 'pictureArea', 'conjugationArea']) {
    const area = document.getElementById(id);
    if (!area) continue;
    const turn = (which: 'prev' | 'next'): void => {
      const btn = findPager(area)?.[which];
      if (btn && !btn.disabled) btn.click();
    };
    attachSwipe(area, { onLeft: () => turn('next'), onRight: () => turn('prev') });
  }
}
