// @vitest-environment jsdom
/**
 * toast.test.ts — showToast() (src/client/ui/toast.ts): a brief,
 * self-removing notice appended to document.body.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { showToast } from '../../src/client/ui/toast.js';

beforeEach(() => {
  document.body.innerHTML = '';
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe('showToast', () => {
  it('appends a toast with the message and default "info" variant', () => {
    showToast('Saved!');
    const toast = document.body.querySelector('.toast');
    expect(toast?.textContent).toBe('Saved!');
    expect(toast?.className).toBe('toast toast-info');
    expect(toast?.getAttribute('role')).toBe('status');
  });

  it('applies the given variant', () => {
    showToast('Oops', 'error');
    expect(document.body.querySelector('.toast')?.className).toBe('toast toast-error');
  });

  it('lets multiple toasts coexist, each independently timed', () => {
    showToast('First');
    showToast('Second');
    expect(document.body.querySelectorAll('.toast')).toHaveLength(2);
  });

  it('removes itself after the default 5s', () => {
    showToast('Bye');
    expect(document.body.querySelector('.toast')).not.toBeNull();
    vi.advanceTimersByTime(4999);
    expect(document.body.querySelector('.toast')).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(document.body.querySelector('.toast')).toBeNull();
  });

  it('honors a custom duration', () => {
    showToast('Quick', 'info', 1000);
    vi.advanceTimersByTime(999);
    expect(document.body.querySelector('.toast')).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(document.body.querySelector('.toast')).toBeNull();
  });

  it('removing one toast does not affect another with a longer duration', () => {
    showToast('Short', 'info', 1000);
    showToast('Long', 'info', 5000);
    vi.advanceTimersByTime(1000);
    expect(document.body.querySelectorAll('.toast')).toHaveLength(1);
    expect(document.body.querySelector('.toast')?.textContent).toBe('Long');
  });
});
