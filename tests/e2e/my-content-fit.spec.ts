import { test, expect } from '@playwright/test';
import { disableSimpleMode } from './helpers.ts';

/** My Content fits the window like My Lists does: the editor's own panes scroll, not the page. */

test('every My Content tab fits one screen without page scroll', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await disableSimpleMode(page);
  await page.goto('/');
  await page.locator('#loadingSpinner').waitFor({ state: 'hidden' });
  await page.locator('.mode-tab[data-mode="myContent"]').click();

  for (const tab of ['Words', 'Conjugations', 'Trivia Questions', 'Guess the Blank', 'Pictures']) {
    await page.locator('.mc-tab-btn', { hasText: tab }).click();
    await expect.poll(
      () => page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight),
      { message: `${tab} should not make the page scroll` },
    ).toBe(true);
  }

  // The word list and the conjugation verb list still scroll on their own.
  await page.locator('.mc-tab-btn', { hasText: 'Words' }).click();
  expect(await page.locator('.mc-we .word-list').evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
  await page.locator('.mc-tab-btn', { hasText: 'Conjugations' }).click();
  await expect(page.locator('.mcc-verb-item').first()).toBeVisible();
  expect(await page.locator('.mcc-verb-list').evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
});
