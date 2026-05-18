const STORAGE_KEY = 'theme';
const DARK_CLASS  = 'dark';

function applyTheme(dark: boolean): void {
  document.documentElement.classList.toggle(DARK_CLASS, dark);
  const btn = document.getElementById('themeToggle');
  if (btn) btn.textContent = dark ? '☀' : '☾';
}

export function initTheme(): void {
  const saved       = localStorage.getItem(STORAGE_KEY);
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(saved ? saved === DARK_CLASS : prefersDark);

  const btn = document.getElementById('themeToggle');
  if (!btn) return;

  btn.addEventListener('click', () => {
    const nowDark = document.documentElement.classList.toggle(DARK_CLASS);
    localStorage.setItem(STORAGE_KEY, nowDark ? DARK_CLASS : 'light');
    btn.textContent = nowDark ? '☀' : '☾';
  });
}
