import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TAB_COLOR_DEFS } from '../../src/client/settings.ts';

const read = (p: string): string => readFileSync(resolve(process.cwd(), p), 'utf-8');
const html = read('index.html');
const vars = read('public/styles/shared/variables.css');
const css = read('public/styles/app/mode-tabs.css');

describe('mode-tab colours', () => {
  it.each(TAB_COLOR_DEFS.map(d => [...d]))('%s: a tab in the page, a default in both themes, a rule that uses it', (key, _label, cssVar) => {
    expect(html, `no tab has data-mode="${key}"`).toContain(`data-mode="${key}" role="tab"`);
    expect(vars.split(`${cssVar}:`).length - 1, `${cssVar} needs a light and a dark default`).toBe(2);
    expect(css).toContain(`.mode-tab[data-mode="${key}"]`);
    expect(css).toContain(`var(${cssVar})`);
  });

  it('every real tab in the page (bar the dev-only AI Chat) has a colour, so none is left plain or missing from Settings', () => {
    const inPage = [...html.matchAll(/class="mode-tab[^"]*" data-mode="([A-Za-z]+)" role="tab"/g)].map(m => m[1]).filter(m => m !== 'chat');
    expect(new Set(inPage)).toEqual(new Set(TAB_COLOR_DEFS.map(d => d[0])));
  });

  it('has a group and a reset button in Settings → Appearance', () => {
    expect(html).toContain('id="settingTabColors"');
    expect(html).toContain('id="settingResetTabColors"');
  });
});
