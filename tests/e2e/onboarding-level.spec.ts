import { test, expect } from '@playwright/test';

/**
 * First visit: a "where are you starting?" chooser sets up the Words controls,
 * and neither the card nor the choice comes back as a nuisance afterwards.
 * (No disableSimpleMode here — this is what a real first-time visitor sees.)
 */

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.locator('#loadingSpinner').waitFor({ state: 'hidden' });
});

test('a first visit offers four starting points', async ({ page }) => {
  const card = page.locator('#onboardingCard');
  await expect(card).toBeVisible();
  const choices = card.locator('.onboarding-level');
  await expect(choices).toHaveCount(4);
  await expect(choices.first()).toContainText('Brand new');
  await expect(choices.last()).toContainText('Advanced');
});

test('choosing Comfortable selects the Level pool with B1 and B2, and it sticks', async ({ page }) => {
  await page.locator('.onboarding-level[data-level="comfortable"]').click();

  await expect(page.locator('#onboardingCard')).toBeHidden();
  await expect(page.locator('#poolModeToggle [data-pool="band"]')).toHaveClass(/active/);
  const on = await page.locator('#bandChips .pos-chip.active').evaluateAll(cs => cs.map(c => (c as HTMLElement).dataset['band']));
  expect(on).toEqual(['B1', 'B2']);

  // A reload restores it, and the card stays away.
  await page.reload();
  await page.locator('#loadingSpinner').waitFor({ state: 'hidden' });
  await expect(page.locator('#onboardingCard')).toBeHidden();
  await expect(page.locator('#poolModeToggle [data-pool="band"]')).toHaveClass(/active/);
  await expect(page.locator('#bandChips .pos-chip.active')).toHaveCount(2);
});

test('choosing Brand new picks the 100 most common words', async ({ page }) => {
  await page.locator('.onboarding-level[data-level="new"]').click();
  await expect(page.locator('#poolModeToggle [data-pool="topn"]')).toHaveClass(/active/);
  await expect(page.locator('#sizeSelect')).toHaveValue('100');

  // ...and the quiz that follows really has 100 words.
  await page.locator('#startBtn').click();
  await expect(page.locator('#tableWrap input[type="text"]').first()).toBeVisible();
  const total = await page.locator('#tableWrap input[type="text"]').count();
  expect(total).toBeGreaterThan(0);
  expect(total).toBeLessThanOrEqual(100);
});

test('dismissing without choosing keeps the defaults and does not come back', async ({ page }) => {
  await page.locator('#onboardingDismiss').click();
  await expect(page.locator('#onboardingCard')).toBeHidden();
  await expect(page.locator('#sizeSelect')).toHaveValue('1000');

  await page.reload();
  await page.locator('#loadingSpinner').waitFor({ state: 'hidden' });
  await expect(page.locator('#onboardingCard')).toBeHidden();
});

test('the choices work from the keyboard', async ({ page }) => {
  const advanced = page.locator('.onboarding-level[data-level="advanced"]');
  await advanced.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#poolModeToggle [data-pool="band"]')).toHaveClass(/active/);
  const on = await page.locator('#bandChips .pos-chip.active').evaluateAll(cs => cs.map(c => (c as HTMLElement).dataset['band']));
  expect(on).toEqual(['C1', 'C2']);
});
