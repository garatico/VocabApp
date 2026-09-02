import { test, expect } from '@playwright/test';

/**
 * My Lists' and My Content's backup/restore — the disaster-recovery path
 * both files' own header comments describe: everything lives only in
 * localStorage, so this is the whole safety net. Downloads the real
 * backup, wipes storage (the "cleared site data" scenario the feature
 * exists for), and restores from the same file — a real round trip, not
 * just a check that a button produces *a* file.
 *
 * Uses download.path() rather than saveAs() to a chosen destination —
 * saveAs's own copy hit an intermittent EPERM in this sandbox; path()
 * hands back Playwright's own already-downloaded file directly, which
 * setInputFiles can read from without any copy at all.
 */

test('My Lists: backing up, wiping storage, and restoring brings a list back', async ({ page }) => {
  await page.goto('/');
  await page.locator('#loadingSpinner').waitFor({ state: 'hidden' });
  await page.locator('.mode-tab[data-mode="mylists"]').click();

  await page.locator('.ml-single-head .ml-new-list-btn').click();
  const nameInput = page.locator('.ml-list-name-input');
  await nameInput.fill('BackupRoundTrip');
  await nameInput.press('Enter');

  const searchInput = page.locator('.ml-add-input');
  await searchInput.fill('casa');
  await page.locator('.ml-add-result-word', { hasText: /^casa$/ }).locator('xpath=..').locator('.ml-add-btn').click();
  await searchInput.fill('');
  await expect(page.locator('.ml-word-text')).toHaveText('casa');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('.ml-backup-btn').click(),
  ]);
  const filePath = await download.path();
  expect(filePath).toBeTruthy();

  // The "cleared site data" scenario this feature exists for.
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator('#loadingSpinner').waitFor({ state: 'hidden' });
  await page.locator('.mode-tab[data-mode="mylists"]').click();
  // Exact text — .ml-list-empty is reused (with modifier classes) for the
  // Smart/Cross-Language/Testing-Profiles sections' own empty hints too.
  await expect(page.getByText('No lists yet.')).toBeVisible();

  // Scoped to #myListsWrap — every mode's own file input lives in the DOM
  // simultaneously (only the section is hidden/shown), so an unscoped
  // input[type="file"] can match more than one once other modes have been
  // visited too.
  await page.locator('#myListsWrap input[type="file"]').setInputFiles(filePath!);
  await expect(page.locator('.ml-list-name', { hasText: 'BackupRoundTrip' })).toBeVisible();
  await page.locator('.ml-list-name', { hasText: 'BackupRoundTrip' }).click();
  await expect(page.locator('.ml-word-text')).toHaveText('casa');
});

test('My Content: backing up, wiping storage, and restoring brings a word back', async ({ page }) => {
  await page.goto('/');
  await page.locator('#loadingSpinner').waitFor({ state: 'hidden' });
  await page.locator('.mode-tab[data-mode="myContent"]').click();

  await page.getByPlaceholder('e.g. cat').fill('testword');
  await page.getByPlaceholder('Word in Spanish').fill('palabraprueba');
  await page.getByRole('button', { name: 'Add word(s)' }).click();
  await expect(page.locator('.mc-row-title')).toContainText('palabraprueba — testword');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download my content' }).click(),
  ]);
  const filePath = await download.path();
  expect(filePath).toBeTruthy();

  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator('#loadingSpinner').waitFor({ state: 'hidden' });
  await page.locator('.mode-tab[data-mode="myContent"]').click();
  // Exact text — .mc-empty is shared by every section's own empty state.
  await expect(page.getByText('No words added yet.')).toBeVisible();

  // setInputFiles targets the hidden <input type="file"> directly rather
  // than clicking "Load a file…" first, which would open a real OS file
  // picker Playwright doesn't control.
  await page.locator('#myContentWrap input[type="file"]').setInputFiles(filePath!);
  await expect(page.locator('.mc-row-title')).toContainText('palabraprueba — testword');
});
