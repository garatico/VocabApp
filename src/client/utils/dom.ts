/**
 * dom.ts — typed DOM query helpers
 *
 * mustGet<T>(id) is a loud alternative to `document.getElementById(id)!`:
 * it throws immediately with a clear message if the element is missing,
 * rather than crashing silently when the element is first used.
 */

export function mustGet<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Required DOM element #${id} not found. Check that the HTML template includes this element.`);
  return el as T;
}
