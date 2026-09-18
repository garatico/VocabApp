/**
 * chip-dropdown.ts — a Part of Speech/Level filter row collapsed behind a
 * summary button, rather than always-expanded chips taking up a full row.
 *
 * The chips themselves are unchanged from before — same `.pos-chip`
 * elements, same `data-pos`/`data-band` attributes the existing CSS keys
 * each one's colour off (class-filter.css's `--pos-hue-<pos>` rules) — just
 * mounted inside a popover that opens on demand, so multi-selecting several
 * values still works exactly as it did as a flat chip row, and every filter
 * that already used POS_CHIPS/BANDS keeps its colour coding for free.
 */

export interface ChipDropdownOption {
  value: string;
  label: string;
}

export interface DropdownHandle {
  /** The whole control — toggle button + its popover — ready to append. */
  wrap: HTMLElement;
  /** Re-reads `selected` and repaints the toggle's summary text and each
   *  chip's active state — call after anything outside this control (e.g.
   *  "Clear all filters") changes the selection out from under it. */
  sync: () => void;
}

export interface ChipDropdownHandle extends DropdownHandle {
  /** value -> its chip button, for a caller that repaints each one's label
   *  with a live count (word-list.ts's own POS chip counts). */
  chips: Map<string, HTMLButtonElement>;
}

/**
 * @param dataAttr Attribute name the existing CSS colours chips by —
 * 'pos' for Part of Speech, 'band' for Level. Written as `data-${dataAttr}`
 * on every non-"All" chip, matching what class-filter.css already expects.
 */
export function buildChipDropdown(
  label: string,
  dataAttr: string,
  options: readonly ChipDropdownOption[],
  selected: Set<string>,
  onChange: () => void,
): ChipDropdownHandle {
  const wrap = document.createElement('div');
  wrap.className = 'ml-chip-dropdown';

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'ml-chip-dropdown-toggle';
  wrap.appendChild(toggle);

  const panel = document.createElement('div');
  panel.className = 'ml-chip-dropdown-panel';
  panel.hidden = true;
  panel.addEventListener('click', e => e.stopPropagation());
  wrap.appendChild(panel);

  const allChip = document.createElement('button');
  allChip.type = 'button';
  allChip.className = 'pos-chip pos-chip-all';
  allChip.textContent = 'All';
  allChip.addEventListener('click', () => {
    selected.clear();
    onChange();
    sync();
  });
  panel.appendChild(allChip);

  const chipEls = new Map<string, HTMLButtonElement>();
  options.forEach(({ value, label: optLabel }) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'pos-chip';
    chip.dataset[dataAttr] = value;
    chip.textContent = optLabel;
    chip.addEventListener('click', () => {
      if (selected.has(value)) selected.delete(value); else selected.add(value);
      onChange();
      sync();
    });
    chipEls.set(value, chip);
    panel.appendChild(chip);
  });

  function sync(): void {
    allChip.classList.toggle('active', selected.size === 0);
    chipEls.forEach((chip, value) => chip.classList.toggle('active', selected.has(value)));
    if (selected.size === 0) {
      toggle.textContent = `${label}: All`;
    } else if (selected.size === 1) {
      const only = [...selected][0];
      toggle.textContent = `${label}: ${options.find(o => o.value === only)?.label ?? only}`;
    } else {
      toggle.textContent = `${label}: ${selected.size} selected`;
    }
  }
  sync();

  toggle.addEventListener('click', e => {
    e.stopPropagation();
    // Only one of these dropdowns open at a time, same as any other popover
    // family in this app — closing every sibling before opening this one
    // avoids two panels stacked on screen at once.
    document.querySelectorAll<HTMLElement>('.ml-chip-dropdown-panel').forEach(p => {
      if (p !== panel) p.hidden = true;
    });
    panel.hidden = !panel.hidden;
  });

  return { wrap, sync, chips: chipEls };
}

/** Closes every open chip dropdown — wire to the same document-level
 *  outside-click handler each panel (panel.ts/multi-panel.ts/browse-panel.ts)
 *  already runs for its own popovers. */
export function closeAllChipDropdowns(): void {
  document.querySelectorAll<HTMLElement>('.ml-chip-dropdown-panel').forEach(p => { p.hidden = true; });
}

/**
 * A plain (uncoloured) multi-select checklist behind the same kind of
 * summary-button dropdown as buildChipDropdown above — used for Folder
 * membership and Hide-from-mode, neither of which has a per-value colour to
 * preserve the way Part of Speech/Level do.
 */
export function buildChecklistDropdown(
  label: string,
  options: readonly ChipDropdownOption[],
  selected: Set<string>,
  onChange: () => void,
  footer?: HTMLElement,
): DropdownHandle {
  const wrap = document.createElement('div');
  wrap.className = 'ml-chip-dropdown';

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'ml-chip-dropdown-toggle';
  wrap.appendChild(toggle);

  const panel = document.createElement('div');
  panel.className = 'ml-chip-dropdown-panel ml-chip-dropdown-panel--checklist';
  panel.hidden = true;
  panel.addEventListener('click', e => e.stopPropagation());
  wrap.appendChild(panel);

  const checkboxes = new Map<string, HTMLInputElement>();
  options.forEach(({ value, label: optLabel }) => {
    const cbLabel = document.createElement('label');
    cbLabel.className = 'ml-chip-dropdown-item';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = selected.has(value);
    cb.addEventListener('change', () => {
      if (cb.checked) selected.add(value); else selected.delete(value);
      onChange();
      sync();
    });
    checkboxes.set(value, cb);
    cbLabel.append(cb, document.createTextNode(optLabel));
    panel.appendChild(cbLabel);
  });
  if (footer) panel.appendChild(footer);

  function sync(): void {
    checkboxes.forEach((cb, value) => { cb.checked = selected.has(value); });
    if (selected.size === 0) toggle.textContent = `${label}`;
    else if (selected.size === 1) {
      const only = [...selected][0];
      toggle.textContent = `${label}: ${options.find(o => o.value === only)?.label ?? only}`;
    } else {
      toggle.textContent = `${label}: ${selected.size}`;
    }
  }
  sync();

  toggle.addEventListener('click', e => {
    e.stopPropagation();
    document.querySelectorAll<HTMLElement>('.ml-chip-dropdown-panel').forEach(p => {
      if (p !== panel) p.hidden = true;
    });
    panel.hidden = !panel.hidden;
  });

  return { wrap, sync };
}
