/**
 * dom.ts — typed DOM query helpers
 *
 * mustGet<T>(id) is a loud alternative to `document.getElementById(id)!`:
 * it throws immediately with a clear message if the element is missing,
 * rather than crashing silently when the element is first used.
 */

import { foldKey } from './match.ts';

export type GenderIndicatorStyle = 'off' | 'dot' | 'word-bg' | 'box-bg';

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
/**
 * Fill `el` with `base` — wrapped in a colored pill span when `style` is
 * 'word-bg' and `key` is set, plain text otherwise — followed by
 * `annotation` (when present) in parentheses inside a `.word-disambiguator`
 * span. The DOM-node counterpart to utils.ts's `wordAndAnnotation`/
 * `displayWord`, for callers whose element can style the parenthetical
 * smaller and the pill precisely around just the word (an `<input>`'s value
 * can't hold either, so revealed-answer inputs still use plain
 * `displayWord()` text). `el` must lay its children out as a column
 * (table.css's `.spanish-word`) for the word and the annotation to actually
 * stack rather than run inline.
 *
 * 'dot' and 'box-bg' aren't handled here — they decorate the surrounding
 * *container* (which may be a wider element than the word itself, e.g.
 * table-mode's whole cell), not the word text, so they go through
 * `applyGenderContainer` below instead. Color for all three styles comes
 * from CSS (`--gender-color-masculine`/`-feminine` in variables.css,
 * overridable per Settings.getGenderColor/applyGenderColors) via class, not
 * an inline style, so a Settings color change repaints everything already
 * on screen without re-rendering anything.
 */
export function renderWordWithGender(
  el: HTMLElement, base: string, annotation: string | null | undefined,
  key: 'masculine' | 'feminine' | null, style: GenderIndicatorStyle,
): void {
  el.textContent = '';
  if (key && style === 'word-bg') {
    const span = document.createElement('span');
    span.className = `gender-word-bg gender-word-bg--${key}`;
    span.textContent = base;
    el.appendChild(span);
  } else {
    el.appendChild(document.createTextNode(base));
  }
  if (annotation) {
    const span = document.createElement('span');
    span.className = 'word-disambiguator';
    span.textContent = `(${annotation})`;
    el.appendChild(span);
  }
}

/**
 * Apply (or clear) the 'dot'/'box-bg' gender indicator styles on
 * `container` — 'dot' appends a small absolutely-positioned corner dot
 * (table.css places table mode's in the cell's bottom-left, next to the
 * existing "known" star — see that file's own comments; elsewhere it stays
 * inline via components.css's base `.gender-dot` rule), 'box-bg' colors the
 * container's entire background. Always clears both first, so switching
 * styles (or re-rendering a word whose gender indicator should no longer
 * show) never leaves a stale dot or background behind on a reused element.
 * 'word-bg' and 'off' are no-ops here — see `renderWordWithGender` above for
 * the word-level style.
 */
export function applyGenderContainer(
  container: HTMLElement, key: 'masculine' | 'feminine' | null, style: GenderIndicatorStyle,
): void {
  container.classList.remove('gender-box-bg--masculine', 'gender-box-bg--feminine');
  container.querySelector(':scope > .gender-dot')?.remove();

  if (!key) return;
  if (style === 'box-bg') {
    container.classList.add(`gender-box-bg--${key}`);
  } else if (style === 'dot') {
    const dot = document.createElement('span');
    dot.className = `gender-dot gender-dot--${key}`;
    dot.title = key === 'masculine' ? 'Masculine' : 'Feminine';
    container.appendChild(dot);
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
