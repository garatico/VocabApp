import { test, expect } from '@playwright/test';
import { startMode } from './helpers.ts';

/**
 * Table mode — default controls are Spanish, "Most Common" pool, Word→Meaning
 * direction, so the quiz is deterministic: the same checked-in vocabulary.db
 * always puts the same word at rank 1. The correct translation is read out
 * of the row's own data-word-json rather than hard-coded, so this doesn't
 * depend on knowing what that word actually is.
 */
test('answering correctly marks the row, and Give Up reveals what was missed', async ({ page }) => {
  await startMode(page, 'table');

  // Word cells and input cells alternate flatly in the DOM regardless of how
  // many visual columns Table's layout uses, so the Nth word-cell always
  // pairs with the Nth input — no need to walk the DOM from one to the other.
  const firstInput = page.locator('input[data-word]').first();
  const firstWordJson = await page.locator('[data-word-json]').first().getAttribute('data-word-json');
  const firstWord = JSON.parse(firstWordJson ?? '{}');
  await firstInput.fill(firstWord.translation);
  await firstInput.press('Enter');
  await expect(firstInput).toHaveClass(/correct/);
  await expect(firstInput).toBeDisabled();

  const secondInput = page.locator('input[data-word]').nth(1);
  await secondInput.fill('zzz-definitely-not-the-answer');
  await secondInput.press('Enter');
  // A wrong answer isn't graded live — only "Give Up" resolves it — so at
  // this point it should still be unmarked and still editable.
  await expect(secondInput).not.toHaveClass(/correct/);
  await expect(secondInput).toBeEnabled();

  await page.locator('#tableReset').click();
  await expect(secondInput).toHaveClass(/incorrect/);
  await expect(secondInput).toBeDisabled();
  // Give Up replaces the wrong guess with the real answer — never leaves it
  // showing what was typed, and never leaves it blank either.
  await expect(secondInput).not.toHaveValue('zzz-definitely-not-the-answer');
  await expect(secondInput).not.toHaveValue('');
});
