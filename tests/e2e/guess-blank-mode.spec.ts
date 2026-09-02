import { test, expect } from '@playwright/test';
import { startMode, extractQuoted } from './helpers.ts';

/**
 * Guess the Blank — same review-blank bug as Trivia's type input, fixed the
 * same way (see renderQuestion's own comment in guess-blank-mode.ts), so
 * this mirrors trivia-mode.spec.ts's test.
 */
test('reviewing an answered question via Back shows the resolved state, not a blank box', async ({ page }) => {
  await startMode(page, 'guessBlank');

  const counter = page.locator('.gb-counter');
  const total = /\/\s*(\d+)/.exec(await counter.textContent() ?? '')?.[1];
  expect(total).toBeTruthy();

  const input = page.locator('.recall-input');
  await input.fill('zzz-definitely-not-the-answer');
  await input.press('Enter');

  const feedback = page.locator('.gb-feedback');
  await expect(feedback).toHaveClass(/bad/);
  const canonicalAnswer = extractQuoted(await feedback.textContent() ?? '');

  await page.locator('.gb-nav-btn', { hasText: 'Next' }).click();
  await expect(counter).toHaveText(`2 / ${total}`);

  await page.locator('.gb-nav-btn', { hasText: 'Back' }).click();
  await expect(counter).toHaveText(`1 / ${total}`);
  await expect(input).toBeDisabled();
  await expect(input).toHaveValue(canonicalAnswer);
  await expect(feedback).toHaveClass(/bad/);
});

test('Give Up offers a "Practice missed" run of just the wrong answers', async ({ page }) => {
  await startMode(page, 'guessBlank');

  await page.locator('.recall-input').fill('zzz-definitely-not-the-answer');
  await page.locator('.recall-input').press('Enter');
  const missedClues = await page.locator('.gb-clues').textContent();

  await page.locator('.gb-giveup-btn').click();
  const retryBtn = page.locator('.summary-retry-btn').first();
  await expect(retryBtn).toHaveText('↺ Practice 1');

  await retryBtn.click();
  await expect(page.locator('.gb-counter')).toHaveText('1 / 1');
  await expect(page.locator('.gb-clues')).toHaveText(missedClues ?? '');
});
