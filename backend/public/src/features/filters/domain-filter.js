/**
 * domain-filter.js
 *
 * Wires up the domain filter panel:
 *   - collapsible toggle
 *   - All / None buttons
 *   - live count badge showing "X / 63"
 *
 * bindDomainFilter()    – call once on init
 * getSelectedDomains()  – returns string[] of currently checked domain values
 */

function updateCount() {
  const countEl = document.getElementById('domainFilterCount');
  if (!countEl) return;
  const all     = document.querySelectorAll('#domainFilter input[type="checkbox"]');
  const checked = document.querySelectorAll('#domainFilter input[type="checkbox"]:checked');
  countEl.textContent = checked.length === all.length
    ? ''
    : '(' + checked.length + ' / ' + all.length + ')';
}

export function bindDomainFilter() {
  const panel     = document.getElementById('domainFilter');
  const toggleBtn = document.getElementById('domainFilterToggle');
  const allBtn    = document.getElementById('selectAllDomains');
  const noneBtn   = document.getElementById('selectNoneDomains');

  if (!panel) return;

  // Toggle open / close
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const isOpen = !panel.hidden;
      panel.hidden = isOpen;
      toggleBtn.setAttribute('aria-expanded', String(!isOpen));
    });
  }

  // All
  if (allBtn) {
    allBtn.addEventListener('click', () => {
      panel.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.checked = true; });
      updateCount();
    });
  }

  // None
  if (noneBtn) {
    noneBtn.addEventListener('click', () => {
      panel.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.checked = false; });
      updateCount();
    });
  }

  // Update count whenever any checkbox changes
  panel.addEventListener('change', updateCount);

  // Initialise count
  updateCount();
}

export function getSelectedDomains() {
  return Array.from(
    document.querySelectorAll('#domainFilter input[type="checkbox"]:checked')
  ).map(cb => cb.value);
}
