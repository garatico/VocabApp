import { test, expect } from '@playwright/test';

/**
 * History mode — a finished quiz has to actually show up here, and the
 * missed words have to land in "Due for Review". Deliberately uses Give Up
 * rather than answering for real: it's the fastest way to a "finished quiz"
 * from a clean slate, and exercises the same completion path (recordMastery
 * in table-controls.ts) that answering every word for real would.
 */

test('a finished quiz appears in Recent sessions and Due for Review', async ({ page }) => {
  await page.goto('/');
  await page.locator('#loadingSpinner').waitFor({ state: 'hidden' });

  // A single page's worth, so completion doesn't depend on pagination.
  await page.locator('#sizeSelect').selectOption('100');
  await page.locator('#startBtn').click();
  await page.locator('#tableReset').click();
  await expect(page.locator('#tableSummary')).toBeVisible();

  await page.locator('.mode-tab[data-mode="history"]').click();

  const sessionRow = page.locator('.history-session-table tbody tr').first();
  await expect(sessionRow).toContainText('Table');
  await expect(sessionRow).toContainText('0 / 100');

  await expect(page.locator('.history-review .history-trouble-item')).not.toHaveCount(0);
});
