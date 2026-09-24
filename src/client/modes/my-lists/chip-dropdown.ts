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

import { foldKey } from '../../utils/match.ts';

export interface ChipDropdownOption {
  value: string;
  label: string;
  /** Checklist only: consecutive options sharing a `group` sit under one
   *  small heading. The same `value` may appear under several groups (a list
   *  that belongs to two folders) — they stay ticked together. */
  group?: string;
  /** Checklist only: small trailing text, e.g. a word count. */
  hint?: string;
  /** Checklist only: a badge (e.g. a language flag) shown after the label. */
  badge?: () => HTMLElement;
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
const SEARCH_THRESHOLD = 8;

export function buildChecklistDropdown(
  label: string,
  options: readonly ChipDropdownOption[],
  selected: Set<string>,
  onChange: () => void,
  footer?: HTMLElement,
  extra?: {
    /** Group headings that exist but hold no options yet (an empty folder). */
    emptyGroups?: string[];
  },
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

  // A long list (Domain runs to ~30) gets a search box, and the options
  // scroll inside their own box so the panel never grows off-screen. The
  // footer (e.g. "+ new folder…") stays put below the scroller.
  const searchable = options.length > SEARCH_THRESHOLD;
  const scroller = document.createElement('div');
  scroller.className = 'ml-chip-dropdown-scroll';
  let search: HTMLInputElement | null = null;
  if (searchable) {
    search = document.createElement('input');
    search.type = 'search';
    search.className = 'ml-chip-dropdown-search';
    search.placeholder = `Search ${label.toLowerCase()}…`;
    search.setAttribute('aria-label', `Search ${label}`);
    panel.appendChild(search);
  }
  panel.appendChild(scroller);
  const emptyNote = document.createElement('div');
  emptyNote.className = 'ml-chip-dropdown-empty';
  emptyNote.textContent = 'No matches';
  emptyNote.hidden = true;
  scroller.appendChild(emptyNote);

  const itemEls: { el: HTMLElement; text: string }[] = [];
  interface GroupEntry { head: HTMLElement; items: HTMLElement[]; values: string[]; box: HTMLInputElement }
  const groupEls: GroupEntry[] = [];
  search?.addEventListener('input', () => {
    const q = foldKey(search!.value.trim());
    let shown = 0;
    itemEls.forEach(({ el, text }) => {
      const hit = !q || text.includes(q);
      el.hidden = !hit;
      if (hit) shown++;
    });
    groupEls.forEach(g => { g.head.hidden = !g.items.some(i => !i.hidden); });
    emptyNote.hidden = shown > 0;
  });

  const checkboxes = new Map<string, HTMLInputElement[]>();
  let lastGroup: string | undefined;
  let currentGroup: GroupEntry | null = null;
  options.forEach(({ value, label: optLabel, group, hint, badge }) => {
    if (group !== lastGroup) {
      lastGroup = group;
      currentGroup = null;
      if (group) {
        // A folder heading is itself a checkbox: tick it to select every
        // option under it at once (indeterminate while only some are).
        const head = document.createElement('label');
        head.className = 'ml-chip-dropdown-group';
        const box = document.createElement('input');
        box.type = 'checkbox';
        head.append(box, document.createTextNode(group));
        scroller.appendChild(head);
        const entry: GroupEntry = { head, items: [], values: [], box };
        box.addEventListener('change', () => {
          entry.values.forEach(v => { if (box.checked) selected.add(v); else selected.delete(v); });
          onChange();
          sync();
        });
        currentGroup = entry;
        groupEls.push(entry);
      }
    }
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
    checkboxes.set(value, [...(checkboxes.get(value) ?? []), cb]);
    const text = document.createElement('span');
    text.className = 'ml-chip-dropdown-item-text';
    text.textContent = optLabel;
    cbLabel.append(cb, text);
    if (badge) cbLabel.appendChild(badge());
    if (hint) {
      const h = document.createElement('span');
      h.className = 'ml-chip-dropdown-item-hint';
      h.textContent = hint;
      cbLabel.appendChild(h);
    }
    scroller.appendChild(cbLabel);
    itemEls.push({ el: cbLabel, text: foldKey(optLabel) });
    currentGroup?.items.push(cbLabel);
    currentGroup?.values.push(value);
  });
  // Folders that exist but have nothing in them yet: shown, so it is clear
  // they exist, but with nothing to tick.
  (extra?.emptyGroups ?? []).forEach(name => {
    const head = document.createElement('div');
    head.className = 'ml-chip-dropdown-group ml-chip-dropdown-group--empty';
    head.textContent = `${name} (empty)`;
    scroller.appendChild(head);
  });
  if (footer) panel.appendChild(footer);

  function sync(): void {
    checkboxes.forEach((cbs, value) => cbs.forEach(cb => { cb.checked = selected.has(value); }));
    groupEls.forEach(g => {
      const on = g.values.filter(v => selected.has(v)).length;
      g.box.checked = g.values.length > 0 && on === g.values.length;
      g.box.indeterminate = on > 0 && on < g.values.length;
    });
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
    if (!panel.hidden) search?.focus();
  });

  return { wrap, sync };
}
