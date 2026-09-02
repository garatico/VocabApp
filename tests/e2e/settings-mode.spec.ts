import { test, expect } from '@playwright/test';

/**
 * Settings — a changed setting has to actually be read by the mode it
 * configures, not just persist to its own storage key. "Default columns"
 * is a simple, deterministic one to check end to end: 1 column means each
 * table row is one word-pair (2 cells), not the default 2 side by side.
 */
test('changing Default columns to 1 actually narrows the table', async ({ page }) => {
  await page.goto('/');
  await page.locator('#loadingSpinner').waitFor({ state: 'hidden' });

  await page.locator('.mode-tab[data-mode="settings"]').click();
  await page.locator('#settingCols [data-cols="1"]').click();
  await expect(page.locator('#settingCols [data-cols="1"]')).toHaveClass(/active/);

  await page.locator('.mode-tab[data-mode="table"]').click();
  await page.locator('#startBtn').click();

  const firstRow = page.locator('#tableWrap table tr').first();
  await expect(firstRow.locator('td')).toHaveCount(2);
});
