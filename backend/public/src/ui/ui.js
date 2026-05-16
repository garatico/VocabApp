/**
 * UI Enhancement Utilities for Phase 4B
 * Loading spinners, toast notifications, error handling
 */

/* ─────────────────────────────────────
   LOADING SPINNER
   ───────────────────────────────────── */

export function showLoading(message = 'Loading vocabulary...') {
  const spinner = document.getElementById('loadingSpinner');
  if (spinner) {
    const messageEl = spinner.querySelector('p');
    if (messageEl) messageEl.textContent = message;
    spinner.classList.add('show');
    spinner.style.display = 'flex';
  }
}

export function hideLoading() {
  const spinner = document.getElementById('loadingSpinner');
  if (spinner) {
    spinner.classList.remove('show');
    setTimeout(() => { spinner.style.display = 'none'; }, 300);
  }
}

/* ─────────────────────────────────────
   TOAST NOTIFICATIONS
   ───────────────────────────────────── */

export function showToast(message, type = 'success', duration = 3000) {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ⓘ' };
  toast.innerHTML = `<span>${icons[type] || ''}</span><span>${message}</span>`;
  document.body.appendChild(toast);
  if (duration > 0) {
    setTimeout(() => {
      toast.style.animation = 'slideUp 0.3s ease reverse';
      setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 300);
    }, duration);
  }
  return toast;
}

export function showSuccess(message) { return showToast(message, 'success', 3000); }
export function showError(message)   { return showToast(message, 'error',   4000); }
export function showWarning(message) { return showToast(message, 'warning', 3000); }
export function showInfo(message)    { return showToast(message, 'info',    3000); }

/* ─────────────────────────────────────
   ERROR MESSAGES
   ───────────────────────────────────── */

export function showErrorMessage(message) {
  const errorEl = document.getElementById('errorMessage');
  if (errorEl) {
    const textEl = errorEl.querySelector('.error-text');
    if (textEl) textEl.textContent = message;
    errorEl.style.display = 'flex';
    errorEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

export function closeError() {
  const errorEl = document.getElementById('errorMessage');
  if (errorEl) errorEl.style.display = 'none';
}

export function clearError() { closeError(); }

/* ─────────────────────────────────────
   INITIALIZATION
   ───────────────────────────────────── */

export function mountUI() {
  window.closeError = closeError;
  console.log('✓ UI enhancements mounted');
}
