// @vitest-environment jsdom
/**
 * filter-toggle.test.ts — initializeFilterToggle() (src/client/filters/
 * filter-toggle.ts), the "Refine Results" collapse button.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { initializeFilterToggle } from '../../src/client/filters/filter-toggle.js';

let toggleBtn: HTMLElement;
let wordFilters: HTMLElement;

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
  toggleBtn = document.createElement('button');
  toggleBtn.id = 'filterToggle';
  wordFilters = document.createElement('div');
  wordFilters.id = 'wordFilters';
  document.body.append(toggleBtn, wordFilters);
});

describe('initializeFilterToggle', () => {
  it('does nothing if #filterToggle is missing', () => {
    toggleBtn.remove();
    expect(() => initializeFilterToggle()).not.toThrow();
  });

  it('does nothing if #wordFilters is missing', () => {
    wordFilters.remove();
    expect(() => initializeFilterToggle()).not.toThrow();
  });

  it('starts expanded when nothing was saved before', () => {
    initializeFilterToggle();
    expect(toggleBtn.getAttribute('aria-expanded')).toBe('true');
    expect(wordFilters.classList.contains('collapsed')).toBe(false);
  });

  it('restores a collapsed state from storage', () => {
    localStorage.setItem('filterExpanded', 'false');
    initializeFilterToggle();
    expect(toggleBtn.getAttribute('aria-expanded')).toBe('false');
    expect(wordFilters.classList.contains('collapsed')).toBe(true);
  });

  it('clicking collapses, updates aria-expanded, and persists the choice', () => {
    initializeFilterToggle();
    toggleBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(toggleBtn.getAttribute('aria-expanded')).toBe('false');
    expect(wordFilters.classList.contains('collapsed')).toBe(true);
    expect(localStorage.getItem('filterExpanded')).toBe('false');
  });

  it('clicking twice returns to expanded and persists that too', () => {
    initializeFilterToggle();
    toggleBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    toggleBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(toggleBtn.getAttribute('aria-expanded')).toBe('true');
    expect(wordFilters.classList.contains('collapsed')).toBe(false);
    expect(localStorage.getItem('filterExpanded')).toBe('true');
  });
});
