/**
 * streak-widget.test.ts — the top-right 🔥 counter's pure HTML builder
 * (src/client/ui/streak-widget.ts). Pure string logic, no DOM.
 */
import { describe, it, expect } from 'vitest';
import { buildStreakWidgetHtml } from '../../src/client/ui/streak-widget.js';

describe('buildStreakWidgetHtml', () => {
  it('puts the emoji before the count for emoji-number', () => {
    const html = buildStreakWidgetHtml(5, 'emoji-number');
    expect(html.indexOf('streak-widget-emoji')).toBeLessThan(html.indexOf('streak-widget-count'));
    expect(html).toContain('>5<');
  });

  it('puts the count before the emoji for number-emoji', () => {
    const html = buildStreakWidgetHtml(5, 'number-emoji');
    expect(html.indexOf('streak-widget-count')).toBeLessThan(html.indexOf('streak-widget-emoji'));
  });

  it('omits the emoji entirely for number-only', () => {
    const html = buildStreakWidgetHtml(5, 'number-only');
    expect(html).not.toContain('streak-widget-emoji');
    expect(html).toContain('>5<');
  });

  it('renders 0 as a plain count, not blank', () => {
    expect(buildStreakWidgetHtml(0, 'emoji-number')).toContain('>0<');
  });
});
