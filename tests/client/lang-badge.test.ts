// @vitest-environment jsdom
/**
 * lang-badge.test.ts — buildLangBadge() (src/client/ui/lang-badge.ts), the
 * flag+color pill shared by the list-filter checkboxes, My Lists sidebar and
 * star-button picker.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { buildLangBadge } from '../../src/client/ui/lang-badge.js';

beforeEach(() => localStorage.clear());

describe('buildLangBadge', () => {
  it('renders a neutral placeholder for an empty language list', () => {
    const badge = buildLangBadge([]);
    expect(badge.classList.contains('lang-badge--empty')).toBe(true);
    expect(badge.textContent).toBe('—');
    expect(badge.title).toBe('No words yet');
    expect(badge.querySelector('img')).toBeNull();
  });

  it('renders a single language with its flag and label', () => {
    const badge = buildLangBadge(['spanish']);
    expect(badge.classList.contains('lang-tag-spanish')).toBe(true);
    expect(badge.classList.contains('lang-badge--mixed')).toBe(false);
    expect(badge.title).toBe('Spanish');
    const img = badge.querySelector('img.flag-icon');
    expect(img?.getAttribute('alt')).toBe('Spanish');
  });

  it('renders every language\'s flag and a "Mixed" title for more than one', () => {
    const badge = buildLangBadge(['spanish', 'french']);
    expect(badge.classList.contains('lang-badge--mixed')).toBe(true);
    expect(badge.querySelectorAll('img.flag-icon')).toHaveLength(2);
    expect(badge.title).toBe('Mixed: Spanish, French');
  });
});
