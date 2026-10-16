/**
 * csp.ts — the app's Content Security Policy, in one place.
 *
 * Every build carries it: vite.config.js stamps it into each built page as a
 * `<meta http-equiv="Content-Security-Policy">`, which is the only way to give one to
 * the static site's pages, the Windows app (Tauri) and the Android app (Capacitor)
 * alike, and the Express server also sends it as a header (with `frame-ancestors`,
 * which a meta tag cannot carry). The dev server gets none: Vite's own client
 * injects inline code there.
 *
 * What the app actually loads, and so what this allows:
 *   - scripts: its own bundles, plus one inline script (THEME_BOOT_SCRIPT, by hash);
 *     'wasm-unsafe-eval' for the AI Chat model's WebAssembly runtime
 *   - styles: its own CSS; 'unsafe-inline' because the markup and the UI code set
 *     style attributes in many places (a style can't run code)
 *   - images: its own, data:/blob: (exports, previews) and any https: URL, since a
 *     learner can give a picture by web address (user-content.ts)
 *   - connections: itself, the Windows app's IPC, and the AI Chat model download
 *   - no plugins (<object>), no <base> elsewhere, forms only to itself
 */
import { createHash } from 'node:crypto';

/**
 * Applies the saved dark theme before the first paint (the app module applies it too,
 * but only after the page has been drawn once, so a dark-mode learner saw a light
 * flash at every start). vite.config.js puts it at the top of each page's <head>;
 * its hash is what lets it run under the policy.
 */
export const THEME_BOOT_SCRIPT =
  "try{var t=localStorage.getItem('theme')||'system';if(t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}";

const THEME_BOOT_HASH = `'sha256-${createHash('sha256').update(THEME_BOOT_SCRIPT).digest('base64')}'`;

export const CSP_DIRECTIVES: Record<string, string[]> = {
  'default-src': ["'self'"],
  'script-src':  ["'self'", THEME_BOOT_HASH, "'wasm-unsafe-eval'"],
  'style-src':   ["'self'", "'unsafe-inline'"],
  'img-src':     ["'self'", 'data:', 'blob:', 'https:'],
  'media-src':   ["'self'", 'data:', 'blob:'],
  'font-src':    ["'self'", 'data:'],
  'connect-src': [
    "'self'",
    // The Windows app's calls into Rust (Tauri 2 IPC).
    'ipc:', 'http://ipc.localhost',
    // AI Chat's model weights and config (WebLLM), fetched only when that tab is used.
    'https://huggingface.co', 'https://*.huggingface.co', 'https://*.hf.co', 'https://raw.githubusercontent.com',
  ],
  'worker-src':  ["'self'", 'blob:'],
  'object-src':  ["'none'"],
  'base-uri':    ["'self'"],
  'form-action': ["'self'"],
};

/** The policy as one header/meta value. `frame-ancestors` only takes effect in a header. */
export function cspString(extra: Record<string, string[]> = {}): string {
  return Object.entries({ ...CSP_DIRECTIVES, ...extra }).map(([k, v]) => `${k} ${v.join(' ')}`).join('; ');
}
