// @vitest-environment jsdom
/**
 * html.test.ts — the shared escapeHtml (src/client/utils/html.ts). There used
 * to be three; the admin panel's left `"` alone, so a value containing a quote
 * was cut short when written into an attribute.
 */
import { describe, it, expect } from 'vitest';
import { escapeHtml } from '../../src/client/utils/html.js';

describe('escapeHtml', () => {
  it('escapes all five significant characters', () => {
    expect(escapeHtml(`<a href="x">Tom & Jerry's</a>`))
      .toBe('&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;');
  });

  it('does not double-escape when & is escaped first', () => {
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
  });

  it('round-trips through a quoted attribute value intact', () => {
    const tricky = `he said "hola" & left <now> it's`;
    const div = document.createElement('div');
    div.innerHTML = `<input value="${escapeHtml(tricky)}" data-x='${escapeHtml(tricky)}'>`;
    const input = div.querySelector('input');
    expect(input?.value).toBe(tricky);
    expect(input?.dataset.x).toBe(tricky);
  });

  it('round-trips through text content intact', () => {
    const div = document.createElement('div');
    div.innerHTML = `<span>${escapeHtml('<script>alert(1)</script>')}</span>`;
    expect(div.querySelector('script')).toBeNull();
    expect(div.textContent).toBe('<script>alert(1)</script>');
  });
});
