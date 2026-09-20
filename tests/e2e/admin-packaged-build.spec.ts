import { test, expect } from '@playwright/test';

/**
 * Admin panel — redirects to the main app when no backend answers
 * /api/health, instead of showing a dead page. This used to be gated on
 * isPackagedApp() (a Tauri/Capacitor webview never ships a server) until
 * that turned out to be the wrong signal: `tauri dev` points its webview at
 * the exact same Vite dev server a browser would, proxying `/api/*` to a
 * real Express process the same way — so a developer running that
 * alongside `npm run dev:api` has a perfectly working backend that
 * isPackagedApp() can't see, and used to get redirected away from
 * unconditionally anyway. admin.ts now checks reachability directly (see
 * its own hasReachableBackend), so these tests simulate "no backend" by
 * actually making /api/health fail, not by stubbing a Tauri global.
 */
test.describe('admin panel with no backend reachable', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/health', route => route.abort());
  });

  test('redirects to the main app instead of showing a dead admin page', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForURL(url => !url.pathname.includes('admin'));
    await expect(page).toHaveTitle('VocabApp');
    // Landed somewhere real, not just "not /admin" — the app shell rendered.
    await expect(page.locator('.mode-tabs')).toBeVisible();
  });

  test('makes no admin API requests at all before redirecting', async ({ page }) => {
    const adminRequests: string[] = [];
    page.on('request', req => {
      if (req.url().includes('/api/admin')) adminRequests.push(req.url());
    });

    await page.goto('/admin');
    await page.waitForURL(url => !url.pathname.includes('admin'));
    // A little further, in case any tab's eager fetch (Word Editor's
    // initEditor, Conjugation's initConjugation) somehow still ran before
    // the redirect took effect.
    await page.waitForTimeout(300);
    expect(adminRequests).toEqual([]);
  });
});

/**
 * The case the isPackagedApp()-based check got wrong: a Tauri webview (or
 * anything else) that *does* have a real backend behind it should work
 * normally, not get bounced away just for looking like a packaged build.
 * __TAURI_INTERNALS__ is stubbed here to prove the check no longer even
 * looks at it — /api/health is left completely real and answering.
 */
test('does not redirect when a real backend is reachable, even inside a Tauri webview', async ({ page }) => {
  await page.addInitScript(() => {
    // @ts-expect-error — test-only global, mirrors what Tauri's webview injects
    window.__TAURI_INTERNALS__ = {};
  });

  await page.goto('/admin');
  // No navigation away — stays on the real, working admin panel.
  await expect(page).toHaveURL(/\/admin/);
  await expect(page.locator('.tab-btn.active')).toBeVisible();
});
