/**
 * bench-tauri-startup.ts — how long the built Windows app takes to start, measured in the real app.
 *
 *   npx tsx scripts/bench-tauri-startup.ts <path-to-vocabapp.exe> [reloads]
 *
 * Starts the exe with WebView2's DevTools port open, attaches Playwright over CDP and reloads the page a
 * few times, timing each reload to `html[data-app-ready]` (startup finished, first words on screen) and to
 * the last local-database read (the whole language in). Then it closes the app.
 *
 * Build the exe under its own identifier so it never touches an installed app's data:
 *   npx tauri build --no-bundle --config '{"identifier":"com.vocabapp.bench"}'
 * The resources folder (`data/vocabulary.db`) must sit next to the exe, as it does in target/release/.
 */
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';

const exe = process.argv[2];
const reloads = Number(process.argv[3] ?? 5);
if (!exe) { console.error('usage: bench-tauri-startup.ts <exe> [reloads]'); process.exit(1); }
const PORT = 9333;

const started = performance.now();
const app = spawn(exe, [], {
  env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}` },
  stdio: 'ignore',
});

async function cdpUp(): Promise<void> {
  for (let i = 0; i < 300; i++) {
    try { if ((await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok) return; } catch { /* not yet */ }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('WebView2 DevTools port never opened');
}

try {
  await cdpUp();
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
  const page = browser.contexts()[0]!.pages()[0]!;
  await page.locator('html[data-app-ready="true"]').waitFor({ timeout: 120_000 });
  console.log(`launch -> app ready: ${(performance.now() - started).toFixed(0)} ms (wall clock, includes process start)`);

  const ready: number[] = [], data: number[] = [];
  for (let i = 0; i < reloads; i++) {
    let lastSql = 0;
    let t0 = 0;
    const onDone = (req: { url(): string }): void => { if (/plugin%3Asql|plugin:sql|select_rows/.test(req.url())) lastSql = performance.now(); };
    page.on('requestfinished', onDone);
    t0 = performance.now();
    await page.reload();
    await page.locator('html[data-app-ready="true"]').waitFor({ timeout: 120_000 });
    const tReady = performance.now() - t0;
    await page.waitForTimeout(4000);   // the rest of the language loads behind the first paint
    page.off('requestfinished', onDone);
    ready.push(tReady);
    data.push(lastSql ? lastSql - t0 : NaN);
    console.log(`reload ${i + 1}: app ready ${tReady.toFixed(0)} ms, last database read done ${(lastSql - t0).toFixed(0)} ms`);
  }
  const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
  console.log(`median: app ready ${median(ready).toFixed(0)} ms, whole language in ${median(data).toFixed(0)} ms`);
  await browser.close().catch(() => {});
} finally {
  app.kill();
}
