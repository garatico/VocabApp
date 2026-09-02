import { test, expect } from '@playwright/test';

/**
 * Admin panel — DB Admin tab. Regression coverage for the other real bug
 * found earlier this session: the language buttons here (and the Word
 * Editor's own language dropdown) were a hard-coded list of four, silently
 * missing German/Dutch/Chinese even though those were fully editable
 * through the API — fixed by sourcing the list from /api/admin/meta
 * instead. Cache-clear is non-destructive (in-memory only, see db.ts), so
 * this needs no revert.
 */
test('language buttons cover every language the database actually has', async ({ page }) => {
  await page.goto('/admin');
  await page.locator('[data-tab="dbadmin"]').click();

  const expectedLangs = ['chinese', 'dutch', 'french', 'german', 'italian', 'portuguese', 'spanish'];
  for (const lang of expectedLangs) {
    await expect(page.locator(`.clear-lang-cache-btn[data-lang="${lang}"]`)).toBeVisible();
    await expect(page.locator(`.export-btn[data-lang="${lang}"]`)).toBeVisible();
  }
});

test('clearing a language cache round-trips through the server', async ({ page }) => {
  await page.goto('/admin');
  await page.locator('[data-tab="dbadmin"]').click();

  await page.locator('.clear-lang-cache-btn[data-lang="german"]').click();
  await expect(page.locator('#dbStatus')).toContainText(/cleared/i);
  await expect(page.locator('#dbStatus')).toContainText(/german/i);
});

test('exporting a language downloads a real CSV', async ({ page }) => {
  await page.goto('/admin');
  await page.locator('[data-tab="dbadmin"]').click();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('.export-btn[data-lang="spanish"]').click(),
  ]);
  const filePath = await download.path();
  expect(filePath).toBeTruthy();
  await expect(page.locator('#dbStatus')).toContainText(/exported/i);
});
