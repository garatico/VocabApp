import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CTL_COLOR_DEFS } from '../../src/client/settings.ts';

const read = (p: string): string => readFileSync(resolve(process.cwd(), p), 'utf-8');
const html = read('index.html');
const vars = read('public/styles/shared/variables.css');
const bar = read('public/styles/app/controls-bar.css');

describe('controls-bar option colours', () => {
  it.each(CTL_COLOR_DEFS.map(d => [...d]))('%s: an option in the page, a default in both themes, a rule that uses it', (key, _label, cssVar) => {
    expect(html, `no button carries data-cc="${key}"`).toContain(`data-cc="${key}"`);
    // Declared twice in variables.css: the light block and the dark one.
    expect(vars.split(`${cssVar}:`).length - 1, `${cssVar} needs a light and a dark default`).toBe(2);
    expect(bar).toContain(`[data-cc="${key}"]`);
  });

  it('every data-cc in the page has a definition, so no option is left uncoloured or unlisted in Settings', () => {
    const inPage = [...html.matchAll(/data-cc="([a-z-]+)"/g)].map(m => m[1]);
    expect(new Set(inPage)).toEqual(new Set(CTL_COLOR_DEFS.map(d => d[0])));
  });
});
