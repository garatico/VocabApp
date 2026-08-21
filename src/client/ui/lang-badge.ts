/**
 * lang-badge.ts — the small flag+color pill that marks a list's language.
 *
 * One shared builder rather than three copies, since it shows up in three
 * places: the list-filter checkboxes, the My Lists sidebar, and the
 * star-button picker. A list with words from 2+ languages renders as
 * "Mixed" instead of picking one arbitrarily.
 */

import { languageInfo } from '../data/languages.ts';
import { Settings } from '../settings.ts';

/**
 * @param languages Distinct languages present in the list. Empty (a
 * brand-new cross-language list with no words yet) renders a neutral
 * placeholder rather than nothing, so the row doesn't look broken.
 */
export function buildLangBadge(languages: string[]): HTMLElement {
  const badge = document.createElement('span');
  badge.className = 'lang-badge';

  if (languages.length === 0) {
    badge.classList.add('lang-badge--empty');
    badge.textContent = '—';
    badge.title = 'No words yet';
    return badge;
  }

  if (languages.length === 1) {
    const info = languageInfo(languages[0]);
    badge.classList.add(`lang-tag-${languages[0]}`);
    badge.textContent = Settings.getLangFlag(languages[0]);
    badge.title = info.label;
    return badge;
  }

  badge.classList.add('lang-badge--mixed');
  badge.textContent = languages.map(l => Settings.getLangFlag(l)).join('');
  badge.title = 'Mixed: ' + languages.map(l => languageInfo(l).label).join(', ');
  return badge;
}
