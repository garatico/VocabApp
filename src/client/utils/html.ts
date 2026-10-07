/**
 * html.ts — the one HTML escaper. Escapes all five significant characters,
 * so the result is safe in text content *and* in a quoted attribute value
 * (`value="${escapeHtml(form)}"`). The admin panel used to have a DOM-based
 * escaper (textContent → innerHTML) that left `"` alone, which cut an
 * attribute short at the first quote in the data.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
