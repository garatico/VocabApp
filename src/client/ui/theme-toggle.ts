import { readString } from '../utils/storage.ts';

const STORAGE_KEY = 'theme';
const DARK_CLASS  = 'dark';

export type ThemeValue = 'light' | 'dark' | 'system';

export function applyTheme(value: ThemeValue): void {
  if (value === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle(DARK_CLASS, prefersDark);
  } else {
    document.documentElement.classList.toggle(DARK_CLASS, value === DARK_CLASS);
  }
}

export function initTheme(): void {
  const saved = (readString(STORAGE_KEY) ?? 'system') as ThemeValue;
  applyTheme(saved);

  // React to OS-level theme changes when 'system' is the active preference
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
    if ((readString(STORAGE_KEY) ?? 'system') === 'system') {
      document.documentElement.classList.toggle(DARK_CLASS, e.matches);
    }
  });
}
