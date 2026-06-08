/**
 * domain-filter.ts
 *
 * Domain filter UI:
 *  - Top 10 domains by word count shown as alphabetically-sorted pills
 *  - Remaining domains in a scrollable dropdown with live search
 *  - Selected domains shown as removable chips
 */

const TOP_N = 10;

const selected = new Set<string>();

// All domains sorted by count (populated by updateDomainFilter)
let allByCount: { domain: string; count: number }[] = [];
// Top-10 pill domains (alphabetical order)
let pillDomains: string[] = [];
// The rest go in the dropdown
let dropdownDomains: string[] = [];

let countEl:       HTMLElement | null      = null;
let clearBtn:      HTMLElement | null      = null;
let pillsEl:       HTMLElement | null      = null;
let searchInput:   HTMLInputElement | null = null;
let dropdownEl:    HTMLElement | null      = null;
let chipsEl:       HTMLElement | null      = null;

function fmt(d: string): string {
  return d.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
}

// ── Rendering ──────────────────────────────────────────────────────────────────

function renderPills(): void {
  if (!pillsEl) return;
  pillsEl.innerHTML = '';
  for (const d of pillDomains) {
    const entry = allByCount.find(x => x.domain === d);
    const btn = document.createElement('button');
    btn.type      = 'button';
    btn.className = 'domain-qpick' + (selected.has(d) ? ' active' : '');

    const label = document.createElement('span');
    label.textContent = fmt(d);
    btn.appendChild(label);

    if (entry) {
      const badge = document.createElement('span');
      badge.className   = 'domain-qpick-count';
      badge.textContent = String(entry.count);
      btn.appendChild(badge);
    }

    btn.addEventListener('click', () => {
      if (selected.has(d)) selected.delete(d);
      else                  selected.add(d);
      renderPills();
      renderChips();
      updateHeader();
    });
    pillsEl.appendChild(btn);
  }
}

function renderChips(): void {
  if (!chipsEl) return;
  if (selected.size === 0) { chipsEl.hidden = true; return; }
  chipsEl.hidden   = false;
  chipsEl.innerHTML = '';
  for (const d of selected) {
    const chip = document.createElement('span');
    chip.className = 'domain-chip';
    chip.appendChild(document.createTextNode(fmt(d)));
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'domain-chip-x';
    x.setAttribute('aria-label', 'Remove ' + fmt(d));
    x.textContent = '×';
    x.addEventListener('click', () => { selected.delete(d); renderAll(); });
    chip.appendChild(x);
    chipsEl.appendChild(chip);
  }
}

let orBadgeEl: HTMLElement | null = null;

function updateHeader(): void {
  if (countEl) countEl.textContent = selected.size > 0 ? '(' + selected.size + ')' : '';
  if (clearBtn) (clearBtn as HTMLElement).style.display = selected.size > 0 ? '' : 'none';
  if (orBadgeEl) orBadgeEl.style.display = selected.size > 1 ? '' : 'none';
}

function renderAll(): void {
  renderPills();
  renderChips();
  updateHeader();
}

// ── Dropdown ───────────────────────────────────────────────────────────────────

function showDropdown(query: string): void {
  if (!dropdownEl) return;
  const q = query.trim().toLowerCase();

  let pool: { domain: string; count: number }[];
  if (q) {
    // All non-selected domains, ranked: starts-with first, then contains
    const candidates = allByCount.filter(({ domain }) => !selected.has(domain));
    const startsWith = candidates.filter(({ domain }) =>
      fmt(domain).toLowerCase().startsWith(q)
    );
    const contains = candidates.filter(({ domain }) => {
      const label = fmt(domain).toLowerCase();
      return !label.startsWith(q) && label.includes(q);
    });
    pool = [...startsWith, ...contains];
  } else {
    // Empty query: full list of all non-selected domains, alphabetical
    pool = allByCount
      .filter(({ domain }) => !selected.has(domain))
      .slice()
      .sort((a, b) => a.domain.localeCompare(b.domain));
  }

  if (pool.length === 0) { hideDropdown(); return; }

  dropdownEl.innerHTML = '';
  for (const { domain, count } of pool) {
    const item = document.createElement('div');
    item.className      = 'domain-suggestion';
    item.dataset.domain = domain;

    const name = document.createElement('span');
    name.textContent = fmt(domain);
    item.appendChild(name);

    const badge = document.createElement('span');
    badge.className   = 'domain-suggestion-count';
    badge.textContent = String(count);
    item.appendChild(badge);

    item.addEventListener('mousedown', e => { e.preventDefault(); addDomain(domain); });
    dropdownEl.appendChild(item);
  }
  dropdownEl.hidden = false;
}

