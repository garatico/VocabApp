import { test, expect } from '@playwright/test';
import { startMode } from './helpers.ts';

/**
 * Picture Quiz — default sub-mode is "Type the Word": each card's own
 * data-word attribute *is* the correct answer (the target-language word
 * matching the picture), so this doesn't need to know any real vocabulary
 * ahead of time.
 */
test('answering correctly marks the card, and Give Up reveals the rest', async ({ page }) => {
  await startMode(page, 'picture');

  const cards = page.locator('.picture-card');
  await expect(cards.first()).toBeVisible();

  const firstInput = cards.first().locator('.picture-card-input');
  const answer = await firstInput.getAttribute('data-word');
  await firstInput.fill(answer ?? '');
  await firstInput.press('Enter');
  await expect(cards.first()).toHaveClass(/correct/);
  await expect(firstInput).toBeDisabled();

  await page.locator('.picture-give-up-btn').click();

  // Every other card on the page was left unanswered — Give Up reveals them
  // all rather than just the one under test.
  const secondCard = cards.nth(1);
  await expect(secondCard).toHaveClass(/revealed/);
  await expect(secondCard.locator('.picture-card-input')).not.toHaveValue('');
});

test('Give Up offers a "Practice missed" run of just the wrong cards', async ({ page }) => {
  await startMode(page, 'picture');

  const cards = page.locator('.picture-card');
  const firstInput = cards.first().locator('.picture-card-input');
  const answer = await firstInput.getAttribute('data-word');
  await firstInput.fill(answer ?? '');
  await firstInput.press('Enter');
  await expect(cards.first()).toHaveClass(/correct/);

  await page.locator('.picture-give-up-btn').click();
  const retryBtn = page.locator('.summary-retry-btn').first();
  await expect(retryBtn).toBeVisible();
  const missedCount = /Practice (\d+)/.exec(await retryBtn.textContent() ?? '')?.[1];
  expect(missedCount).toBeTruthy();

  await retryBtn.click();
  // The just-answered word is gone from the retried set.
  await expect(page.locator(`.picture-card-input[data-word="${answer}"]`)).toHaveCount(0);
});
