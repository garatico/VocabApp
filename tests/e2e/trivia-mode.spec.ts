import { test, expect } from '@playwright/test';
import { startMode, extractQuoted } from './helpers.ts';

/**
 * Trivia — default sub-mode is "Type the Answer". Regression coverage for
 * the review-blank bug: reopening a question via Back used to always show
 * an empty, disabled box, right or wrong, discarding any trace of what had
 * been resolved — see renderTypeInput's own comment in trivia-mode.ts.
 */
test('reviewing an answered question via Back shows the resolved state, not a blank box', async ({ page }) => {
  await startMode(page, 'trivia');

  // Read the bank size from the counter instead of hard-coding it — how many
  // trivia questions exist is data, not something this test should pin down.
  const counter = page.locator('.tv-counter');
  const total = /\/\s*(\d+)/.exec(await counter.textContent() ?? '')?.[1];
  expect(total).toBeTruthy();

  const input = page.locator('.recall-input');
  await input.fill('zzz-definitely-not-the-answer');
  await input.press('Enter');

  const feedback = page.locator('.tv-feedback');
  await expect(feedback).toHaveClass(/bad/);
  const canonicalAnswer = extractQuoted(await feedback.textContent() ?? '');

  await page.locator('.tv-nav-btn', { hasText: 'Next' }).click();
  await expect(counter).toHaveText(`2 / ${total}`);

  await page.locator('.tv-nav-btn', { hasText: 'Back' }).click();
  await expect(counter).toHaveText(`1 / ${total}`);
  await expect(input).toBeDisabled();
  await expect(input).toHaveValue(canonicalAnswer);
  await expect(feedback).toHaveClass(/bad/);
});

test('Give Up offers a "Practice missed" run of just the wrong answers', async ({ page }) => {
  await startMode(page, 'trivia');

  await page.locator('.recall-input').fill('zzz-definitely-not-the-answer');
  await page.locator('.recall-input').press('Enter');
  const missedQuestion = await page.locator('.tv-prompt-word').textContent();

  await page.locator('.tv-giveup-btn').click();
  const retryBtn = page.locator('.summary-retry-btn').first();
  await expect(retryBtn).toHaveText('↺ Practice 1');

  await retryBtn.click();
  await expect(page.locator('.tv-counter')).toHaveText('1 / 1');
  await expect(page.locator('.tv-prompt-word')).toHaveText(missedQuestion ?? '');
});
