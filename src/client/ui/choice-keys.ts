/**
 * choice-keys.ts — answer a multiple-choice question with the number keys.
 *
 * Picture Quiz's "click the picture" and Trivia's "choice" sub-mode showed four
 * options and offered no way to pick one without a pointer. This numbers the
 * options 1–9 in DOM order (a small badge, plus aria-keyshortcuts) and clicks
 * the matching one when that digit is pressed.
 *
 * Deliberately generic: it knows a container and a selector, nothing about
 * quizzes, so the two modes above share one implementation. Options are
 * re-rendered for every question, so numbering is kept up to date with a
 * MutationObserver rather than each mode having to call back in.
 */

const MAX_KEYS = 9;

function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable;
}

function isLocked(el: HTMLElement): boolean {
  return (el as HTMLButtonElement).disabled === true
    || el.getAttribute('aria-disabled') === 'true'
    || el.classList.contains('pm-locked');
}

/** Whether the group is on screen — a hidden sub-mode's options must not answer. */
function isShown(root: HTMLElement): boolean {
  return root.isConnected && !root.hidden && getComputedStyle(root).display !== 'none';
}

/**
 * Wire number-key answering for the options matching `selector` under `root`.
 * Cleans itself up once `root` leaves the document (the quiz was replaced).
 */
export function bindChoiceKeys(root: HTMLElement, selector: string): void {
  const options = (): HTMLElement[] =>
    [...root.querySelectorAll<HTMLElement>(selector)].slice(0, MAX_KEYS);

  function number(): void {
    options().forEach((el, i) => {
      el.dataset['keyHint'] = String(i + 1);
      el.setAttribute('aria-keyshortcuts', String(i + 1));
    });
  }

  const observer = new MutationObserver(() => {
    if (!root.isConnected) { teardown(); return; }
    number();
  });
  observer.observe(root, { childList: true });
  number();

  function onKey(e: KeyboardEvent): void {
    if (!root.isConnected) { teardown(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    if (isTypingTarget(e.target) || !isShown(root)) return;
    if (!/^[1-9]$/.test(e.key)) return;

    const target = options()[Number(e.key) - 1];
    if (!target || isLocked(target)) return;
    e.preventDefault();
    target.click();
  }

  function teardown(): void {
    observer.disconnect();
    document.removeEventListener('keydown', onKey);
  }

  document.addEventListener('keydown', onKey);
}
