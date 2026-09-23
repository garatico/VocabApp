/**
 * admin-api.ts
 *
 * Shared API utilities for the admin panel.
 * Imported by every other admin module.
 */

/**
 * Fetch a /api/admin endpoint.
 * Throws an Error (with the server's error message if available) on non-2xx responses.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function apiCall(endpoint: string, method = 'GET', data: unknown = null): Promise<any> {
  const options: RequestInit = { method, headers: { 'Content-Type': 'application/json' } };
  if (data !== null) options.body = JSON.stringify(data);

  const response = await fetch(`/api/admin${endpoint}`, options);

  if (!response.ok) {
    let msg = `HTTP ${response.status}: ${response.statusText}`;
    try { const err = await response.json(); msg = err.error || msg; } catch (_) {}
    throw new Error(msg);
  }

  // A 200 with a non-JSON body (almost always an HTML page) means this
  // request never reached the Express API at all — e.g. a static-only
  // preview/host serving the SPA's index.html for every unmatched path.
  // Left unchecked, response.json() throws an opaque "Unexpected token '<'"
  // SyntaxError that reads like a data bug rather than a wiring one.
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new Error('Server returned a non-JSON response — is the Express backend running behind this page?');
  }

  return response.json();
}

/**
 * Show a transient status message as a bottom-right toast.
 *
 * Shared by every admin tab (Word Editor, DB Admin, Table View, Conjugation)
 * rather than each keeping its own inline status-bar element — a message
 * about a save/clear/export firing near the bottom-right corner reads the
 * same regardless of which tab triggered it, and a stray toast from a
 * previous tab clears itself on its own timer instead of lingering in a
 * div the user has since scrolled away from.
 */
export function showStatus(message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info'): void {
  let container = document.getElementById('adminToastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'adminToastContainer';
    container.className = 'admin-toast-container';
    document.body.appendChild(container);
  }

  const ms = type === 'error' ? 5000 : 3000;
  const toast = document.createElement('div');
  toast.className = `admin-toast admin-toast--${type}`;
  toast.innerHTML =
    `<span class="admin-toast-message">${escapeHtml(message)}</span>` +
    `<div class="admin-toast-progress" style="animation-duration:${ms}ms"></div>`;

  container.appendChild(toast);
  setTimeout(() => toast.remove(), ms);
}

/** Safely escape a string for insertion into innerHTML. */
export function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
