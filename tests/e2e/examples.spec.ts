import { test, expect } from '@playwright/test';
import { startMode } from './helpers.ts';

/**
 * Example sentences (schemaVersion 11), against the checked-in vocabulary.db: once a word is answered, its
 * popover shows its example sentences in the word's own language with their English under them, and a Tatoeba
 * sentence links to its page. Before v11 the "example" of every language but Spanish was its English
 * translation, so the sentence is checked to differ from the English shown under it.
 */
test('an answered word\'s popover shows its examples, each with its English', async ({ page }) => {
  await startMode(page, 'table');
  // The first row with examples that carry translations, answered so its detail is revealed.
  const rows = page.locator('[data-word-json]');
  let row = -1;
  for (let i = 0; i < 20; i++) {
    const w = JSON.parse((await rows.nth(i).getAttribute('data-word-json')) ?? '{}');
    if (w.examples?.length && w.example_translations?.some(Boolean)) { row = i; break; }
  }
  expect(row, 'no word among the first 20 has a translated example').toBeGreaterThanOrEqual(0);
  const word = JSON.parse((await rows.nth(row).getAttribute('data-word-json')) ?? '{}');
  const input = page.locator('input[data-word]').nth(row);
  await input.fill(word.translation);
  await expect(input).toHaveClass(/correct/);

  await rows.nth(row).click();
  const example = page.locator('.tt-example').first();
  await expect(example).toBeVisible();
  const sentence = (await example.locator('.tt-example-text').textContent()) ?? '';
  const english = (await example.locator('.tt-example-tr').textContent()) ?? '';
  expect(sentence.length).toBeGreaterThan(0);
  expect(english.length).toBeGreaterThan(0);
  expect(english).not.toContain(sentence);          // the sentence is not its own translation
  await expect(example.locator('.tt-example-text')).toHaveAttribute('lang', 'es');
});
