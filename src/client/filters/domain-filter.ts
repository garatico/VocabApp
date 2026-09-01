/**
 * domain-filter.ts
 *
 * Domain filter UI:
 *  - Top 10 domains by word count shown as alphabetically-sorted pills
 *  - Remaining domains in a scrollable dropdown with live search
 *  - Selected domains shown as removable chips
 *
 * The selection is a working Set kept in step with storage: every change ends
 * in renderAll(), so that is where it is written back, and loadFromBucket()
 * refills it whenever the language, the mode or the chain moves which bucket
 * this filter is reading.
 */

import { currentLangValue } from './filter-lang.ts';
import { bucketFor, bucketForRead, type Bucket } from './filter-state.ts';
import {
  bindFilterHeader, syncFilterHeader, type FilterHeaderConfig,
} from './filter-header.ts';
import { Settings } from '../settings.ts';
import { getCurrentMode } from '../ui/ui-state.ts';

const TOP_N = 10;

const selected = new Set<string>();
/** Whether the filter is applied. Stored with the selection, not beside it. */
let active = true;

import { readJson, readString, writeJson, isRecord } from '../utils/storage.ts';
const KEY_PREFIX = 'vq_domainfilter_';

export interface DomainFilterState { active: boolean; selected: string[] }

function key(lang: string, bucket: Bucket): string {
  return `${KEY_PREFIX}${lang.toLowerCase()}__${bucket}`;
}

function readBucket(lang: string, bucket: Bucket): DomainFilterState {
  const parsed = readJson<DomainFilterState | null>(key(lang, bucket), null, isRecord);
  if (parsed && Array.isArray(parsed.selected)) {
    return { active: parsed.active !== false, selected: parsed.selected };
  }
  return { active: true, selected: [] };
}

/** Write the working set back. Called from renderAll, which every change ends in. */
function persist(): void {
  writeJson(key(currentLangValue(), bucketFor('domain')), { active, selected: [...selected] });
}

function copyState(from: Bucket, to: Bucket): void {
  const lang  = currentLangValue();
  const state = readBucket(lang, from);
  writeJson(key(lang, to), { ...state, selected: [...state.selected] });
}

const header: FilterHeaderConfig = {
  id:          'domain',
  activeBtnId: 'domainFilterActive',
  chainBtnId:  'domainFilterChain',
  noteId:      'domainFilterChainNote',
  isActive:    () => active,
  setActive:   on => { active = on; persist(); },
  copyState,
  onChange:    () => { loadFromBucket(); renderAll(); },
};

// All domains sorted by count (populated by updateDomainFilter)
let allByCount: { domain: string; count: number }[] = [];
// Top-10 pill domains (alphabetical order)
let pillDomains: string[] = [];
// The rest go in the dropdown

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

    btn.addEventListener('click', () => changeSelection(() => {
      if (selected.has(d)) selected.delete(d);
      else                 selected.add(d);
    }));
    pillsEl.appendChild(btn);
  }
}

function renderChips(): void {
  if (!chipsEl) return;
  // Emptied as well as hidden: leaving the old chips in the DOM meant a
  // selection cleared by a mode switch was one CSS slip away from still
  // being on screen.
  if (selected.size === 0) { chipsEl.hidden = true; chipsEl.innerHTML = ''; return; }
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
    x.addEventListener('click', () => changeSelection(() => selected.delete(d)));
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
  syncFilterHeader(header);
  // Every mutation of `selected` ends here, so this is the one place the
  // working set has to be written back.
  persist();
}

/**
 * Change the selection and make the change stick.
 *
 * Every mutation of `selected` goes through here. That used to be a convention
 * — "every change ends in renderAll()" — and the Top-10 pills quietly broke it:
 * their click handler open-coded renderAll's first three lines and left off the
 * `persist()`. So picking a domain from a pill drew correctly and stored
 * nothing, which meant it did not survive a mode switch, did not follow the
 * chain to a linked mode, and was gone on reload. Removing the same domain
 * again *did* persist, because the chip's × button called renderAll — so the
 * filter appeared to work intermittently, which is the hardest kind of broken
 * to report.
 *
 * A convention that four call sites keep and one forgets is not a convention.
 * This is the same rule with somewhere to put it.
 */
function changeSelection(mutate: () => void): void {
  mutate();
  renderAll();
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
  if (searchInput) searchInput.value = '';
  hideDropdown();
  changeSelection(() => selected.add(d));
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

  // Everything else → alphabetical for dropdown (computed inline where needed)

  // This fires on a language change, so the in-memory set still holds the
  // previous language's domains. Reload before pruning, or the prune would
  // write the old language's selections into the new one's bucket.
  loadFromBucket();

  // Remove any selected domains that do not exist in this language
  const allKnown = new Set(counts.map(x => x.domain));
  changeSelection(() => {
    for (const d of selected) {
      if (!allKnown.has(d)) selected.delete(d);
    }
  });
}

