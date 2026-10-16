/**
 * check-csp.ts — open a built dist/ in Chromium, visit every tab (and the admin page), start a quiz, and
 * report anything the Content Security Policy blocked.
 *
 *   npm run build:static && npx tsx scripts/check-csp.ts [dist]
 *
 * Serves the folder itself the way Capacitor's local server does (files, else index.html), with the
 * policy coming from the page's own <meta> tag (src/server/lib/csp.ts). Exits non-zero on a violation.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const ROOT = path.resolve(process.argv[2] ?? 'dist');
const TYPES: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.wav': 'audio/wav', '.jsonl': 'application/x-ndjson', '.webmanifest': 'application/manifest+json',
};
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url!, 'http://x').pathname);
  let file = path.join(ROOT, pathname === '/admin' ? 'admin.html' : pathname);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || !fs.statSync(file).isFile()) file = path.join(ROOT, 'index.html');
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(4181);

const violations: string[] = [];
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.addInitScript({ content: `
    document.addEventListener('securitypolicyviolation', e => console.error('CSP-VIOLATION ' + e.violatedDirective + ' ' + e.blockedURI + ' ' + (e.sourceFile || '') + ':' + e.lineNumber));
    localStorage.setItem('s_onboarding_seen', '1');
    for (const k of ['s_simple_mode']) localStorage.setItem(k, 'false');
    for (const k of ['s_show_my_content', 's_show_experimental_modes', 's_show_admin_panel']) localStorage.setItem(k, 'true');` });
  page.on('console', m => { if (m.text().startsWith('CSP-VIOLATION') || /Content Security Policy/.test(m.text())) violations.push(m.text()); });
  page.on('pageerror', e => violations.push('pageerror ' + e.message));

  await page.goto('http://localhost:4181/');
  await page.locator('html[data-app-ready="true"]').waitFor({ timeout: 60_000 });
  const tabs = await page.locator('.mode-tab[data-mode]:not([hidden])').evaluateAll(els => els.map(e => (e as HTMLElement).dataset['mode']!));
  for (const mode of tabs) {
    await page.locator(`.mode-tab[data-mode="${mode}"]`).first().click();
    await page.waitForTimeout(600);
    const start = page.locator('#startBtn:visible');
    if (await start.count()) { await start.click().catch(() => {}); await page.waitForTimeout(800); }
  }
  console.log(`visited ${tabs.join(', ')}`);

  await page.goto('http://localhost:4181/admin.html');
  await page.waitForTimeout(2000);
} finally {
  await browser.close();
  server.close();
}
if (violations.length) {
  console.error(`${violations.length} problem(s):\n` + [...new Set(violations)].join('\n'));
  process.exit(1);
}
console.log('no Content Security Policy violations');
