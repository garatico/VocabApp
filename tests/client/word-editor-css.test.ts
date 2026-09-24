/**
 * word-editor-css.test.ts — public/styles/app/word-editor.css is generated
 * from the Admin panel's stylesheets (scripts/word-editor-css.mjs). This fails
 * when someone edits an Admin source without regenerating, which would leave
 * My Content's editor styled differently from Admin's.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
// @ts-expect-error — plain .mjs script with no type declarations
import { buildWordEditorCss, OUTPUT } from '../../scripts/word-editor-css.mjs';

describe('word-editor.css', () => {
  it('is in sync with the Admin stylesheets it is generated from', () => {
    const checkedIn = readFileSync(resolve(__dirname, '../..', OUTPUT), 'utf8').replace(/\r\n/g, '\n');
    expect(checkedIn).toBe((buildWordEditorCss() as string).replace(/\r\n/g, '\n'));
  });

  it('scopes every rule under .word-editor', () => {
    const css = buildWordEditorCss() as string;
    const selectors = [...css.matchAll(/^([^\s@/}{][^{]*)\{/gm)].map(m => m[1].trim());
    const unscoped = selectors.filter(s => !s.split(',').every(p => /(^|\s)\.word-editor(\s|$)/.test(p.trim()) || p.trim().startsWith('html.dark .word-editor')));
    expect(unscoped).toEqual([]);
  });
});
