/**
 * word-filters.ts
 *
 * Renders filter controls populated dynamically from the loaded word list,
 * and exports filterWords() used by start-handler.
 */

import type { Word } from '../types.js';

const CEFR_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;

export interface FilterState {
  domains:      string[];
  bands:        string[];
  difficulties: number[];
  registers:    string[];
}

interface ActiveValues {
  domains:      Set<string>;
  bands:        Set<string>;
  difficulties: Set<string>;
  registers:    Set<string>;
}

interface CheckboxGroupOptions {
  id:           string;
  label:        string;
  values:       (string | number)[];
  labels?:      Record<string | number, string>;
  activeValues?: Set<string>;
}

const renderedFilters = new Set<string>();

export function buildFilterUI(
  allWords:    Word[],
  baseList:    Word[] = allWords,
  containerId: string = 'wordFilters',
): void {
  const container = document.getElementById(containerId);
  if (!container) return;

  let contentDiv = document.getElementById('filterContent');
  if (!contentDiv) {
    container.innerHTML = '';
    contentDiv = container;
  } else {
    contentDiv.innerHTML = '';
  }

  renderedFilters.clear();

  const domains      = new Set<string>();
  const bands        = new Set<string>();
  const difficulties = new Set<number>();
  const registers    = new Set<string>();

  allWords.forEach(w => {
    (w.domains ?? []).forEach(d => domains.add(d));
    if (w.frequency?.band)      bands.add(w.frequency.band);
    if (w.difficulty != null)   difficulties.add(w.difficulty as unknown as number);
    if (w.linguistic?.register) registers.add(w.linguistic.register);
  });

  const activeValues = getActiveValues(baseList);

  if (domains.size > 0) {
    contentDiv.appendChild(buildCheckboxGroup({
      id:           'filterDomain',
      label:        'Domain',
      values:       [...domains].sort(),
      activeValues: activeValues.domains,
    }));
    renderedFilters.add('filterDomain');
  }

  if (bands.size > 0) {
    const sorted = CEFR_ORDER.filter(b => bands.has(b));
    contentDiv.appendChild(buildCheckboxGroup({
      id:           'filterBand',
      label:        'CEFR Level',
      values:       sorted,
      activeValues: activeValues.bands,
    }));
    renderedFilters.add('filterBand');
  }

  if (difficulties.size > 0) {
    const labels: Record<number, string> = {
      1: '1 – Beginner', 2: '2 – Elementary', 3: '3 – Intermediate',
      4: '4 – Advanced', 5: '5 – Expert',
    };
    const sorted = [...difficulties].sort((a, b) => a - b);
    contentDiv.appendChild(buildCheckboxGroup({
      id:           'filterDifficulty',
      label:        'Difficulty',
      values:       sorted,
      labels:       labels,
      activeValues: activeValues.difficulties,
    }));
    renderedFilters.add('filterDifficulty');
  }

  if (registers.size > 0) {
    contentDiv.appendChild(buildCheckboxGroup({
      id:           'filterRegister',
      label:        'Register',
      values:       [...registers].sort(),
      activeValues: activeValues.registers,
    }));
    renderedFilters.add('filterRegister');
  }

  const filterCount = contentDiv.querySelectorAll('.filter-group').length;
  container.style.display = filterCount > 0 ? '' : 'none';
}

function getActiveValues(words: Word[]): ActiveValues {
  const domains      = new Set<string>();
  const bands        = new Set<string>();
  const difficulties = new Set<string>();
  const registers    = new Set<string>();

  words.forEach(w => {
    (w.domains ?? []).forEach(d => domains.add(d));
    if (w.frequency?.band)      bands.add(w.frequency.band);
    if (w.difficulty != null)   difficulties.add(String(w.difficulty));
    if (w.linguistic?.register) registers.add(w.linguistic.register);
  });

  return { domains, bands, difficulties, registers };
}

function buildCheckboxGroup({
  id, label, values, labels = {}, activeValues = new Set<string>(),
}: CheckboxGroupOptions): HTMLDivElement {
  const group = document.createElement('div');
  group.className = 'filter-group';
  group.dataset.filterId = id;

  const heading = document.createElement('div');
  heading.className = 'filter-group-heading';

  const labelEl = document.createElement('span');
  labelEl.textContent = label;

  const allBtn = document.createElement('button');
  allBtn.type = 'button'; allBtn.textContent = 'All'; allBtn.className = 'filter-toggle-btn';
  allBtn.addEventListener('click', () =>
    group.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach(cb => { cb.checked = true; })
  );

  const noneBtn = document.createElement('button');
  noneBtn.type = 'button'; noneBtn.textContent = 'None'; noneBtn.className = 'filter-toggle-btn';
  noneBtn.addEventListener('click', () =>
    group.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach(cb => { cb.checked = false; })
  );

  heading.appendChild(labelEl);
  heading.appendChild(allBtn);
  heading.appendChild(noneBtn);
  group.appendChild(heading);

  values.forEach(val => {
    const lbl = document.createElement('label');
    lbl.className = 'filter-option';
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.value = String(val);
    cb.checked = activeValues.size === 0 || activeValues.has(String(val));
    cb.dataset.filter = id;
    lbl.appendChild(cb);
    lbl.appendChild(document.createTextNode(' ' + (labels[val] ?? val)));
    group.appendChild(lbl);
  });

  return group;
}

function getChecked(filterId: string): string[] {
  return Array.from(
    document.querySelectorAll<HTMLInputElement>(`input[data-filter="${filterId}"]:checked`)
  ).map(cb => cb.value);
}

export function getFilterState(): FilterState {
  return {
    domains:      renderedFilters.has('filterDomain')     ? getChecked('filterDomain')                    : [],
    bands:        renderedFilters.has('filterBand')        ? getChecked('filterBand')                      : [],
    difficulties: renderedFilters.has('filterDifficulty') ? getChecked('filterDifficulty').map(Number)    : [],
    registers:    renderedFilters.has('filterRegister')   ? getChecked('filterRegister')                  : [],
  };
}

export function filterWords(words: Word[]): Word[] {
  const { domains, bands, difficulties, registers } = getFilterState();
  return words.filter(w => {
    if (domains.length > 0) {
      const wordDomains = w.domains ?? [];
      if (!wordDomains.some(d => domains.includes(d))) return false;
    }
    if (bands.length > 0) {
      if (!w.frequency?.band || !bands.includes(w.frequency.band)) return false;
    }
    if (difficulties.length > 0) {
      if (!difficulties.includes(w.difficulty as unknown as number)) return false;
    }
    if (registers.length > 0) {
      const reg = w.linguistic?.register;
      if (!reg || !registers.includes(reg)) return false;
    }
    return true;
  });
}
