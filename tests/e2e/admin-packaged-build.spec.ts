import { test, expect } from '@playwright/test';

/**
 * Admin panel — packaged build (Tauri/Capacitor, no Express behind the page).
 *
 * A packaged desktop/mobile build ships no server at all, so every admin
 * tab's API call was always going to fail — but before this test existed,
 * each tab independently found that out for itself and threw admin-api.ts's
 * generic "Server returned a non-JSON response — is the Express backend
 * running behind this page?" on top of the #packagedWarning banner that was
 * supposed to be the *whole* explanation. Simulates the packaged condition
 * with an init script defining window.__TAURI_INTERNALS__ before any page
 * script runs — the same global isPackagedApp() (vocab-source.ts) checks —
 * so this exercises the real admin.html/admin.ts pipeline exactly as a
 * Tauri WebView2 would present it, not a synthetic DOM fixture.
 */
test.describe('admin panel in a packaged build', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      // @ts-expect-error — test-only global, mirrors what Tauri's webview injects
      window.__TAURI_INTERNALS__ = {};
    });
  });

  test('shows the packaged-build banner and makes no admin API requests at all', async ({ page }) => {
    const adminRequests: string[] = [];
    page.on('request', req => {
      if (req.url().includes('/api/admin')) adminRequests.push(req.url());
    });

    await page.goto('/admin');

    await expect(page.locator('#packagedWarning')).toBeVisible();
    await expect(page.locator('#packagedWarning')).toContainText('needs the Express backend');

    // Give any would-be eager fetch (Word Editor's initEditor, Conjugation's
    // initConjugation both call their loader immediately) a moment to fire
    // before asserting none did.
    await page.waitForTimeout(500);
    expect(adminRequests).toEqual([]);
  });

  test('clicking through every tab never surfaces a per-tab fetch error', async ({ page }) => {
    await page.goto('/admin');

    for (const tab of ['tableview', 'dbadmin', 'statistics', 'conjugation', 'documentation', 'editor']) {
      await page.locator(`.tab-btn[data-tab="${tab}"]`).click();
      await page.waitForTimeout(300);
      // Neither this generic wiring error nor the word "Express" (which only
      // ever appears inside it) should show up anywhere once the banner is
      // already telling the whole story.
      await expect(page.locator('body')).not.toContainText('non-JSON response');
      await expect(page.locator('.status.error')).not.toContainText('Express backend running behind');
    }

    // The one place "Express backend" is expected to appear: the banner itself.
    await expect(page.locator('#packagedWarning')).toContainText('Express backend');
  });
});
