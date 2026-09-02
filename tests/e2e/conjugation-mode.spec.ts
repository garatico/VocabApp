import { test, expect } from '@playwright/test';
import { startMode } from './helpers.ts';

/**
 * Conjugation mode, default Grid view — Spanish's most frequent verb is
 * "ser" (to be), and its Presente "yo" form is the fixed, permanent fact
 * "soy". Unlike the other Phase 1 specs this one does hard-code a real
 * answer rather than reading it out of the page, since there's no data
 * attribute exposing a conjugated form the way Table/Picture Quiz expose a
 * translation — the verb name is asserted explicitly first, so a future
 * change to the default verb pool fails here with a clear reason instead of
 * a confusing "soy" mismatch somewhere else.
 */
test('answering correctly marks the form, and Give Up reveals the rest', async ({ page }) => {
  await startMode(page, 'conjugation');

  const firstCard = page.locator('.conj-card').first();
  await expect(firstCard.locator('.conj-verb-spanish')).toHaveText('ser');

  const firstInput = firstCard.locator('.conj-drill-input').first();
  await firstInput.fill('soy');
  await firstInput.press('Enter');
  await expect(firstInput).toHaveClass(/correct/);
  await expect(firstInput).toBeDisabled();

  // One global Give Up for the whole quiz, not per-card.
  await page.locator('.conj-giveup-btn').click();

  const secondInput = firstCard.locator('.conj-drill-input').nth(1);
  await expect(secondInput).toHaveClass(/missed/);
  await expect(secondInput).toBeDisabled();
  await expect(secondInput).not.toHaveValue('');
  // The one already answered correctly keeps its own state — Give Up
  // resolves what's left, it doesn't re-grade what's already settled.
  await expect(firstInput).toHaveClass(/correct/);
});

test('One at a Time: Give Up offers a "Practice missed" run of just the wrong forms', async ({ page }) => {
  await page.goto('/');
  await page.locator('#loadingSpinner').waitFor({ state: 'hidden' });
  await page.locator('.mode-tab[data-mode="conjugation"]').click();
  await page.locator('[data-view="oneatatime"]').click();
  await page.locator('#startBtn').click();

  const input = page.locator('.conj-drill-input');
  await input.fill('soy');
  await input.press('Enter');

  await page.locator('.conj-giveup-btn').click();
  const retryBtn = page.locator('.summary-retry-btn').first();
  await expect(retryBtn).toBeVisible();
  const missedCount = /Practice (\d+)/.exec(await retryBtn.textContent() ?? '')?.[1];
  expect(missedCount).toBeTruthy();

  await retryBtn.click();
  await expect(page.locator('.tv-counter')).toHaveText(`1 / ${missedCount}`);
});
