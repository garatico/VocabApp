/**
 * keyboard-aware.ts — keeps the field being typed in above the on-screen keyboard.
 *
 * On a phone the keyboard takes about half the screen, and the browser doesn't
 * always scroll a field in the middle of a long page (a Table row, a Guess the
 * Blank box under its sentence) back into the part still showing. When a text
 * field takes focus on a touch device we wait for the visual viewport to settle,
 * and if the field ended up under the keyboard, centre it.
 *
 * No-op without `visualViewport` or on a mouse device.
 */
export function initKeyboardAwareness(): void {
  const vv = window.visualViewport;
  if (!vv || !window.matchMedia('(pointer: coarse)').matches) return;

  document.addEventListener('focusin', (e) => {
    const t = e.target;
    if (!(t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement)) return;
    if (t instanceof HTMLInputElement && !['text', 'search', 'number', 'email', 'url', 'tel'].includes(t.type)) return;

    const check = (): void => {
      if (document.activeElement !== t) return;
      const r = t.getBoundingClientRect();
      const hidden = r.bottom > vv.height - 8 || r.top < 0;
      if (hidden) t.scrollIntoView({ block: 'center', behavior: 'smooth' });
    };

    // The keyboard animates in: look once it has resized the viewport, and again
    // after a fallback delay for browsers (Android with resizes-content) that never fire.
    let done = false;
    const run = (): void => { if (done) return; done = true; vv.removeEventListener('resize', onResize); check(); };
    const onResize = (): void => { window.setTimeout(run, 60); };
    vv.addEventListener('resize', onResize);
    window.setTimeout(run, 400);
  });
}
