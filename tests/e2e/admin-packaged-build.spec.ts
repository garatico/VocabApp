import { test, expect } from '@playwright/test';

/**
 * Admin panel — packaged build (Tauri/Capacitor, no Express behind the page).
 *
 * A packaged desktop/mobile build ships no server at all, so every admin
 * tab's API call was always going to fail. This used to show a
 * #packagedWarning banner explaining that and stop there — accurate, but it
 * still left whoever opened admin.html (there's no in-app link to it in a
 * packaged build, so reaching it at all means a manual navigation) looking
 * at a dead page. admin.ts now redirects straight back to the app instead —
 * see its own comment. Simulates the packaged condition with an init script
 * defining window.__TAURI_INTERNALS__ before any page script runs — the same
 * global isPackagedApp() (vocab-source.ts) checks — so this exercises the
 * real admin.html/admin.ts pipeline exactly as a Tauri WebView2 would
 * present it, not a synthetic DOM fixture.
 */
test.describe('admin panel in a packaged build', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      // @ts-expect-error — test-only global, mirrors what Tauri's webview injects
      window.__TAURI_INTERNALS__ = {};
    });
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
