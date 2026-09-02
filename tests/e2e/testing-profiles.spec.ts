import { test, expect } from '@playwright/test';

/**
 * Testing Profiles — save the current filter bundle from Table mode's own
 * Profiles button, and confirm it reopens cleanly. Full CRUD (rename/
 * delete) lives in My Lists — see my-lists/profile-panel.ts — this only
 * covers the save-here / apply-here path most learners actually use.
 */
test('saving a profile from Table mode makes it reusable', async ({ page }) => {
  await page.goto('/');
  await page.locator('#loadingSpinner').waitFor({ state: 'hidden' });

  await page.locator('#presetsBtn').click();
  const nameInput = page.locator('.preset-picker-save-row input');
  await nameInput.fill('E2E Profile');
  await page.locator('.preset-picker-save-row button', { hasText: 'Save' }).click();

  const savedRow = page.locator('.preset-picker-row', { hasText: 'E2E Profile' });
  await expect(savedRow).toBeVisible();

  // Applying closes the popover without error — it's live for the rest of
  // the session, not something this test needs to inspect the effect of.
  await savedRow.locator('.preset-picker-apply').click();
  await expect(page.locator('#presetPickerPopover')).toHaveCount(0);

  // Also reachable — and deletable — from My Lists' own Testing Profiles
  // section, the same list this popover's Save just wrote into.
  await page.locator('.mode-tab[data-mode="mylists"]').click();
  await expect(page.locator('.ml-list-name', { hasText: 'E2E Profile' })).toBeVisible();
});
