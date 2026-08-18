/**
 * filter-lang.ts — the language the filters are filtering.
 *
 * Every filter module needs this and each had grown its own copy of the same
 * cast-and-default line. One copy, so a change to how the language is chosen
 * cannot reach three of the four places that read it.
 */

export function currentLangValue(fallback = 'spanish'): string {
  return (document.getElementById('langSelect') as HTMLSelectElement | null)?.value ?? fallback;
}
