/**
 * filter-toggle.ts
 *
 * Handles the collapse/expand functionality for the "Refine Results" filter section.
 */

export function initializeFilterToggle(): void {
  const filterToggle = document.getElementById('filterToggle');
  const wordFilters  = document.getElementById('wordFilters');

  if (!filterToggle || !wordFilters) return;

  filterToggle.addEventListener('click', () => {
    const isExpanded = filterToggle.getAttribute('aria-expanded') === 'true';
    const newState   = !isExpanded;

    filterToggle.setAttribute('aria-expanded', String(newState));

    if (newState) {
      wordFilters.classList.remove('collapsed');
    } else {
      wordFilters.classList.add('collapsed');
    }

    localStorage.setItem('filterExpanded', String(newState));
  });

  // Restore previous state from localStorage
  const savedState = localStorage.getItem('filterExpanded');
  if (savedState === 'false') {
    filterToggle.setAttribute('aria-expanded', 'false');
    wordFilters.classList.add('collapsed');
  } else {
    filterToggle.setAttribute('aria-expanded', 'true');
    wordFilters.classList.remove('collapsed');
  }
}
