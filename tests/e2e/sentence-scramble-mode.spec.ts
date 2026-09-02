import { test, expect } from '@playwright/test';
import { startMode, extractQuoted } from './helpers.ts';

/**
 * Sentence Scramble — regression coverage for the worst version of the
 * review-blank bug: reopening a wrong answer used to show the *correct*
 * order in its place, which reads as having gotten it right. See settle()'s
 * own comment in sentence-scramble-mode.ts.
 *
 * Chips are clicked in reverse of whatever order the word bank shuffled
 * them into, which is wrong for any sentence longer than one token (every
 * sentence in this dataset is) — no need to know the real correct order to
 * build a guaranteed-wrong one.
 */
test('reviewing a wrong answer via Back shows what was actually submitted, not the correct order', async ({ page }) => {
  await startMode(page, 'sentenceScramble');

  const bankChips = page.locator('.ss-chip--bank');
  const chipCount = await bankChips.count();
  expect(chipCount).toBeGreaterThan(1);

  const submittedOrder: string[] = [];
  for (let i = chipCount - 1; i >= 0; i--) {
    const chip = bankChips.nth(i);
    submittedOrder.push((await chip.textContent()) ?? '');
    await chip.click();
  }
  const submittedText = submittedOrder.join('');

  await page.locator('.ss-check-btn').click();

  const answerRow = page.locator('.ss-answer-row');
  await expect(answerRow).toHaveClass(/ss-answer-row--wrong/);

  const feedback = page.locator('.ss-feedback');
  const correctOrder = extractQuoted(await feedback.textContent() ?? '');
  expect(submittedText).not.toBe(correctOrder.replace(/\s+/g, ''));

  // settle() auto-advances after a delay (longer on a miss) — wait for the
  // question counter to actually move rather than a fixed sleep.
  const counter = page.locator('.ss-counter');
  const firstCounterText = await counter.textContent();
  await expect(counter).not.toHaveText(firstCounterText ?? '');

  await page.locator('.ss-nav-btn', { hasText: 'Back' }).click();
  await expect(counter).toHaveText(firstCounterText ?? '');
  await expect(answerRow).toHaveClass(/ss-answer-row--wrong/);
  await expect(answerRow).toHaveText(submittedText);
});

test('Give Up offers a "Practice missed" run of just the wrong answers', async ({ page }) => {
  await startMode(page, 'sentenceScramble');

  const missedHint = await page.locator('.ss-hint').textContent();
  let bankChips = page.locator('.ss-chip--bank');
  while (await bankChips.count() > 0) {
    await bankChips.last().click();
    bankChips = page.locator('.ss-chip--bank');
  }
  await page.locator('.ss-check-btn').click();
  // settle() auto-advances 1800ms after a miss — wait it out first so Give
  // Up doesn't race that pending advance.
  await page.waitForTimeout(2000);

  await page.locator('.ss-giveup-btn').click();
  const retryBtn = page.locator('.summary-retry-btn').first();
  await expect(retryBtn).toHaveText('↺ Practice 1');

  await retryBtn.click();
  await expect(page.locator('.ss-counter')).toHaveText('1 / 1');
  await expect(page.locator('.ss-hint')).toHaveText(missedHint ?? '');
});
