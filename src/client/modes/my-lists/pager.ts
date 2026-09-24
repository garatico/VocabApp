/**
 * pager.ts — the Prev / "Page N of M" / Next row the word lists share.
 *
 * Page math is table-controls.ts's own pageCountFor/pageSlice (also what
 * browse-panel.ts uses), so every paged view in the app agrees on it. The
 * row hides itself when everything fits on one page.
 */

import { pageCountFor, pageSlice } from '../table-controls.ts';

export const LIST_PAGE_SIZE = 100;

export interface Pager {
  /** The row, ready to append (above the list it controls). */
  el: HTMLElement;
  /** The current page of `items`; also syncs the row to `items.length`. */
  slice<T>(items: T[]): T[];
  /** Back to page 1 — call when the filter/sort/rule changed what is listed. */
  reset(): void;
}

/** @param onChange redraw the list; called after Prev/Next/jump moved the page. */
export function createPager(onChange: () => void, pageSize = LIST_PAGE_SIZE): Pager {
  let index = 0;
  let total = 0;

  const el = document.createElement('div');
  el.className = 'ml-browse-pager';
  el.hidden = true;

  const prev = document.createElement('button');
  prev.type = 'button'; prev.className = 'ml-icon-btn ml-text-btn';
  prev.textContent = '← Prev';
  prev.addEventListener('click', () => { index--; onChange(); });

  const sel = document.createElement('select');
  sel.className = 'ml-sort-select ml-browse-page-select';
  sel.title = 'Jump to page';
  sel.addEventListener('change', () => { index = Number(sel.value); onChange(); });

  const next = document.createElement('button');
  next.type = 'button'; next.className = 'ml-icon-btn ml-text-btn';
  next.textContent = 'Next →';
  next.addEventListener('click', () => { index++; onChange(); });

  el.append(prev, sel, next);

  function sync(pages: number): void {
    el.hidden = pages <= 1;
    prev.disabled = index === 0;
    next.disabled = index >= pages - 1;
    if (sel.options.length !== pages || sel.dataset.total !== String(total)) {
      sel.innerHTML = '';
      for (let i = 0; i < pages; i++) {
        const opt = document.createElement('option');
        opt.value = String(i);
        opt.textContent = `Page ${i + 1} of ${pages}  (${i * pageSize + 1}–${Math.min((i + 1) * pageSize, total)})`;
        sel.appendChild(opt);
      }
      sel.dataset.total = String(total);
    }
    sel.value = String(index);
  }

  return {
    el,
    slice<T>(items: T[]): T[] {
      total = items.length;
      const pages = pageCountFor(total, pageSize);
      index = Math.min(Math.max(0, index), pages - 1);
      sync(pages);
      return pageSlice(items, pageSize, index);
    },
    reset(): void { index = 0; },
  };
}
