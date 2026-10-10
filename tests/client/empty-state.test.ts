// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { emptyState, goToMode } from '../../src/client/ui/empty-state.ts';

describe('emptyState', () => {
  it('draws an icon (hidden from screen readers), a title and a body', () => {
    const el = emptyState({ icon: '📭', title: 'Nothing yet', body: 'Do a quiz.' });
    expect(el.querySelector('.empty-state-icon')?.getAttribute('aria-hidden')).toBe('true');
    expect(el.querySelector('.empty-state-title')?.textContent).toBe('Nothing yet');
    expect(el.querySelector('.empty-state-body')?.textContent).toBe('Do a quiz.');
    expect(el.querySelector('.empty-state-actions')).toBeNull();
  });

  it('draws action buttons, the first one primary, and runs the handler on click', () => {
    const go = vi.fn();
    const other = vi.fn();
    const el = emptyState({ icon: '📭', title: 'T', actions: [{ label: 'Go', onClick: go }, { label: 'Other', onClick: other }] });
    const [a, b] = [...el.querySelectorAll<HTMLButtonElement>('.empty-state-btn')];
    expect(a.classList.contains('empty-state-btn--primary')).toBe(true);
    expect(b.classList.contains('empty-state-btn--primary')).toBe(false);
    a.click();
    expect(go).toHaveBeenCalledTimes(1);
    expect(other).not.toHaveBeenCalled();
  });

  it('honours an explicit primary and the compact variant', () => {
    const el = emptyState({ icon: 'x', title: 'T', compact: true, actions: [{ label: 'A', onClick() {} }, { label: 'B', primary: true, onClick() {} }] });
    expect(el.classList.contains('empty-state--compact')).toBe(true);
    const [a, b] = [...el.querySelectorAll('.empty-state-btn')];
    expect(a.classList.contains('empty-state-btn--primary')).toBe(false);
    expect(b.classList.contains('empty-state-btn--primary')).toBe(true);
  });
});

describe('goToMode', () => {
  it('clicks the tab for that mode', () => {
    document.body.innerHTML = '<button class="mode-tab" data-mode="table"></button><button class="mode-tab" data-mode="history"></button>';
    const spy = vi.fn();
    document.querySelector('[data-mode="history"]')!.addEventListener('click', spy);
    goToMode('history');
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
