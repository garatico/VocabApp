export function bindClassFilter(): void {
  document.getElementById('selectAllClasses')?.addEventListener('click', () => {
    document.querySelectorAll<HTMLInputElement>('#classFilter input[type="checkbox"]')
      .forEach(cb => { cb.checked = true; });
  });
  document.getElementById('selectNoneClasses')?.addEventListener('click', () => {
    document.querySelectorAll<HTMLInputElement>('#classFilter input[type="checkbox"]')
      .forEach(cb => { cb.checked = false; });
  });
}

export function getSelectedClasses(): string[] {
  return Array.from(
    document.querySelectorAll<HTMLInputElement>('#classFilter input[type="checkbox"]:checked')
  ).map(cb => cb.value);
}
