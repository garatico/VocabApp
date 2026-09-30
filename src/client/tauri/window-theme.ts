/**
 * window-theme.ts — keeps the desktop app's native window frame (title bar) in step with the theme the app
 * itself is showing. Without it the frame follows the OS while the page inside follows the app's own
 * Light / Dark / System choice — including one a Visual Profile just applied — so they can disagree.
 *
 * Only ever imported via dynamic import() behind isPackagedApp(), like the rest of this folder.
 */

import { getCurrentWindow } from '@tauri-apps/api/window';
import { logger } from '../utils/logger.ts';
import { setOnThemeApplied, type ThemeValue } from '../ui/theme-toggle.ts';

/** 'system' hands control back to the OS (null); Light and Dark pin the frame to that choice. */
export function nativeThemeFor(value: ThemeValue): 'light' | 'dark' | null {
  return value === 'system' ? null : value;
}

export function initWindowTheme(initial: ThemeValue): void {
  const apply = (value: ThemeValue): void => {
    getCurrentWindow().setTheme(nativeThemeFor(value)).catch(err => logger.warn('window theme failed', err));
  };
  apply(initial);
  setOnThemeApplied(apply);
}