function hideDropdown(): void {
  if (dropdownEl) { dropdownEl.hidden = true; dropdownEl.innerHTML = ''; }
}

function addDomain(d: string): void {
  selected.add(d);
  if (searchInput) searchInput.value = '';
  hideDropdown();
  renderAll();
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Called after vocabulary loads (or language changes) with live domain counts.
 * Recomputes which domains are pills vs dropdown.
 */
export function updateDomainFilter(counts: { domain: string; count: number }[]): void {
  allByCount = counts;

  // Top N by count → sort alphabetically for display
  pillDomains = counts
    .slice(0, TOP_N)
    .map(x => x.domain)
    .sort((a, b) => a.localeCompare(b));

  // Everything else → alphabetical for dropdown
  const pillSet = new Set(pillDomains);
  dropdownDomains = counts
    .slice(TOP_N)
    .map(x => x.domain)
    .sort((a, b) => a.localeCompare(b));

  // Remove any selected domains that no longer exist in the new language
  const allKnown = new Set(counts.map(x => x.domain));
  for (const d of selected) {
    if (!allKnown.has(d)) selected.delete(d);
  }

  renderAll();
}

export function bindDomainFilter(): void {
  const body = document.getElementById('domainFilterBody');
  if (!body) return;

  countEl  = document.getElementById('domainFilterCount');
  clearBtn = document.getElementById('clearAllDomains');

  // OR logic badge — injected after the count element
  orBadgeEl           = document.createElement('span');
  orBadgeEl.id        = 'domainOrBadge';
  orBadgeEl.textContent = 'OR';
  orBadgeEl.title     = 'Words matching any selected domain are shown';
  orBadgeEl.style.display = 'none';
  countEl?.insertAdjacentElement('afterend', orBadgeEl);

  // Pills row
  pillsEl        = document.createElement('div');
  pillsEl.id     = 'domainQuickPicks';
  body.appendChild(pillsEl);

  // Search + dropdown
  const searchWrap     = document.createElement('div');
  searchWrap.className = 'domain-search-wrap';

  searchInput             = document.createElement('input');
  searchInput.type        = 'text';
  searchInput.id          = 'domainSearchInput';
  searchInput.placeholder = 'More domains…';
  searchInput.autocomplete = 'off';
  searchInput.spellcheck  = false;

  dropdownEl        = document.createElement('div');
  dropdownEl.id     = 'domainSuggestions';
  dropdownEl.hidden = true;

  searchWrap.appendChild(searchInput);
  searchWrap.appendChild(dropdownEl);
  body.appendChild(searchWrap);

  // Selected chips
  chipsEl        = document.createElement('div');
  chipsEl.id     = 'domainChips';
  chipsEl.hidden = true;
  body.appendChild(chipsEl);

  // Events
  searchInput.addEventListener('input',  () => showDropdown(searchInput!.value));
  searchInput.addEventListener('focus',  () => showDropdown(searchInput!.value));
  searchInput.addEventListener('blur',   () => setTimeout(hideDropdown, 150));

  searchInput.addEventListener('keydown', (e: KeyboardEvent) => {
    if (!dropdownEl || dropdownEl.hidden) return;
    const items = dropdownEl.querySelectorAll<HTMLElement>('.domain-suggestion');
    if (!items.length) return;
    const active = dropdownEl.querySelector<HTMLElement>('.domain-suggestion.highlighted');
    const idx    = active ? [...items].indexOf(active) : -1;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      active?.classList.remove('highlighted');
      const next = items[Math.min(idx + 1, items.length - 1)];
      next.classList.add('highlighted');
      next.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      active?.classList.remove('highlighted');
      if (idx > 0) { items[idx - 1].classList.add('highlighted'); items[idx - 1].scrollIntoView({ block: 'nearest' }); }
    } else if (e.key === 'Enter') {
      const target = active || dropdownEl.querySelector<HTMLElement>('.domain-suggestion');
      if (target?.dataset.domain) addDomain(target.dataset.domain);
    } else if (e.key === 'Escape') {
      hideDropdown(); searchInput!.value = '';
    }
  });

  clearBtn?.addEventListener('click', () => { selected.clear(); renderAll(); });
  renderAll();
}

export function getSelectedDomains(): string[] {
  return [...selected];
}
