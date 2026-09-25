import { test, expect } from '@playwright/test';
import { disableSimpleMode } from './helpers.ts';

/**
 * After a quiz with misses, the summary strip offers to add them to a list,
 * and doing so really lands the words in that list.
 */
test('Give Up on a Table quiz offers to add the missed words to a list', async ({ page }) => {
  await disableSimpleMode(page);
  await page.goto('/');
  await page.locator('#loadingSpinner').waitFor({ state: 'hidden' });

  await page.locator('#startBtn').click();
  await page.locator('#tableWrap input[type="text"]').first().waitFor();

  // Give Up reveals everything unanswered, so every word counts as missed.
  page.once('dialog', d => d.accept());
  await page.locator('#tableReset').click();

  const addBtn = page.locator('#tableSummaryTop [data-add-missed], #tableSummary [data-add-missed]').first();
  await expect(addBtn).toBeVisible();
  await expect(addBtn).toContainText(/Add \d+ missed to a list/);

  await addBtn.click();
  const picker = page.locator('#listPickerPopover');
  await expect(picker).toBeVisible();
  await expect(picker).toContainText(/\d+ words? selected/);
});

test('starting a new quiz drops the offer, so it never describes a stale session', async ({ page }) => {
  await disableSimpleMode(page);
  await page.goto('/');
  await page.locator('#loadingSpinner').waitFor({ state: 'hidden' });

  await page.locator('#startBtn').click();
  await page.locator('#tableWrap input[type="text"]').first().waitFor();
  page.once('dialog', d => d.accept());
  await page.locator('#tableReset').click();
  await expect(page.locator('[data-add-missed]').first()).toBeVisible();

  await page.locator('#startBtn').click();
  await page.locator('#tableWrap input[type="text"]').first().waitFor();
  await expect(page.locator('[data-add-missed]')).toHaveCount(0);
});
