/**
 * admin-languages.ts — flag icon + color coding for a language, shared by
 * every admin module that lists more than one language side by side (DB
 * Admin's per-language buttons, the DB info card's cache pills, Statistics'
 * language tabs) or wants a live flag next to a language <select>.
 *
 * Reuses the main app's own language data (data/languages.ts) and flag
 * image builder (ui/flag-icon.ts) rather than inventing an admin-only
 * flag/color scheme — both are pure data/DOM helpers with no side-effecting
 * imports, unlike ui/lang-badge.ts, which pulls in the whole of settings.ts
 * (the main app's user-preference store, built assuming index.html's own
 * DOM) just for its per-user flag-country override. The admin panel has no
 * equivalent preference to honor, so this uses each language's plain
 * default flagCountry instead of importing that.
 */
import { languageInfo, flagUrl } from '../data/languages.ts';
import { createFlagImg } from '../ui/flag-icon.ts';
import { escapeHtml } from './admin-api.js';

export { languageInfo } from '../data/languages.ts';

/** Flag <img> for a language, using its default flag country. */
export function langFlagImg(lang: string): HTMLImageElement {
  const info = languageInfo(lang);
  return createFlagImg(info.flagCountry, info.label);
}

/** Same flag, as an HTML string — for the admin modules that build their
 *  markup with innerHTML template strings rather than DOM calls. */
export function langFlagImgHtml(lang: string): string {
  const info = languageInfo(lang);
  return `<img class="flag-icon" src="${flagUrl(info.flagCountry)}" alt="${escapeHtml(info.label)}" width="16" height="16" loading="lazy">`;
}

/** "Spanish", "Portuguese", … — capitalized display label. */
export function langLabel(lang: string): string {
  return languageInfo(lang).label;
}
