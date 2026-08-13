/**
 * ui.ts — Loading spinners, toast notifications, error handling.
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

// ── Toast notifications ───────────────────────────────────────────────────────

type ToastType = 'success' | 'error' | 'warning' | 'info';

export function showToast(message: string, type: ToastType = 'success', duration = 3000): HTMLElement {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  const icons: Record<ToastType, string> = { success: '✓', error: '✕', warning: '⚠', info: 'ⓘ' };
  toast.innerHTML = `<span>${icons[type]}</span><span>${message}</span>`;
  document.body.appendChild(toast);
  if (duration > 0) {
    setTimeout(() => {
      toast.style.animation = 'slideUp 0.3s ease reverse';
      setTimeout(() => { toast.parentNode?.removeChild(toast); }, 300);
    }, duration);
  }
  return toast;
}

export function showSuccess(message: string): HTMLElement { return showToast(message, 'success', 3000); }
export function showError(message: string): HTMLElement   { return showToast(message, 'error',   4000); }
export function showWarning(message: string): HTMLElement { return showToast(message, 'warning', 3000); }
export function showInfo(message: string): HTMLElement    { return showToast(message, 'info',    3000); }

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
