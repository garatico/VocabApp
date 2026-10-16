/**
 * csp.test.js — the Content Security Policy (src/server/lib/csp.ts) still lets the pages run.
 *
 * The policy allows exactly one inline script, by hash. Anything else inline — a new <script> block, an
 * onclick="" attribute, a javascript: link — would be blocked in every built page and in the installed
 * apps, but not in `vite dev`, which carries no policy. So this reads the source pages for them.
 * scripts/check-csp.ts is the end-to-end version (a built dist/ in Chromium, every tab).
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import crypto from 'node:crypto';
import request from 'supertest';
import { CSP_DIRECTIVES, THEME_BOOT_SCRIPT, cspString } from '../src/server/lib/csp.js';
import { buildTestApp, teardownTestApp } from './helpers/app.js';

const PAGES = ['index.html', 'admin.html'];

describe('Content Security Policy', () => {
  let db;
  afterEach(() => teardownTestApp(db));

  it('allows the theme boot script by its hash', () => {
    const hash = crypto.createHash('sha256').update(THEME_BOOT_SCRIPT).digest('base64');
    expect(CSP_DIRECTIVES['script-src']).toContain(`'sha256-${hash}'`);
    expect(cspString()).not.toContain("'unsafe-eval'");   // only 'wasm-unsafe-eval'
  });

  it.each(PAGES)('%s has no inline script, event handler attribute or javascript: URL', page => {
    const html = fs.readFileSync(page, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
    const inlineScripts = [...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1].trim()).filter(Boolean);
    expect(inlineScripts).toEqual([]);
    expect(html.match(/\son[a-z]+\s*=\s*["']/gi) ?? []).toEqual([]);
    expect(html.match(/javascript:/gi) ?? []).toEqual([]);
  });

  it('is sent as a header by the server, with frame-ancestors', async () => {
    const built = buildTestApp();
    db = built.db;
    const res = await request(built.app).get('/api/health');
    const header = res.headers['content-security-policy'];
    expect(header).toContain("default-src 'self'");
    expect(header).toContain("frame-ancestors 'none'");
    expect(header).toContain(CSP_DIRECTIVES['script-src'][1]);
  });
});
