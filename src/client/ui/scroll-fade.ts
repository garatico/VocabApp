/**
 * Marks a horizontally scrolling strip with `data-fade-start` / `data-fade-end`
 * while there is more to scroll to on that side, so CSS (`.scroll-fade`, in
 * mode-tabs.css) can fade only the edge that hides something — and nothing when
 * the strip fits or is scrolled to its end.
 */
export function watchScrollFade(el: HTMLElement): void {
  el.classList.add('scroll-fade');
  const update = (): void => {
    const max = el.scrollWidth - el.clientWidth;
    el.toggleAttribute('data-fade-start', el.scrollLeft > 2);
    el.toggleAttribute('data-fade-end', max > 2 && el.scrollLeft < max - 2);
  };
  el.addEventListener('scroll', update, { passive: true });
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(update);
    ro.observe(el);
    for (const child of Array.from(el.children)) ro.observe(child);
  }
  update();
}
