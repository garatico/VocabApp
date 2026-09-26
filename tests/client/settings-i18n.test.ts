/**
 * settings-i18n.test.ts — every string on the Settings screen that is tagged for translation has a
 * Spanish entry, and every visible label and description in it is tagged.
 *
 * A setting added with English text only would otherwise show up half-translated for a Spanish user
 * with nothing to say so.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { es } from '../../src/client/i18n/es.ts';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf-8');
const start = html.indexOf('<section id="settingsArea"');
const end = html.indexOf('</section>', start);
const settings = html.slice(start, end);

describe('the Settings screen is translatable', () => {
  it('every data-i18n key used inside it has a Spanish entry', () => {
    const keys = new Set([...settings.matchAll(/data-i18n(?:-[a-z-]+)?="([^"]+)"/g)].map(m => m[1]));
    const missing = [...keys].filter(k => !(k in es));
    expect(missing).toEqual([]);
  });

  it('every setting label and description is tagged, bar the few built from script', () => {
    const untagged: string[] = [];
    for (const m of settings.matchAll(/<div class="settings-label">([\s\S]*?)<\/div>/g)) {
      for (const span of m[1].matchAll(/<span([^>]*)>([^<]+)<\/span>/g)) {
        if (!/data-i18n/.test(span[1])) untagged.push(span[2].trim().slice(0, 50));
      }
    }
    // The backup description holds a live "last backup" readout inside it, so it cannot be swapped wholesale.
    expect(untagged.filter(t => !t.startsWith('One file with your lists') && t !== 'Never backed up.')).toEqual([]);
  });
});
