import '../../styles-lazy/my-content-bundle.css';
/**
 * chip-input.ts — a container holding rendered chips plus one trailing text
 * field: type a value, press Enter/comma to turn it into a chip, click a
 * chip's × to remove it. One factory for every chip field in the editor
 * (Glosses, Domains) rather than near-identical copies of the same
 * render/add/remove logic.
 */

export interface ChipInputHandle {
  get(): string[];
  set(values: string[]): void;
  /** Turns whatever is still typed in the text field into a chip. */
  addFromInput(): void;
}

export interface ChipInputOptions {
  /** Order matters (Glosses): each chip shows its position, drags by its ⠿ handle (mouse or touch), and keeps
   *  ‹ › buttons to move it earlier/later from the keyboard. */
  reorderable?: boolean;
  /** Fires after the user adds, removes or reorders a chip — not after `set()`. */
  onChange?: () => void;
}

export function createChipInput(
  container: HTMLElement, input: HTMLInputElement, itemLabel: string, options: ChipInputOptions = {},
): ChipInputHandle {
  let chips: string[] = [];
  const changed = (): void => options.onChange?.();

  function render(): void {
    container.querySelectorAll('.chip-input-tag').forEach(el => el.remove());
    chips.forEach((value, i) => {
      const chip = document.createElement('span');
      chip.className = 'chip-input-tag';
      const label = document.createElement('span');
      label.textContent = value;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'chip-input-tag-remove';
      remove.textContent = '×';
      remove.setAttribute('aria-label', `Remove ${itemLabel} "${value}"`);
      remove.addEventListener('click', () => { chips.splice(i, 1); render(); changed(); });
      if (options.reorderable) {
        const move = (dir: -1 | 1): void => {
          const j = i + dir;
          if (j < 0 || j >= chips.length) return;
          [chips[i], chips[j]] = [chips[j], chips[i]];
          render(); changed();
          container.querySelectorAll<HTMLButtonElement>('.chip-input-tag')[j]
            ?.querySelector<HTMLButtonElement>(`.chip-input-tag-move:nth-of-type(${dir < 0 ? 1 : 2})`)?.focus();
        };
        chip.classList.add('chip-input-tag--ordered');
        chip.dataset['index'] = String(i);
        const handle = document.createElement('span');
        handle.className = 'chip-input-tag-handle';
        handle.textContent = '⠿';
        handle.title = 'Drag to reorder';
        handle.setAttribute('aria-hidden', 'true');
        handle.addEventListener('pointerdown', e => startDrag(e, chip, i));
        const order = document.createElement('span');
        order.className = 'chip-input-tag-order';
        order.textContent = String(i + 1);
        order.title = i === 0 ? 'Shown first' : `Shown ${ordinal(i + 1)}`;
        const earlier = document.createElement('button');
        earlier.type = 'button'; earlier.className = 'chip-input-tag-move';
        earlier.textContent = '‹'; earlier.disabled = i === 0;
        earlier.setAttribute('aria-label', `Move ${itemLabel} "${value}" earlier`);
        earlier.addEventListener('click', () => move(-1));
        const later = document.createElement('button');
        later.type = 'button'; later.className = 'chip-input-tag-move';
        later.textContent = '›'; later.disabled = i === chips.length - 1;
        later.setAttribute('aria-label', `Move ${itemLabel} "${value}" later`);
        later.addEventListener('click', () => move(1));
        chip.append(handle, order, earlier, label, later, remove);
      } else {
        chip.append(label, remove);
      }
      container.insertBefore(chip, input);
    });
  }

  /**
   * Drag a chip by its handle to a new place. Pointer events, not HTML drag-and-drop, which phones don't fire:
   * the handle captures the pointer (touch-action: none on it alone, so the page still scrolls from anywhere
   * else), the chip follows it, and the chip under the pointer shows a bar on the side it would land.
   */
  function startDrag(e: PointerEvent, chip: HTMLElement, from: number): void {
    if (e.button !== 0) return;
    e.preventDefault();
    const handle = e.currentTarget as HTMLElement;
    handle.setPointerCapture(e.pointerId);
    const x0 = e.clientX, y0 = e.clientY;
    let to = from;
    let dragging = false;
    const others = (): HTMLElement[] => [...container.querySelectorAll<HTMLElement>('.chip-input-tag')].filter(c => c !== chip);
    const clearMarks = (): void => others().forEach(c => c.classList.remove('chip-drop-before', 'chip-drop-after'));
    const onMove = (ev: PointerEvent): void => {
      const dx = ev.clientX - x0, dy = ev.clientY - y0;
      if (!dragging && Math.hypot(dx, dy) < 4) return;
      dragging = true;
      chip.classList.add('chip-input-tag--dragging');
      chip.style.transform = `translate(${dx}px, ${dy}px)`;
      clearMarks();
      // The chip nearest the pointer, and which side of its middle the pointer is on.
      let best: HTMLElement | null = null, bestD = Infinity;
      for (const c of others()) {
        const r = c.getBoundingClientRect();
        const d = Math.hypot(ev.clientX - (r.left + r.width / 2), ev.clientY - (r.top + r.height / 2));
        if (d < bestD) { bestD = d; best = c; }
      }
      if (!best) return;
      const r = best.getBoundingClientRect();
      const after = ev.clientX > r.left + r.width / 2;
      best.classList.add(after ? 'chip-drop-after' : 'chip-drop-before');
      const at = Number(best.dataset['index']);
      to = after ? (at < from ? at + 1 : at) : (at < from ? at : at - 1);
    };
    const onUp = (): void => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
      chip.classList.remove('chip-input-tag--dragging');
      chip.style.transform = '';
      clearMarks();
      if (!dragging || to === from) return;
      const [moved] = chips.splice(from, 1);
      chips.splice(to, 0, moved);
      render(); changed();
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  }

  function addFromInput(): void {
    const value = input.value.trim();
    input.value = '';
    if (value && !chips.includes(value)) { chips.push(value); render(); changed(); }
  }

  container.addEventListener('click', () => input.focus());
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addFromInput(); }
    else if (e.key === 'Backspace' && input.value === '' && chips.length) { chips.pop(); render(); changed(); }
  });
  input.addEventListener('blur', addFromInput);

  return {
    get()       { return chips; },
    set(values) { chips = [...values]; render(); },
    addFromInput,
  };
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
