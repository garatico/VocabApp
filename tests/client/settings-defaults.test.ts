// @vitest-environment jsdom
/**
 * settings-defaults.test.ts — the HTML's idea of each setting's default agrees with the code's.
 *
 * "Changed from default" treats the button marked `.active` in index.html as the default, then lets
 * the Settings code paint the saved values over it. On empty storage those two must agree: a row that
 * reads as changed there is a markup default the getters in settings.ts disagree with (the Hint button
 * used to ship as On while defaulting to Off). tests/e2e/settings-organisation.spec.ts checks the same
 * thing in a real browser; this catches it in milliseconds, with the row's name.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf-8');

describe('every setting starts at its default on empty storage', () => {
  it('no row reads as changed', async () => {
    localStorage.clear();
    document.body.innerHTML = html.slice(html.indexOf('<body'), html.indexOf('</body>')).replace(/<script[\s\S]*?<\/script>/g, '');
    const { bindSettings } = await import('../../src/client/settings-ui.ts');
    bindSettings();

    const changed = [...document.querySelectorAll('.settings-row--changed .settings-label > span:first-child')]
      .map(e => e.textContent?.trim());
    expect(changed).toEqual([]);
    expect(document.getElementById('settingsChangedCount')?.textContent).toBe('');
  });
});
