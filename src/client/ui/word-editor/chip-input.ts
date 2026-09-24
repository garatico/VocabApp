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
  /** Show ‹ › on each chip to move it earlier/later (Glosses: order matters). */
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
        };
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
        chip.append(earlier, label, later, remove);
      } else {
        chip.append(label, remove);
      }
      container.insertBefore(chip, input);
    });
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
