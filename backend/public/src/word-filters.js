/**
 * word-filters.js
 *
 * Renders filter controls populated dynamically from the loaded word list,
 * and exports a filterWords() function used by start-handler.js.
 *
 * Filters available:
 *   - Domain        (from word.domains[])
 *   - CEFR band     (from word.frequency.band)
 *   - Difficulty    (from word.difficulty  1–5)
 *   - Register      (from word.linguistic.register)
 */

const CEFR_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

// Track which filter groups were actually rendered so filterWords() knows
// which filters are active.
const renderedFilters = new Set();

// ── Build filter UI from word data ────────────────────────────────────────────
//
// allWords  – the complete loaded list (used to populate checkbox options)
// baseList  – the current sliced/class-filtered list (used to pre-check only
//             the values present in the active set; defaults to allWords)
// containerId – defaults to 'wordFilters'

export function buildFilterUI(allWords, baseList = allWords, containerId = 'wordFilters') {
  const container = document.getElementById(containerId);
  if (!container) return;

  // Get the content div if it exists (for the new collapsible structure)
  let contentDiv = document.getElementById('filterContent');
  const hasHeader = !!contentDiv;

  if (!contentDiv) {
    // Fallback for old structure without header - clear entire container
    container.innerHTML = '';
    contentDiv = container;
  } else {
    // New structure - only clear the content div
    contentDiv.innerHTML = '';
  }

  renderedFilters.clear();

  // Collect unique values across the FULL word list (for option population)
  const domains      = new Set();
  const bands        = new Set();
  const difficulties = new Set();
  const registers    = new Set();

  allWords.forEach(w => {
    (w.domains || []).forEach(d => domains.add(d));
    if (w.frequency?.band)      bands.add(w.frequency.band);
    if (w.difficulty != null)   difficulties.add(w.difficulty);
    if (w.linguistic?.register) registers.add(w.linguistic.register);
  });

  // Collect values present in the active slice (for pre-checking checkboxes)
  const activeValues = getActiveValues(baseList);

  // Always render a group if there's at least one value — even a single option
  // keeps the UI stable and shows the user what's in their set.
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
    const labels = {
      1: '1 – Beginner',
      2: '2 – Elementary',
      3: '3 – Intermediate',
      4: '4 – Advanced',
      5: '5 – Expert',
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

  // Control visibility based on whether there are any filter groups
  const filterCount = contentDiv.querySelectorAll('.filter-group').length;
  container.style.display = filterCount > 0 ? '' : 'none';
}

// Returns sets of string values present in a given word list (for pre-checking)
function getActiveValues(words) {
  const domains      = new Set();
  const bands        = new Set();
  const difficulties = new Set();
  const registers    = new Set();

  words.forEach(w => {
    (w.domains || []).forEach(d => domains.add(d));
    if (w.frequency?.band)      bands.add(w.frequency.band);
    if (w.difficulty != null)   difficulties.add(String(w.difficulty));
    if (w.linguistic?.register) registers.add(w.linguistic.register);
  });

  return { domains, bands, difficulties, registers };
}

function buildCheckboxGroup({ id, label, values, labels = {}, activeValues = new Set() }) {
  const group = document.createElement('div');
  group.className = 'filter-group';
  group.dataset.filterId = id;

  const heading = document.createElement('div');
  heading.className = 'filter-group-heading';

  const labelEl = document.createElement('span');
  labelEl.textContent = label;

  const allBtn = document.createElement('button');
  allBtn.type        = 'button';
  allBtn.textContent = 'All';
  allBtn.className   = 'filter-toggle-btn';
  allBtn.addEventListener('click', () =>
    group.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = true)
  );

  const noneBtn = document.createElement('button');
  noneBtn.type        = 'button';
  noneBtn.textContent = 'None';
  noneBtn.className   = 'filter-toggle-btn';
  noneBtn.addEventListener('click', () =>
    group.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false)
  );

  heading.appendChild(labelEl);
  heading.appendChild(allBtn);
  heading.appendChild(noneBtn);
  group.appendChild(heading);

  values.forEach(val => {
    const lbl = document.createElement('label');
    lbl.className = 'filter-option';

    const cb = document.createElement('input');
    cb.type           = 'checkbox';
    cb.value          = String(val);
    // Pre-check values present in the active slice.
    // If activeValues is empty (edge case), default everything to checked.
    cb.checked        = activeValues.size === 0 || activeValues.has(String(val));
    cb.dataset.filter = id;

    lbl.appendChild(cb);
    lbl.appendChild(document.createTextNode(' ' + (labels[val] ?? val)));
    group.appendChild(lbl);
  });

  return group;
}

// ── Read current filter state ─────────────────────────────────────────────────

function getChecked(filterId) {
  return Array.from(
    document.querySelectorAll(`input[data-filter="${filterId}"]:checked`)
  ).map(cb => cb.value);
}

export function getFilterState() {
  return {
    domains:      renderedFilters.has('filterDomain')
                    ? getChecked('filterDomain')
                    : [],
    bands:        renderedFilters.has('filterBand')
                    ? getChecked('filterBand')
                    : [],
    difficulties: renderedFilters.has('filterDifficulty')
                    ? getChecked('filterDifficulty').map(Number)
                    : [],
    registers:    renderedFilters.has('filterRegister')
                    ? getChecked('filterRegister')
                    : [],
  };
}

// ── Apply filters to a word list ──────────────────────────────────────────────

export function filterWords(words) {
  const { domains, bands, difficulties, registers } = getFilterState();

  return words.filter(w => {
    if (domains.length > 0) {
      const wordDomains = w.domains || [];
      if (!wordDomains.some(d => domains.includes(d))) return false;
    }

    if (bands.length > 0) {
      if (!bands.includes(w.frequency?.band)) return false;
    }

    if (difficulties.length > 0) {
      if (!difficulties.includes(w.difficulty)) return false;
    }

    if (registers.length > 0) {
      const reg = w.linguistic?.register;
      if (!reg || !registers.includes(reg)) return false;
    }

    return true;
  });
}
