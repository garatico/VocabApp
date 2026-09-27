import { test, expect } from '@playwright/test';
import { disableSimpleMode } from './helpers.ts';

/**
 * The Testing Profiles picker (the Profiles button in Table / Picture / Conjugation) groups profiles
 * under their folders, and each folder can be collapsed or expanded.
 */
test('picker folders collapse and expand, and the choice is remembered', async ({ page }) => {
  await disableSimpleMode(page);
  await page.addInitScript(() => {
    if (window.localStorage.getItem('vq_presets_table')) return;          // seed once, not on every reload
    window.localStorage.setItem('vq_presets_table', JSON.stringify({ Basics: { folders: ['Starter'] }, Verbs: { folders: ['Starter'] }, Solo: {} }));
    window.localStorage.setItem('ml_folders_profiles_table', JSON.stringify(['Starter']));
  });
  await page.goto('/');
  await page.locator('#loadingSpinner').waitFor({ state: 'hidden' });
  await page.locator('.mode-tab[data-mode="table"]').click();

  const open = async (): Promise<void> => { await page.locator('#presetsBtn').click(); };
  const heading = page.locator('.preset-picker-folder', { hasText: 'Starter' });
  const apply = (name: string) => page.locator('.preset-picker-apply', { hasText: name });

  await open();
  await expect(heading).toHaveAttribute('aria-expanded', 'true');
  await expect(apply('Basics')).toBeVisible();
  await expect(apply('Verbs')).toBeVisible();

  await heading.click();                                                   // fold it
  await expect(heading).toHaveAttribute('aria-expanded', 'false');
  await expect(apply('Basics')).toHaveCount(0);
  await expect(apply('Verbs')).toHaveCount(0);
  await expect(apply('Solo')).toBeVisible();                               // profiles outside the folder are untouched
  await expect(page.locator('.preset-picker-popover')).toBeVisible();      // and the picker stayed open

  // Remembered: close the picker and open it again.
  await page.keyboard.press('Escape');
  await open();
  await expect(heading).toHaveAttribute('aria-expanded', 'false');
  await expect(apply('Basics')).toHaveCount(0);
  // The same memory My Lists' Testing Profiles box uses, so the two agree.
  expect(await page.evaluate(() => localStorage.getItem('ml_sidebar_folder_collapsed_profiles_profiles:table:Starter'))).toBe('true');

  await heading.click();                                                   // unfold it
  await expect(heading).toHaveAttribute('aria-expanded', 'true');
  await expect(apply('Basics')).toBeVisible();
});
