/**
 * ui.ts — Loading spinners, error handling.
 *
 * Toast notifications live in ui/toast.ts instead — this file used to carry
 * its own showToast/showSuccess/showWarning/showInfo, but nothing ever called
 * them once toast.ts existed as the generic, reusable version.
 */

import { logger } from '../utils/logger.js';

// ── Loading spinner ───────────────────────────────────────────────────────────

export function showLoading(message = 'Loading vocabulary...'): void {
  const spinner = document.getElementById('loadingSpinner');
  if (spinner) {
    const messageEl = spinner.querySelector('p');
    if (messageEl) messageEl.textContent = message;
    spinner.classList.add('show');
    spinner.style.display = 'flex';
  }
}

export function hideLoading(): void {
  const spinner = document.getElementById('loadingSpinner');
  if (spinner) {
    spinner.classList.remove('show');
    setTimeout(() => { spinner.style.display = 'none'; }, 300);
  }
}

// ── Error messages ────────────────────────────────────────────────────────────

export function showErrorMessage(message: string): void {
  const errorEl = document.getElementById('errorMessage');
  if (errorEl) {
    const textEl = errorEl.querySelector('.error-text');
    if (textEl) textEl.textContent = message;
    (errorEl as HTMLElement).style.display = 'flex';
    errorEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

export function closeError(): void {
  const errorEl = document.getElementById('errorMessage');
  if (errorEl) errorEl.style.display = 'none';
}

export function clearError(): void { closeError(); }

// ── Initialisation ────────────────────────────────────────────────────────────

export function mountUI(): void {
  (window as Window & { closeError?: () => void }).closeError = closeError;
  document.getElementById('closeErrorBtn')?.addEventListener('click', closeError);
  logger.info('✓ UI enhancements mounted');
}
