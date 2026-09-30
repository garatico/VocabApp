// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { languagePickerLabel } from '../../src/client/ui/language-picker.ts';

describe('languagePickerLabel', () => {
  it('says what the button is for when nothing is picked', () => {
    expect(languagePickerLabel(new Set())).toBe('+ Languages');
  });
  it('names a single extra language', () => {
    expect(languagePickerLabel(new Set(['french']))).toMatch(/^\+ French/);
  });
  it('counts two or more, so the button never changes width as languages are added', () => {
    expect(languagePickerLabel(new Set(['french', 'italian']))).toBe('2 selected');
    expect(languagePickerLabel(new Set(['french', 'italian', 'german']))).toBe('3 selected');
    expect(languagePickerLabel(new Set(['french', 'italian', 'german', 'dutch']))).toBe('4 selected');
  });
});
