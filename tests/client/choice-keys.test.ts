// @vitest-environment jsdom
/**
 * choice-keys.test.ts — number keys answer multiple-choice options.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { bindChoiceKeys } from '../../src/client/ui/choice-keys.ts';

let root: HTMLElement;

function options(n: number, cls = 'opt'): HTMLButtonElement[] {
  return Array.from({ length: n }, (_, i) => {
    const b = document.createElement('button');
    b.className = cls;
    b.textContent = `option ${i + 1}`;
    root.appendChild(b);
    return b;
  });
}

const press = (key: string, init: KeyboardEventInit = {}, target: EventTarget = document.body): KeyboardEvent => {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(e);
  return e;
};

/** MutationObserver callbacks are microtasks. */
const flush = (): Promise<void> => new Promise(r => setTimeout(r, 0));

beforeEach(() => {
  document.body.innerHTML = '';
  root = document.createElement('div');
  document.body.appendChild(root);
});

describe('bindChoiceKeys', () => {
  it('clicks the option whose number was pressed', () => {
    const [a, b, c] = options(3);
    const clicked = vi.fn();
    [a, b, c].forEach((el, i) => el.addEventListener('click', () => clicked(i)));
    bindChoiceKeys(root, '.opt');
    press('2');
    expect(clicked).toHaveBeenCalledExactlyOnceWith(1);
  });

  it('numbers the options and advertises the key to assistive tech', () => {
    const els = options(3);
    bindChoiceKeys(root, '.opt');
    expect(els.map(e => e.dataset['keyHint'])).toEqual(['1', '2', '3']);
    expect(els.map(e => e.getAttribute('aria-keyshortcuts'))).toEqual(['1', '2', '3']);
  });

  it('renumbers when the options are replaced (the next question)', async () => {
    options(2);
    bindChoiceKeys(root, '.opt');
    root.innerHTML = '';
    const next = options(4);
    await flush();
    expect(next.map(e => e.dataset['keyHint'])).toEqual(['1', '2', '3', '4']);
  });

  it('ignores a number with no option, and 0', () => {
    const [a] = options(1);
    const clicked = vi.fn();
    a.addEventListener('click', clicked);
    bindChoiceKeys(root, '.opt');
    press('3'); press('0');
    expect(clicked).not.toHaveBeenCalled();
  });

  it('does not answer with a locked option (already answered)', () => {
    const [a, b] = options(2);
    const clicked = vi.fn();
    a.addEventListener('click', clicked); b.addEventListener('click', clicked);
    a.disabled = true;
    b.classList.add('pm-locked');
    bindChoiceKeys(root, '.opt');
    press('1'); press('2');
    expect(clicked).not.toHaveBeenCalled();
  });

  it('leaves digits alone while typing in a field', () => {
    const [a] = options(1);
    const clicked = vi.fn();
    a.addEventListener('click', clicked);
    const input = document.createElement('input');
    document.body.appendChild(input);
    bindChoiceKeys(root, '.opt');
    press('1', {}, input);
    expect(clicked).not.toHaveBeenCalled();
  });

  it('leaves modified digits alone (Ctrl+1 is a browser shortcut)', () => {
    const [a] = options(1);
    const clicked = vi.fn();
    a.addEventListener('click', clicked);
    bindChoiceKeys(root, '.opt');
    press('1', { ctrlKey: true }); press('1', { altKey: true }); press('1', { metaKey: true });
    expect(clicked).not.toHaveBeenCalled();
  });

  it('does nothing while its group is hidden (another sub-mode is showing)', () => {
    const [a] = options(1);
    const clicked = vi.fn();
    a.addEventListener('click', clicked);
    bindChoiceKeys(root, '.opt');
    root.style.display = 'none';
    press('1');
    expect(clicked).not.toHaveBeenCalled();
  });

  it('stops listening once its container has left the document', () => {
    const [a] = options(1);
    const clicked = vi.fn();
    a.addEventListener('click', clicked);
    bindChoiceKeys(root, '.opt');
    root.remove();
    press('1');
    expect(clicked).not.toHaveBeenCalled();
  });

  it('only numbers the first nine options', () => {
    const els = options(12);
    bindChoiceKeys(root, '.opt');
    expect(els[8].dataset['keyHint']).toBe('9');
    expect(els[9].dataset['keyHint']).toBeUndefined();
  });
});
