import { test, expect } from '@playwright/test';

/**
 * My Content — adding a custom word, editing a real word's fields, and the
 * gloss add/remove feature added earlier this session. Also where a real
 * bug turned up while writing this test (not a pre-existing regression,
 * a fresh find): editing any field on a real word that already has a
 * difficulty recorded an unrelated, unintended "difficulty changed"
 * override on every save, because the comparison coerced the typed value
 * to a number but never coerced the word's own (server-sent-as-string)
 * value the same way. Fixed alongside this test — see the comment on
 * setWordFields's call site in my-content-mode.ts.
 */

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.locator('#loadingSpinner').waitFor({ state: 'hidden' });
  await page.locator('.mode-tab[data-mode="myContent"]').click();
});

test('adding a custom word shows up in the list below', async ({ page }) => {
  await page.getByPlaceholder('e.g. cat').fill('testword');
  await page.getByPlaceholder('Word in Spanish').fill('palabraprueba');
  await page.getByRole('button', { name: 'Add word(s)' }).click();

  await expect(page.locator('.mc-row-title')).toContainText('palabraprueba — testword');
});

test('a custom word with additional senses is hideable/reorderable like a real word', async ({ page }) => {
  // extraGlosses is purely additive — translation stays the one required,
  // primary field — and once a custom word has more than one gloss, the
  // same "Edit an existing word" hide/reorder/add-gloss UI real words use
  // already works on it too, since both flow through toWord()'s glosses
  // array the same way. This proves that connection, not just that the
  // field saves.
  await page.getByPlaceholder('e.g. cat').fill('to chat');
  await page.getByPlaceholder('one additional sense per line').fill('to converse\nto talk casually');
  await page.getByPlaceholder('Word in Spanish').fill('charlar');
  await page.getByRole('button', { name: 'Add word(s)' }).click();

  await page.getByPlaceholder('Search for a word to edit…').fill('charlar');
  // "charlar" also happens to be real Spanish vocabulary already in the
  // dataset — loadRawWords() lists custom words first, so .first() is the
  // one just added, not a same-spelling coincidence from the real data.
  await page.locator('.mc-word-result-word', { hasText: /^charlar$/ }).first().click();

  const detail = page.locator('.mc-word-detail');
  await expect(detail.locator('.mc-gloss-item')).toHaveCount(3);
  await expect(detail.locator('.mc-gloss-checkbox')).toHaveCount(3);

  const converse = detail.locator('.mc-gloss-item', { hasText: 'to converse' });
  await converse.locator('.mc-gloss-checkbox').click();
  await expect(converse).toHaveClass(/mc-gloss-item--hidden/);
});

test('editing a real word only records the field that actually changed', async ({ page }) => {
  await page.getByPlaceholder('Search for a word to edit…').fill('hablar');
  // Exact match — "hablar" is also a substring of "hablarte", the search's
  // other result.
  await page.locator('.mc-word-result-word', { hasText: /^hablar$/ }).click();

  await page.locator('.mc-word-detail').getByPlaceholder('Notes').fill('e2e note only');
  await page.locator('.mc-word-detail').getByRole('button', { name: 'Save changes' }).click();

  // Regression coverage: this used to also show "difficulty → 1" (hablar's
  // own real difficulty, untouched) alongside "notes edited" on every save.
  await expect(page.locator('.mc-row-meta')).toHaveText('notes edited');
});

test('adding and removing a gloss updates the word\'s sense list', async ({ page }) => {
  await page.getByPlaceholder('Search for a word to edit…').fill('hablar');
  // Exact match — "hablar" is also a substring of "hablarte", the search's
  // other result.
  await page.locator('.mc-word-result-word', { hasText: /^hablar$/ }).click();

  const detail = page.locator('.mc-word-detail');
  await expect(detail.locator('.mc-gloss-item')).not.toHaveCount(0);
  const originalGlossCount = await detail.locator('.mc-gloss-item').count();

  await detail.getByPlaceholder('Add a new sense, e.g. "to talk"').fill('to converse');
  await detail.getByRole('button', { name: 'Add gloss' }).click();

  const addedItem = detail.locator('.mc-gloss-item', { hasText: 'to converse' });
  await expect(addedItem).toHaveCount(1);
  await expect(addedItem.locator('.mc-gloss-item-added-tag')).toBeVisible();
  await expect(detail.locator('.mc-gloss-item')).toHaveCount(originalGlossCount + 1);

  await addedItem.locator('.mc-gloss-remove-btn').click();
  await expect(detail.locator('.mc-gloss-item', { hasText: 'to converse' })).toHaveCount(0);
  await expect(detail.locator('.mc-gloss-item')).toHaveCount(originalGlossCount);
});

test('reordering a gloss shows up in a quiz immediately, without a reload', async ({ page }) => {
  // Regression coverage for a real bug found investigating a report that
  // gloss reorder "doesn't appear to save": it did save (localStorage had
  // the right value every time), but app.ts cached each language's fully
  // processed word list the first time it was loaded and never refreshed
  // it — so any My Content override made afterwards, gloss reorder
  // included, was invisible in every quiz mode until a full page reload.
  // Visiting Table mode first, before editing anything, is what used to
  // warm that now-fixed cache and made the bug reproduce.
  await page.locator('.mode-tab[data-mode="table"]').click();
  await page.locator('#startBtn').click();

  await page.locator('.mode-tab[data-mode="myContent"]').click();
  await page.getByPlaceholder('Search for a word to edit…').fill('hablar');
  await page.locator('.mc-word-result-word', { hasText: /^hablar$/ }).click();

  const detail = page.locator('.mc-word-detail');
  const spoke = detail.locator('.mc-gloss-item', { hasText: 'spoke' });
  // "Move earlier" four times — hablar's glosses start as talk/talks/
  // speak/speaks/spoke/talked, so this brings "spoke" (5th) all the way to
  // the front.
  for (let i = 0; i < 4; i++) await spoke.locator('.mc-gloss-move-btn').first().click();
  await expect(detail.locator('.mc-gloss-item').first()).toContainText('spoke');

  // Switching tabs alone reuses whatever Table already rendered from the
  // #startBtn click above — a fresh Start Quiz is what has to pick up the
  // edit, the same as a learner starting a new quiz after editing a word.
  await page.locator('.mode-tab[data-mode="table"]').click();
  await page.locator('#startBtn').click();
  const nextPage = page.locator('#tablePagerTop .pager-btn[aria-label="Next page"]');
  await nextPage.click();
  const input = page.locator('input[data-word="hablar"]');
  await input.locator('xpath=..').locator('.reveal-btn').click();
  await expect(input).toHaveValue(/^spoke/);
});
