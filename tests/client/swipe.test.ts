// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { attachSwipe, findPager } from '../../src/client/ui/swipe.ts';

/** jsdom has no PointerEvent constructor on every version, so build one from a plain Event. */
function pointer(type: string, x: number, y: number, extra: Record<string, unknown> = {}): Event {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(e, { clientX: x, clientY: y, pointerId: 1, pointerType: 'touch', isPrimary: true, ...extra });
  return e;
}

function drag(el: Element, from: [number, number], to: [number, number], extra: Record<string, unknown> = {}): void {
  el.dispatchEvent(pointer('pointerdown', from[0], from[1], extra));
  el.dispatchEvent(pointer('pointermove', (from[0] + to[0]) / 2, (from[1] + to[1]) / 2, extra));
  el.dispatchEvent(pointer('pointermove', to[0], to[1], extra));
  el.dispatchEvent(pointer('pointerup', to[0], to[1], extra));
}

describe('attachSwipe', () => {
  let el: HTMLElement;
  let left: ReturnType<typeof vi.fn>;
  let right: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    document.body.innerHTML = '<div id="row"><span id="word">gato</span><input id="field"></div>';
    el = document.getElementById('row') as HTMLElement;
    left = vi.fn();
    right = vi.fn();
    attachSwipe(el, { onLeft: left, onRight: right });
  });

  it('calls onLeft for a long drag to the left and onRight for one to the right', () => {
    drag(el, [200, 100], [80, 104]);
    expect(left).toHaveBeenCalledTimes(1);
    drag(el, [50, 100], [180, 98]);
    expect(right).toHaveBeenCalledTimes(1);
  });

  it('ignores a drag shorter than the threshold', () => {
    drag(el, [200, 100], [170, 100]);
    expect(left).not.toHaveBeenCalled();
  });

  it('ignores a mostly vertical drag (a scroll)', () => {
    drag(el, [200, 100], [140, 260]);
    expect(left).not.toHaveBeenCalled();
    expect(right).not.toHaveBeenCalled();
  });

  it('ignores a mouse', () => {
    drag(el, [200, 100], [60, 100], { pointerType: 'mouse' });
    expect(left).not.toHaveBeenCalled();
  });

  it('ignores a drag that starts in a field', () => {
    const field = document.getElementById('field') as HTMLElement;
    drag(field, [200, 100], [60, 100]);
    expect(left).not.toHaveBeenCalled();
  });

  it('lets pinch-zoom through while taking horizontal drags', () => {
    expect(el.style.touchAction).toBe('pan-y pinch-zoom');
  });

  it('swallows the click that follows a swipe, once', () => {
    const onClick = vi.fn();
    document.getElementById('word')!.addEventListener('click', onClick);
    drag(el, [200, 100], [60, 100]);
    document.getElementById('word')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(onClick).not.toHaveBeenCalled();
    document.getElementById('word')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('findPager', () => {
  it('returns the visible pager\'s first and last buttons, and null with no pager', () => {
    document.body.innerHTML = '<div id="a"></div>';
    expect(findPager(document.getElementById('a') as HTMLElement)).toBeNull();

    document.body.innerHTML = '<div id="a"><div><button class="pager-btn" id="p">←</button><select></select><button class="pager-btn" id="n">→</button></div></div>';
    // jsdom has no layout, so every element reports no client rects; stub it the way a browser would.
    document.querySelectorAll('.pager-btn').forEach(b => { (b as HTMLElement).getClientRects = () => [{}] as unknown as DOMRectList; });
    const pager = findPager(document.getElementById('a') as HTMLElement)!;
    expect(pager.prev?.id).toBe('p');
    expect(pager.next?.id).toBe('n');
  });
});
