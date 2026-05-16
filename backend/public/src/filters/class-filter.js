export function bindClassFilter() {
  document.getElementById('selectAllClasses').addEventListener('click', () => {
    document.querySelectorAll('#classFilter input[type="checkbox"]').forEach(cb => cb.checked = true);
  });
  document.getElementById('selectNoneClasses').addEventListener('click', () => {
    document.querySelectorAll('#classFilter input[type="checkbox"]').forEach(cb => cb.checked = false);
  });
}

export function getSelectedClasses() {
  return Array.from(document.querySelectorAll('#classFilter input[type="checkbox"]:checked'))
    .map(cb => cb.value);
}
