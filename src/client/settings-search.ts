import { fillHighlighted } from './utils/dom.ts';
import { foldKey } from './utils/match.ts';

/**
 * settings-search.ts — the Settings screen's Glossary tab and the search box
 * that filters every section's rows.
 */

// ── Glossary — search, category filter, A→Z/Grouped sort ──────────────────

/**
 * Wires the Glossary section's search box, category filter chips, and sort
 * toggle. Rows stay in the DOM the whole time (search/filter only toggle
 * `hidden`) so re-matching a term after narrowing needs no re-render — only
 * the sort toggle actually moves nodes, and only between two fixed orders:
 * the original grouped-by-topic markup order (captured once, here) and an
 * alphabetical one computed fresh from whatever's currently on screen (so a
 * UI-language switch re-sorts by the newly-displayed term text, not stale
 * English).
 */
export function bindGlossary(): void {
  const search = document.getElementById('glossarySearch') as HTMLInputElement | null;
  const list   = document.getElementById('glossaryList');
  const empty  = document.getElementById('glossaryEmpty');
  const sortToggle   = document.getElementById('glossarySort');
  const filterChips  = document.getElementById('glossaryFilterChips');
  if (!search || !list || !sortToggle || !filterChips) return;

  const rows = Array.from(list.querySelectorAll<HTMLElement>('.glossary-term'));
  if (rows.length === 0) return;
  const groupedOrder = rows.slice();

  const termSpan = (row: HTMLElement): HTMLElement =>
    row.querySelector<HTMLElement>('.settings-label > span:first-child')!;
  const descSpan = (row: HTMLElement): HTMLElement | null =>
    row.querySelector<HTMLElement>('.settings-desc');

  let activeCategory = 'all';

  function applyFilters(): void {
    const q = foldKey(search!.value);
    let anyVisible = false;
    for (const row of rows) {
      const term = termSpan(row);
      const desc = descSpan(row);
      const matchesCategory = activeCategory === 'all' || row.dataset.category === activeCategory;
      const matchesSearch = !q
        || foldKey(term.textContent ?? '').includes(q)
        || foldKey(desc?.textContent ?? '').includes(q);
      const visible = matchesCategory && matchesSearch;
      row.hidden = !visible;
      if (visible) anyVisible = true;
      // Re-highlight from the term's own full text every time — textContent
      // already flattens whatever <mark> a previous search wrapped it in,
      // so this is safe to call unconditionally rather than needing a
      // separately-cached "original" copy.
      fillHighlighted(term, term.textContent ?? '', search!.value);
    }
    if (empty) empty.hidden = anyVisible;
  }

  search.addEventListener('input', applyFilters);

  filterChips.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('.pos-chip');
    if (!btn?.dataset.category) return;
    filterChips.querySelectorAll('.pos-chip').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    activeCategory = btn.dataset.category;
    applyFilters();
  });

  function reorder(sortKey: string | undefined): void {
    const ordered = sortKey === 'az'
      ? rows.slice().sort((a, b) => foldKey(termSpan(a).textContent ?? '').localeCompare(foldKey(termSpan(b).textContent ?? '')))
      : groupedOrder;
    ordered.forEach(row => list!.appendChild(row));
  }

  sortToggle.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('.sort-order-btn');
    if (!btn?.dataset.sort) return;
    sortToggle.querySelectorAll('.sort-order-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    reorder(btn.dataset.sort);
  });

  // The markup's own default-active button (A → Z) is a claim about order,
  // not just which button looks pressed — apply it now rather than leaving
  // the grouped markup order on screen under an "A → Z" label until the
  // learner clicks something.
  reorder(sortToggle.querySelector<HTMLElement>('.sort-order-btn.active')?.dataset.sort);
  applyFilters();
}

// ── Settings search — filters every section's rows by label/description ───
//
// Rows/groups/sections stay in the DOM the whole time, same approach as
// bindGlossary() above — only visibility and the collapsed-state toggle,
// never a rebuild. A row also counts as a match when its *group* or
// *section* heading matches (not just its own text) — typing "colors"
// surfaces a whole Table Colors group even though none of its individual
// rows say "colors" themselves.
//
// A group/section the search force-opens is restored to whatever it was
// before the search (collapsed or not) once the query is cleared, rather
// than left open — searching shouldn't permanently change anyone's collapse
// preferences, only reveal what already matches.

interface SettingsSearchRow {
  row: HTMLElement;
  text: string;
  label: HTMLElement;
  groupBody: HTMLElement | null;
  sectionBody: HTMLElement;
}

