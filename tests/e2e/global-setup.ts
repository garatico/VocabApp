import { chromium, type FullConfig } from '@playwright/test';

/**
 * Warm the dev server before any spec runs.
 *
 * `webServer` waits for Vite, which is ready in well under a second, but the API is
 * still loading every language and Vite has transformed nothing yet. The first specs of
 * a fresh run then each made a cold, hundreds-of-modules first load against a busy
 * server, three at a time, and timed out in page.goto (a11y's first tabs, every run).
 * One full load here, with nothing racing it, pays that cost once.
 */
export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use.baseURL ?? 'http://localhost:5173';
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(new URL('/api/health', baseURL));
      if (res.ok) break;
    } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 1000));
  }

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(baseURL, { timeout: 120_000 });
    await page.locator('html[data-app-ready="true"]').waitFor({ timeout: 120_000 }).catch(() => {});
    await page.goto(new URL('/admin', baseURL).toString(), { timeout: 120_000 }).catch(() => {});
  } finally {
    await browser.close();
  }
}
