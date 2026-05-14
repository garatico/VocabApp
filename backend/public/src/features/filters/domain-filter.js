/**
 * domain-filter.js
 *
 * Wires up the #domainFilter panel (All / None buttons + checkbox reads).
 *
 * bindDomainFilter()    – call once on init; attaches All/None button handlers
 * getSelectedDomains()  – returns string[] of currently checked domain values
 */

export function bindDomainFilter() {
  const panel   = document.getElementById('domainFilter');
  if (!panel) return;

  const allBtn  = document.getElementById('selectAllDomains');
  const noneBtn = document.getElementById('selectNoneDomains');

  if (allBtn) {
    allBtn.addEventListener('click', () => {
      panel.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = true);
    });
  }

  if (noneBtn) {
    noneBtn.addEventListener('click', () => {
      panel.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
    });
  }
}

export function getSelectedDomains() {
  return Array.from(
    document.querySelectorAll('#domainFilter input[type="checkbox"]:checked')
  ).map(cb => cb.value);
}