/**
 * Re-read the selection for the current language and bucket.
 *
 * Called on a language change, a mode change and either header button, since
 * all four can move which bucket this filter is reading from.
 */
export function loadFromBucket(): void {
  const lang  = currentLangValue();
  const state = readBucket(lang, bucketForRead('domain', b => readString(key(lang, b)) !== null));
  selected.clear();
  state.selected.forEach(d => selected.add(d));
  active = state.active;
}

/** Re-read and repaint after a mode change. */
export function reloadDomainFilter(): void {
  loadFromBucket();
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
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  searchInput.addEventListener('input',  () => showDropdown(searchInput!.value)); // searchInput is non-null: we're inside a block guarded by its existence
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
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
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      hideDropdown(); searchInput!.value = ''; // searchInput is the element we just attached this listener to
    }
  });

  clearBtn?.addEventListener('click', () => changeSelection(() => selected.clear()));

  bindFilterHeader(header);
  loadFromBucket();
  renderAll();
}

/**
 * Read the persisted state for whichever mode/language is current right now,
 * rather than trusting the in-memory `selected`/`active` — those only reflect
 * reality once `loadFromBucket()` has run for the bucket a caller actually
 * cares about, and Start Quiz (start-handler.ts) has no reason to have
 * triggered that first. class-filter.ts's getSelectedClasses() already reads
 * fresh from storage on every call for the same reason; this matches it.
 */
function currentPersistedState(): DomainFilterState {
  const lang = currentLangValue();
  return readBucket(lang, bucketForRead('domain', b => readString(key(lang, b)) !== null));
}

/** Selected domains, or [] when the filter is switched off. */
export function getSelectedDomains(): string[] {
  // See class-filter.ts's getSelectedClasses() for why this is checked here
  // rather than cleared once, at the moment Kid-Friendly Mode is toggled on.
  if (Settings.getKidFriendlyMode()) return [];
  if (Settings.getHideDomainsFilter(getCurrentMode())) return [];
  const state = currentPersistedState();
  return state.active ? state.selected : [];
}

/**
 * The raw active/selected state, unlike getSelectedDomains() which collapses
 * "off" and "on with nothing picked" into the same empty array. presets.ts
 * needs the distinction so a saved Testing Profile can restore "off" as
 * "off", not silently turn the filter back on.
 */
export function getDomainFilterState(): DomainFilterState {
  return currentPersistedState();
}

/**
 * Whether a word survives the domain filter: it needs at least one domain in
 * common with the selection (OR, not AND — see the "OR" badge in the Domains
 * box). A word with no domain data at all does NOT get a free pass — every
 * language currently has domain coverage (15%–100%, not just Spanish, and
 * nowhere near total for any of them), so "this word has none" is a real,
 * meaningful "not tagged as Health" rather than "this language has no domain
 * data to filter on." The free pass used to let every untagged word in a
 * language through regardless of selection — selecting Health (386 Spanish
 * words) surfaced the ~3,200 untagged ones too, which reads as the filter
 * doing nothing.
 *
 * Pulled out of start-handler.ts, which had this same predicate inlined
 * three times (the main list, the "N New" fill top-up, and the
 * verbs/illustrated-only top-up) — one definition that's actually testable
 * beats three copies that can quietly drift apart.
 */
export function matchesDomainFilter(word: { domains?: string[] | null }, selectedDomains: string[]): boolean {
  if (selectedDomains.length === 0) return true;
  const domains = word.domains || [];
  return domains.some(d => selectedDomains.includes(d));
}

/** Apply matchesDomainFilter() across a list — the common case at every call site. */
export function applyDomainFilter<T extends { domains?: string[] | null }>(
  words: T[], selectedDomains: string[],
): T[] {
  return selectedDomains.length === 0 ? words : words.filter(w => matchesDomainFilter(w, selectedDomains));
}

/**
 * Set the selection directly and repaint — used by presets.ts to apply a
 * saved bundle in one shot. Domains outside the current language's known
 * set are silently kept; updateDomainFilter's own prune already handles
 * that the next time counts load.
 */
export function applyDomainSelection(domains: string[], isActive = true): void {
  active = isActive;
  changeSelection(() => {
    selected.clear();
    domains.forEach(d => selected.add(d));
  });
}
