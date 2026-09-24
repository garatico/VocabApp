/**
 * chip-filter.ts — a filter-bar field that opens a panel of coloured toggle
 * chips (POS, Band, Domain). A trigger button shows "All" or a count of
 * what's picked. The chips use the same --pos-hue formula as the main app's
 * own .pos-chip, so more than one value can narrow the list at once and it
 * reads as "the same colours as the app".
 */

import type { ChipOption } from './types.ts';

export interface ChipFilterHandle {
  /** The `.filter-field` to place in the filter bar. */
  el: HTMLElement;
  setOptions(options: ChipOption[]): void;
  getSelected(): string[];
  clear(): void;
}

export function buildChipFilter(cfg: {
  /** Stem used to build ids: `${idPrefix}${stem}FilterField` etc. */
  stem: string;
  idPrefix: string;
  label: string;
  hueAttrName: 'data-pos' | 'data-band' | 'data-domain';
  onChange: () => void;
}): ChipFilterHandle {
  const { stem, idPrefix: p, label, hueAttrName, onChange } = cfg;

  const field = document.createElement('div');
  field.className = 'filter-field filter-chip-field';
  field.id = `${p}${stem}FilterField`;
  field.innerHTML = `
    <button type="button" class="filter-chip-trigger" id="${p}${stem}FilterTrigger" aria-haspopup="true" aria-expanded="false">
      <span class="filter-label">${label}</span>
      <span class="filter-chip-trigger-value" id="${p}${stem}FilterSummary">All</span>
      <span class="filter-chip-caret">▾</span>
    </button>
    <div class="filter-chip-panel" id="${p}${stem}FilterPanel" hidden></div>
  `;
  const trigger = field.querySelector<HTMLButtonElement>('.filter-chip-trigger') as HTMLButtonElement;
  const panel   = field.querySelector<HTMLElement>('.filter-chip-panel') as HTMLElement;
  const summary = field.querySelector<HTMLElement>('.filter-chip-trigger-value') as HTMLElement;

  let options: ChipOption[] = [];
  const selected = new Set<string>();

  function updateSummary(): void {
    const active = selected.size > 0;
    summary.classList.toggle('filter-chip-trigger-value--active', active);
    if (!active) { summary.textContent = 'All'; return; }
    if (selected.size === 1) {
      const value = [...selected][0];
      summary.textContent = options.find(o => o.value === value)?.label ?? value;
    } else {
      summary.textContent = `${selected.size} selected`;
    }
  }

  function render(): void {
    panel.innerHTML = '';
    options.forEach(opt => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'filter-chip' + (selected.has(opt.value) ? ' active' : '');
      chip.setAttribute(hueAttrName, opt.value);
      chip.textContent = opt.label;
      chip.addEventListener('click', () => {
        if (selected.has(opt.value)) selected.delete(opt.value); else selected.add(opt.value);
        chip.classList.toggle('active');
        updateSummary();
        onChange();
      });
      panel.appendChild(chip);
    });
    const footer = document.createElement('div');
    footer.className = 'filter-chip-panel-footer';
    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'filter-chip-panel-clear';
    clearBtn.textContent = 'Clear';
    clearBtn.addEventListener('click', clear);
    footer.appendChild(clearBtn);
    panel.appendChild(footer);
  }

  function open(): void  { panel.hidden = false; trigger.setAttribute('aria-expanded', 'true'); }
  function close(): void { panel.hidden = true;  trigger.setAttribute('aria-expanded', 'false'); }

  trigger.addEventListener('click', () => { if (panel.hidden) open(); else close(); });
  document.addEventListener('click', e => { if (!field.contains(e.target as Node)) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) close(); });

  function clear(): void {
    if (selected.size === 0) return;
    selected.clear();
    render();
    updateSummary();
    onChange();
  }

  return {
    el: field,
    setOptions(next) { options = next; render(); updateSummary(); },
    getSelected()    { return [...selected]; },
    clear,
  };
}
