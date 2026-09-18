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
 * Show a transient status message in the editor status bar (#statusMessage).
 */
export function showStatus(message: string, type: 'info' | 'success' | 'error' = 'info'): void {
  const el = document.getElementById('statusMessage');
  if (!el) return;
  el.innerHTML = `<div class="status ${type}">${escapeHtml(message)}</div>`;
  setTimeout(() => { el.innerHTML = ''; }, type === 'error' ? 5000 : 3000);
}

/** Safely escape a string for insertion into innerHTML. */
export function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
