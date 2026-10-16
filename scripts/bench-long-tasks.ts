/**
 * bench-long-tasks.ts — how long the page freezes while a language loads: every main-thread task over
 * 50 ms from navigation until the whole language is in (the `vocab-full:<lang>` mark), in Chromium with
 * the CPU slowed down to roughly a phone's.
 *
 *   npm run build:static && npx tsx scripts/bench-long-tasks.ts [dist] [--android] [--throttle 4]
 *
 * --android stubs window.Capacitor so the page takes the Android app's path. Serves the folder itself.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const ROOT = path.resolve(args.find(a => !a.startsWith('--') && !/^\d+$/.test(a)) ?? 'dist');
const android = args.includes('--android');
const throttle = Number(args[args.indexOf('--throttle') + 1]) || 4;
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.jsonl': 'application/x-ndjson' };
const server = http.createServer((req, res) => {
  if (req.url!.startsWith('/api/')) { res.writeHead(404); res.end(); return; }
  let file = path.join(ROOT, decodeURIComponent(new URL(req.url!, 'http://x').pathname));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || !fs.statSync(file).isFile()) file = path.join(ROOT, 'index.html');
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(4182);

const browser = await chromium.launch();
try {
  for (let run = 1; run <= 3; run++) {
    const ctx = await browser.newContext();
    await ctx.addInitScript({ content: `
      window.__long = [];
      new PerformanceObserver(l => l.getEntries().forEach(e => window.__long.push([Math.round(e.startTime), Math.round(e.duration)]))).observe({ type: 'longtask', buffered: true });
      localStorage.setItem('s_onboarding_seen', '1');
      ${android ? `let cap = {}; Object.defineProperty(window, 'Capacitor', { configurable: true, get: () => Object.assign(cap, { isNativePlatform: () => true, getPlatform: () => 'android' }), set: v => { cap = v; } });` : ''}` });
    const page = await ctx.newPage();
    await (await ctx.newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: throttle });
    await page.goto('http://localhost:4182/');
    await page.locator('html[data-app-ready="true"]').waitFor({ timeout: 120_000 });
    await page.waitForFunction(() => performance.getEntriesByName('vocab-full:spanish').length > 0, null, { timeout: 120_000 });
    await page.waitForTimeout(1500);
    const r = await page.evaluate(() => ({
      ready: Math.round(performance.getEntriesByType('mark').find(() => true)?.startTime ?? 0),
      full: Math.round(performance.getEntriesByName('vocab-full:spanish')[0]!.startTime),
      long: (window as unknown as { __long: [number, number][] }).__long,
    }));
    const after = r.long.filter(([s]) => s > 1000);
    console.log(`run ${run}: whole language at ${r.full} ms; long tasks ${r.long.length}, longest ${Math.max(0, ...r.long.map(l => l[1]))} ms, `
      + `total ${r.long.reduce((n, l) => n + l[1], 0)} ms; worst after first second: ${after.sort((a, b) => b[1] - a[1]).slice(0, 5).map(([s, d]) => `${d}@${s}`).join(' ')}`);
    await ctx.close();
  }
} finally {
  await browser.close();
  server.close();
}
