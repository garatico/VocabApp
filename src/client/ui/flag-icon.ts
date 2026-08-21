/**
 * flag-icon.ts — the small square flag <img> used anywhere a language needs
 * a flag: My Lists badges, the Compare/Multi-language table and tooltip
 * watermark, the Settings flag picker's live preview.
 *
 * A real image rather than the Unicode flag emoji it replaced — Windows'
 * bundled emoji font has no flag glyphs, so a regional-indicator pair like
 * 🇪🇸 rendered as the literal letters "ES" on a lot of Windows browsers
 * instead of a flag. See public/flags/README.md.
 */

import { flagUrl } from '../data/languages.ts';

export function createFlagImg(country: string, altLabel: string): HTMLImageElement {
  const img = document.createElement('img');
  img.className = 'flag-icon';
  img.src = flagUrl(country);
  img.alt = altLabel;
  img.width = 16;
  img.height = 16;
  img.loading = 'lazy';
  return img;
}
