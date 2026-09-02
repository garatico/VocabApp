import { test, expect, type Page } from '@playwright/test';

/**
 * Phase 0 smoke test — proves the harness itself works end to end (real
 * dev server, real browser, real vocabulary data) before any mode gets its
 * own flow-specific test. Not meant to catch mode bugs; see the scoped
 * phases for those.
 *
 * Each test gets a fresh browser context from Playwright by default, so
 * localStorage (every mode's own state — vq_/s_/uc_ prefixes) starts empty
 * without needing to clear it by hand.
 */

/** Collects console errors and uncaught page errors for the life of a test,
 *  so a test can assert none happened alongside whatever else it checks. */
function trackPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', err => errors.push(err.message));
  return errors;
}

test('app loads, hides the spinner, and lands on Table mode', async ({ page }) => {
  const errors = trackPageErrors(page);

  await page.goto('/');
  await expect(page).toHaveTitle('VocabApp');
  await expect(page.locator('#loadingSpinner')).toBeHidden();

  const tableTab = page.locator('.mode-tab[data-mode="table"]');
  await expect(tableTab).toHaveClass(/active/);
  await expect(page.locator('#tableArea')).toBeVisible();

  expect(errors).toEqual([]);
});

test('switching mode tabs shows the matching section and no console errors', async ({ page }) => {
  const errors = trackPageErrors(page);
  await page.goto('/');
  await expect(page.locator('#loadingSpinner')).toBeHidden();

  const modes: { mode: string; area: string }[] = [
    { mode: 'picture',  area: '#pictureArea' },
    { mode: 'trivia',   area: '#triviaArea' },
    { mode: 'mylists',  area: '#myListsArea' },
    { mode: 'settings', area: '#settingsArea' },
  ];

  for (const { mode, area } of modes) {
    await page.locator(`.mode-tab[data-mode="${mode}"]`).click();
    await expect(page.locator(area)).toBeVisible();
    await expect(page.locator(`.mode-tab[data-mode="${mode}"]`)).toHaveClass(/active/);
  }

  expect(errors).toEqual([]);
});
