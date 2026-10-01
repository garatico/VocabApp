import { test, expect } from '@playwright/test';
import { disableSimpleMode } from './helpers.ts';

/**
 * Nested folders in the Testing Profiles picker: a folder's name is its whole path, but the picker draws a
 * tree — each level shows only its own name, opens with its own click, and no bar passes the window's edge.
 */
test('picker folders nest: click through each level, show leaf names, stay inside the window', async ({ page }) => {
  await disableSimpleMode(page);
  await page.addInitScript(() => {
    if (window.localStorage.getItem('vq_presets_table')) return;
    window.localStorage.setItem('vq_presets_table', JSON.stringify({
      Top: { folders: ['Spanish'] }, Mid: { folders: ['Spanish/Verbs'] }, Deep: { folders: ['Spanish/Verbs/Irregular'] },
    }));
  });
  await page.goto('/');
  await page.locator('#loadingSpinner').waitFor({ state: 'hidden' });
  await page.locator('.mode-tab[data-mode="table"]').click();
  await page.locator('#presetsBtn').click();

  const folder = (leaf: string) => page.locator('.preset-picker-folder', { has: page.locator('.preset-picker-folder-name', { hasText: new RegExp(`^${leaf}$`, 'i') }) });
  const apply = (n: string) => page.locator('.preset-picker-apply', { hasText: n });

  await expect(folder('Spanish')).toBeVisible();
  await expect(folder('Verbs')).toHaveCount(0);                              // a subfolder is not listed until its parent opens
  await expect(page.locator('.preset-picker-folder-name', { hasText: '/' })).toHaveCount(0);   // never a full path

  await folder('Spanish').click();
  await expect(apply('Top')).toBeVisible();
  await expect(folder('Verbs')).toBeVisible();
  await expect(apply('Mid')).toHaveCount(0);

  await folder('Verbs').click();
  await expect(apply('Mid')).toBeVisible();
  await expect(folder('Irregular')).toBeVisible();
  await expect(apply('Deep')).toHaveCount(0);

  await folder('Irregular').click();
  await expect(apply('Deep')).toBeVisible();

  // Every bar and row stays inside the popover.
  const over = await page.evaluate(() => {
    const pop = document.querySelector('#presetPickerPopover') as HTMLElement;
    const right = pop.getBoundingClientRect().right;
    return Array.from(pop.children).map(e => e.getBoundingClientRect().right - right).filter(d => d > 0.5);
  });
  expect(over, 'nothing passes the popover edge').toEqual([]);
});
