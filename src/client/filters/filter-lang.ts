/**
 * filter-lang.ts — the language the filters are filtering.
 *
 * Every filter module needs this and each had grown its own copy of the same
 * cast-and-default line. One copy, so a change to how the language is chosen
 * cannot reach three of the four places that read it.
 */

import { Settings } from '../settings.ts';

export function currentLangValue(fallback = 'spanish'): string {
  return (document.getElementById('langSelect') as HTMLSelectElement | null)?.value ?? fallback;
}

/** Modes that know how to render/score a mixed-language word list. */
export const MULTI_LANG_MODES = new Set(['table', 'conjugation']);

/**
 * The "+ Languages" picker's current selection — app.ts owns the UI and is
 * the sole writer (via setExtraLanguages()), but word-lists.ts and
 * word-filters.ts need to read it too, when building and applying the Lists
 * filter, and app.ts already imports both of those — the reverse import
 * would cycle. Kept here instead, the same reasoning as currentLangValue()
 * above.
 */
let extraLanguages = new Set<string>();

export function setExtraLanguages(langs: Set<string>): void {
  extraLanguages = langs;
}

/**
 * The extra languages currently in effect. Gated on the active tab rather
 * than just the picker's own state, since a selection made on one of the
 * multi-language modes stays selected (just visually hidden) if the user
 * switches to a mode that doesn't support a merge without clearing it.
 */
export function currentExtraLanguages(): string[] {
  // See app.ts's getExtraLanguages() — this is the second independent reader
  // (word-lists.ts/presets.ts) that needs the same Kid-Friendly Mode guard.
  if (Settings.getKidFriendlyMode()) return [];
  const activeMode = document.querySelector('.mode-tab.active')?.getAttribute('data-mode');
  if (!activeMode || !MULTI_LANG_MODES.has(activeMode)) return [];
  const primary = currentLangValue();
  return [...extraLanguages].filter(name => name !== primary);
}
