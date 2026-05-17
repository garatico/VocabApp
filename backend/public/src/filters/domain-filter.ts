/**
 * domain-filter.ts  (v2 — chip/tag UI)
 *
 * Replaces the checkbox grid with:
 *  - Quick-pick buttons for the most common domains
 *  - A search input with live suggestion dropdown (constrained to ALL_DOMAINS)
 *  - Removable chip tags for active domain filters
 *
 * Semantics (same as v1 from the caller's perspective):
 *   empty array  → no filter applied (all words pass)
 *   non-empty    → whitelist — only words in those domains (or no domain) pass
 *
 * Public API (unchanged):
 *   bindDomainFilter()   – call once on init; builds the UI
 *   getSelectedDomains() – returns string[] of active domain values
 */

const ALL_DOMAINS: readonly string[] = [
  // Mind & Character
  'ability','clarity','cognition','confidence','desire','emotion',
  'feelings','hope','impression','mind','perception','potential','truth',
  // People & Society
  'age','business','communication','education','identity','language',
  'law','learning','security','work',
  // Body & Physical
  'aesthetics','appearance','cleanliness','clothes','drinks','food',
  'health','height','medical','physical_state','senses','size',
  'speed','strength','temperature',
  // Nature & Living
  'animals','nature',
  // World & Action
  'events','existence','location','movement','occurrence','state',
  'transport','travel',
  // Abstract & Logic
  'condition','distinction','freedom','importance','necessity',
  'obligation','possibility','quality','quantity','simplicity',
  // Exchange & Value
  'giving','ownership','possession','request','search','transaction',
  'wealth','general',
];

const QUICK_PICKS: readonly string[] = [
  'animals','food','drinks','nature','emotion',
  'work','travel','clothes','health',
];

/** Active domain whitelist — empty Set = no filter (all words pass). */
const selected = new Set<string>();

/** Capitalise and un-underscore a domain key for display. */
function fmt(d: string): string {
  return d.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
}

// ── Module-level element refs (set in bindDomainFilter) ──────────────────────

let countEl:      HTMLElement | null      = null;
let clearBtn:     HTMLElement | null      = null;
let quickPicksEl: HTMLElement | null      = null;
let searchInput:  HTMLInputElement | null = null;
let suggestionsEl: HTMLElement | null     = null;
let chipsEl:      HTMLElement | null      = null;
let activeIdx = -1;

// ── Render helpers ────────────────────────────────────────────────────────────

function renderAll(): void {
  renderQuickPicks();
  renderChips();
  updateHeader();
}

function updateHeader(): void {
  if (countEl) countEl.textContent = selected.size > 0 ? '(' + selected.size + ')' : '';
  if (clearBtn) (clearBtn as HTMLElement).style.display = selected.size > 0 ? '' : 'none';
}

function renderQuickPicks(): void {
  if (!quickPicksEl) return;
  quickPicksEl.innerHTML = '';
  for (const d of QUICK_PICKS) {
    const btn = document.createElement('button');
    btn.type      = 'button';
    btn.className = 'domain-qpick' + (selected.has(d) ? ' active' : '');
    btn.textContent = fmt(d);
    btn.addEventListener('click', () => {
      if (selected.has(d)) selected.delete(d);
      else                  selected.add(d);
      renderAll();
    });
    quickPicksEl.appendChild(btn);
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
    const label = document.createTextNode(fmt(d));
    const x = document.createElement('button');
    x.type      = 'button';
    x.className = 'domain-chip-x';
    x.setAttribute('aria-label', 'Remove ' + fmt(d));
    x.textContent = '×';
    x.addEventListener('click', () => { selected.delete(d); renderAll(); });
    chip.appendChild(label);
    chip.appendChild(x);
    chipsEl.appendChild(chip);
  }
}

// ── Suggestion dropdown ───────────────────────────────────────────────────────

function showSuggestions(query: string): void {
  activeIdx = -1;
  const q = query.trim().toLowerCase();
  if (!q) { hideSuggestions(); return; }

  const matches = ALL_DOMAINS
    .filter(d => !selected.has(d) && fmt(d).toLowerCase().includes(q))
    .slice(0, 8);

  if (matches.length === 0) { hideSuggestions(); return; }

  suggestionsEl!.innerHTML = '';
  for (const d of matches) {
    const item = document.createElement('div');
    item.className      = 'domain-suggestion';
    item.textContent    = fmt(d);
    item.dataset.domain = d;
    item.addEventListener('mousedown', e => { e.preventDefault(); addDomain(d); });
    suggestionsEl!.appendChild(item);
  }
  suggestionsEl!.hidden = false;
}

function hideSuggestions(): void {
  if (suggestionsEl) { suggestionsEl.hidden = true; suggestionsEl.innerHTML = ''; }
  activeIdx = -1;
}

function moveSuggestion(dir: number): void {
  if (!suggestionsEl) return;
  const items = suggestionsEl.querySelectorAll<HTMLElement>('.domain-suggestion');
  if (!items.length) return;
  if (activeIdx >= 0) items[activeIdx].classList.remove('highlighted');
  activeIdx = Math.max(-1, Math.min(items.length - 1, activeIdx + dir));
  if (activeIdx >= 0) {
    items[activeIdx].classList.add('highlighted');
    items[activeIdx].scrollIntoView({ block: 'nearest' });
  }
}

function addDomain(d: string): void {
  selected.add(d);
  if (searchInput) searchInput.value = '';
  hideSuggestions();
  renderAll();
}

// ── Public API ────────────────────────────────────────────────────────────────

export function bindDomainFilter(): void {
  const body = document.getElementById('domainFilterBody');
  if (!body) return;

  countEl  = document.getElementById('domainFilterCount');
  clearBtn = document.getElementById('clearAllDomains');

  quickPicksEl       = document.createElement('div');
  quickPicksEl.id    = 'domainQuickPicks';
  body.appendChild(quickPicksEl);

  const searchWrap       = document.createElement('div');
  searchWrap.className   = 'domain-search-wrap';

  searchInput             = document.createElement('input');
  searchInput.type        = 'text';
  searchInput.id          = 'domainSearchInput';
  searchInput.placeholder = 'Search domains…';
  searchInput.autocomplete = 'off';
  searchInput.spellcheck  = false;

  suggestionsEl        = document.createElement('div');
  suggestionsEl.id     = 'domainSuggestions';
  suggestionsEl.hidden = true;

  searchWrap.appendChild(searchInput);
  searchWrap.appendChild(suggestionsEl);
  body.appendChild(searchWrap);

  chipsEl        = document.createElement('div');
  chipsEl.id     = 'domainChips';
  chipsEl.hidden = true;
  body.appendChild(chipsEl);

  searchInput.addEventListener('input', () => showSuggestions(searchInput!.value));

  searchInput.addEventListener('keydown', (e: KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); moveSuggestion(+1); break;
      case 'ArrowUp':   e.preventDefault(); moveSuggestion(-1); break;
      case 'Enter': {
        const hi    = suggestionsEl!.querySelector<HTMLElement>('.domain-suggestion.highlighted');
        const first = suggestionsEl!.querySelector<HTMLElement>('.domain-suggestion');
        const target = hi || first;
        if (target?.dataset.domain) addDomain(target.dataset.domain);
        break;
      }
      case 'Escape':
        hideSuggestions();
        searchInput!.value = '';
        break;
    }
  });

  searchInput.addEventListener('blur', () => setTimeout(hideSuggestions, 150));

  clearBtn?.addEventListener('click', () => { selected.clear(); renderAll(); });

  renderAll();
}

export function getSelectedDomains(): string[] {
  return [...selected];
}