export function bindSettingsSearch(): void {
  const input = document.getElementById('settingsSearch') as HTMLInputElement | null;
  const empty = document.getElementById('settingsSearchEmpty');
  const sections = Array.from(document.querySelectorAll<HTMLElement>('.settings-section'));
  if (!input || sections.length === 0) return;

  const rows: SettingsSearchRow[] = [];
  const groupHeading  = new Map<HTMLElement, string>();
  const sectionTitle  = new Map<HTMLElement, string>();
  const bodyOfSection = new Map<HTMLElement, HTMLElement>();

  for (const section of sections) {
    const sectionBtn  = section.querySelector<HTMLButtonElement>(':scope > .settings-collapse-btn');
    const sectionBody = section.querySelector<HTMLElement>(':scope > .settings-section-body');
    if (!sectionBtn || !sectionBody) continue;
    bodyOfSection.set(section, sectionBody);
    sectionTitle.set(sectionBody, foldKey(sectionBtn.querySelector('.settings-section-title')?.textContent ?? ''));

    sectionBody.querySelectorAll<HTMLButtonElement>('.settings-group-collapse-btn').forEach(btn => {
      const groupId = btn.dataset.collapse;
      const body = groupId ? document.getElementById(groupId) : null;
      if (!body) return;
      groupHeading.set(body, foldKey(btn.querySelector('.settings-group-heading')?.textContent ?? ''));
    });

    sectionBody.querySelectorAll<HTMLElement>('.settings-row').forEach(row => {
      const label = row.querySelector<HTMLElement>('.settings-label > span:first-child');
      if (!label) return; // a readout-only row or similar has nothing to search by — leave it always visible
      const desc = row.querySelector<HTMLElement>('.settings-desc');
      const text = foldKey(`${label.textContent ?? ''} ${desc?.textContent ?? ''}`);
      const groupBody = row.closest<HTMLElement>('.filter-body[id^="settingsGroup"]');
      rows.push({ row, text, label, groupBody, sectionBody });
    });
  }

  const navLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>('.settings-nav-link'));
  const linkFor = (section: HTMLElement) => navLinks.find(l => l.getAttribute('href') === `#${section.id}`);

  // Only ever holds groups/sections *this* search opened — checked against
  // their live collapsed state before adding, so something already open on
  // its own (or left open by the user) is never in here and never touched.
  const forcedOpen: HTMLElement[] = [];

  function forceOpen(body: HTMLElement): void {
    if (!body.classList.contains('filter-body--collapsed')) return;
    body.classList.remove('filter-body--collapsed');
    document.querySelector(`[data-collapse="${body.id}"]`)?.setAttribute('aria-expanded', 'true');
    forcedOpen.push(body);
  }

  function revertForcedOpen(): void {
    for (const body of forcedOpen) {
      body.classList.add('filter-body--collapsed');
      document.querySelector(`[data-collapse="${body.id}"]`)?.setAttribute('aria-expanded', 'false');
    }
    forcedOpen.length = 0;
  }

  function applySearch(): void {
    revertForcedOpen();
    const raw = input!.value;
    const q = foldKey(raw.trim());

    if (!q) {
      rows.forEach(r => { r.row.hidden = false; fillHighlighted(r.label, r.label.textContent ?? '', ''); });
      sections.forEach(s => { s.hidden = false; });
      navLinks.forEach(l => { l.hidden = false; });
      if (empty) empty.hidden = true;
      return;
    }

    const sectionMatched = new Set<HTMLElement>();
    const groupMatched   = new Set<HTMLElement>();

    for (const r of rows) {
      const groupText = r.groupBody ? groupHeading.get(r.groupBody) ?? '' : '';
      const secText    = sectionTitle.get(r.sectionBody) ?? '';
      const match = r.text.includes(q) || groupText.includes(q) || secText.includes(q);
      r.row.hidden = !match;
      if (!match) continue;
      sectionMatched.add(r.sectionBody);
      if (r.groupBody) groupMatched.add(r.groupBody);
      fillHighlighted(r.label, r.label.textContent ?? '', raw);
    }

    groupMatched.forEach(forceOpen);
    sectionMatched.forEach(forceOpen);

    let anyMatch = false;
    for (const section of sections) {
      const sectionBody = bodyOfSection.get(section);
      const matched = sectionBody ? sectionMatched.has(sectionBody) : false;
      section.hidden = !matched;
      if (matched) anyMatch = true;
      const link = linkFor(section);
      if (link) link.hidden = !matched;
    }

    if (empty) empty.hidden = anyMatch;
  }

  input.addEventListener('input', applySearch);
}

/**
 * Fill in the streak/progress numbers — live values, not a setting, so this
 * runs on every Settings tab visit (see app.ts's onActivate.settings) rather
 * than only once at load like the toggle-restore logic above.
 */
