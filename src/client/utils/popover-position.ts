/**
 * popover-position.ts — put a popover next to its anchor and keep it on screen.
 *
 * Both popovers in the app used to position themselves against a width written
 * into the JS as a number: the list picker clamped against 200, the move
 * popover against 160. Neither matched the CSS any more — the picker is
 * max-width 260px and the move popover 200px — so on a narrow screen a popover
 * anchored near the right edge hung off it by the difference. The width was
 * written in two places and the two drifted, which is the kind of bug that
 * cannot be fixed once.
 *
 * So nothing here is hardcoded. The element is measured after it is in the DOM,
 * which is where it already was in both callers, and clamped against the real
 * viewport. Change the CSS and this follows.
 *
 * Placement is: below the anchor if it fits, above if it does not, and if it
 * fits in neither — a short viewport with the anchor mid-screen — below, with
 * the top pinned into view rather than scrolled off it.
 *
 * Horizontally, the same "prefer the side with room" reasoning applies but
 * used not to: only the vertical placement auto-flipped above/below, while
 * horizontal only right-aligned when a caller explicitly opted in via
 * `alignRight` — none did. So an anchor sitting in the right portion of the
 * screen (e.g. a table's right-hand column) always opened left-aligned first
 * and only got pulled back on-screen by the clamp below, landing flush
 * against the edge rather than tucked neatly to the anchor's left. Now the
 * left-aligned placement is tried first and only abandoned for right-aligned
 * when it wouldn't fit — same shape as the vertical logic, and callers can
 * still force one side via `alignRight`.
 */

/** Distance kept between the popover and both the anchor and the screen edge. */
const GAP = 4;

export interface PopoverPlacement {
  /** Force the popover's right edge to align with the anchor's, or its left
   *  edge, rather than letting the horizontal placement auto-flip based on
   *  available room (see this file's own header comment). Leave unset for
   *  the common case. */
  alignRight?: boolean;
}

export function positionPopover(
  popover: HTMLElement,
  anchor: HTMLElement,
  { alignRight }: PopoverPlacement = {},
): void {
  // Measured, not assumed. The caller has appended it already.
  const box     = popover.getBoundingClientRect();
  const rect    = anchor.getBoundingClientRect();
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  const vw      = document.documentElement.clientWidth;
  const vh      = document.documentElement.clientHeight;

  // ── Horizontal ──
  // Same "prefer the side with room" reasoning as the vertical placement
  // below: try left-aligned (the anchor's own left edge) first, and only
  // fall back to right-aligned when that wouldn't fit — unless a caller
  // forces one side explicitly via `alignRight`.
  const fitsLeftAligned = rect.left + box.width + GAP <= vw;
  const useRightAlign = alignRight ?? !fitsLeftAligned;
  let left = useRightAlign ? rect.right - box.width : rect.left;
  // Right edge first, then left: on a viewport narrower than the popover the
  // left clamp has to win, or it is pushed off the near side instead of the far
  // one and the first thing you would read is missing.
  left = Math.min(left, vw - box.width - GAP);
  left = Math.max(GAP, left);

  // ── Vertical ──
  const roomBelow = vh - rect.bottom;
  const roomAbove = rect.top;
  let top: number;
  if (roomBelow >= box.height + GAP || roomBelow >= roomAbove) {
    top = rect.bottom + GAP;
  } else {
    top = rect.top - box.height - GAP;
  }
  // Never above the fold. A popover with a negative top is unreachable —
  // the page cannot be scrolled up to it.
  top = Math.max(GAP, Math.min(top, vh - box.height - GAP));
  top = Math.max(GAP, top);

  popover.style.position  = 'absolute';
  popover.style.left      = (left + scrollX) + 'px';
  popover.style.top       = (top  + scrollY) + 'px';
  // Cleared explicitly: the list picker used to flip itself upward with a
  // transform, and a stale one would move the position just computed.
  popover.style.transform = '';
}
