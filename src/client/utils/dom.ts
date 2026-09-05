/**
 * dom.ts — typed DOM query helpers
 *
 * mustGet<T>(id) is a loud alternative to `document.getElementById(id)!`:
 * it throws immediately with a clear message if the element is missing,
 * rather than crashing silently when the element is first used.
 */

import { foldKey } from './match.ts';

export function mustGet<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Required DOM element #${id} not found. Check that the HTML template includes this element.`);
  return el as T;
}

/**
 * Fill `el` with `text`, wrapping the first case/accent-insensitive
 * occurrence of `query` in a `<mark class="search-match">` — so a search
 * result reads back the substring that actually matched instead of leaving
 * the learner to spot it in a whole word/translation by eye. Falls back to
 * plain text when `query` is blank or doesn't occur in `text` (foldKey
 * normalizing away a match at the character level, e.g. an accent, is the
 * only reason the two searches could disagree), so callers can call this
 * unconditionally rather than branching on whether there's a query at all.
 * Builds real DOM nodes rather than innerHTML — `text` is often a word or
 * gloss straight from the vocabulary data, not something to interpolate
 * into markup.
 */
export function fillHighlighted(el: HTMLElement, text: string, query: string): void {
  el.textContent = '';
  const q = foldKey(query);
  if (!q) { el.appendChild(document.createTextNode(text)); return; }
  const idx = foldKey(text).indexOf(q);
  if (idx === -1) { el.appendChild(document.createTextNode(text)); return; }
  if (idx > 0) el.appendChild(document.createTextNode(text.slice(0, idx)));
  const mark = document.createElement('mark');
  mark.className = 'search-match';
  mark.textContent = text.slice(idx, idx + q.length);
  el.appendChild(mark);
  if (idx + q.length < text.length) el.appendChild(document.createTextNode(text.slice(idx + q.length)));
}

/**
 * Fill `el` with `base`, followed by `disambiguator` (when present and
 * `show`) in parentheses on its own line, inside a `.word-disambiguator`
 * span — the DOM-node counterpart to utils.ts's displayWord(), for callers
 * whose element can style the parenthetical smaller and stack it below the
 * word (an <input>'s value can't hold a styled sub-span or a line break, so
 * revealed-answer inputs still use plain displayWord() text). `el` must lay
 * its children out as a column (table.css's `.spanish-word`) for the two
 * text nodes this produces to actually stack rather than run inline.
 */
export function setWordWithDisambiguator(
  el: HTMLElement, base: string, disambiguator: string | null | undefined, show = true,
): void {
  el.textContent = base;
  if (show && disambiguator) {
    const span = document.createElement('span');
    span.className = 'word-disambiguator';
    span.textContent = `(${disambiguator})`;
    el.appendChild(span);
  }
}

/**
 * Let the mouse wheel scroll a text input horizontally. A revealed answer
 * carrying a disambiguator (e.g. "be / is (permanent)") can run wider than
 * the cell — a disabled <input> ignores focus and arrow keys, so without
 * this its overflow is simply unreachable; `scrollLeft` still works on a
 * disabled input since it's a plain DOM property, not an interaction.
 * Attach once, at input creation — harmless on a value that never overflows.
 *
 * `listenOn` lets the wheel listener sit on a wrapping element instead of
 * `input` itself — needed wherever the input has `pointer-events: none`
 * (table-recall-mode.ts's inert translation cell), which would otherwise
 * swallow the wheel event before it ever reaches `input`.
 */
export function enableInputWheelScroll(input: HTMLInputElement, listenOn: HTMLElement = input): void {
  listenOn.addEventListener('wheel', e => {
    if (input.scrollWidth <= input.clientWidth) return;
    input.scrollLeft += e.deltaY !== 0 ? e.deltaY : e.deltaX;
    e.preventDefault();
  }, { passive: false });
}
