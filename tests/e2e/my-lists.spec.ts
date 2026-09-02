import { test, expect, type Page } from '@playwright/test';

/**
 * My Lists — CRUD + Undo. This is where the Undo-snapshot bugs lived: three
 * separate paths (single remove, bulk remove, bulk move) used to read
 * ctx.selectedList *after* it had already been reassigned by a fallback,
 * restoring words into the wrong list. A fourth, closely-related bug
 * surfaced while writing this test (not one of the original three): Undo
 * restored the data correctly but the word-list panel kept showing "No
 * words in this list yet." — a stale-render ordering issue in
 * afterBulkChange/the single-remove handler, fixed alongside these tests
 * (see word-list.ts's own comments).
 */

async function createList(page: Page, name: string): Promise<void> {
  await page.locator('.ml-single-head .ml-new-list-btn').click();
  const nameInput = page.locator('.ml-list-name-input');
  await nameInput.fill(name);
  await nameInput.press('Enter');
}

async function addWord(page: Page, word: string): Promise<void> {
  const searchInput = page.locator('.ml-add-input');
  await searchInput.fill(word);
  // Exact match — hasText's plain-string form is a substring match, and
  // "casa" is also a substring of "casado"/"casar" among the same results.
  const exactWord = page.locator('.ml-add-result-word', { hasText: new RegExp(`^${word}$`) });
  await exactWord.locator('xpath=..').locator('.ml-add-btn').click();
  // The results dropdown stays open after adding and can push the word list
  // below the viewport's fold — clearing it collapses the dropdown, same as
  // a learner would do next anyway having gotten what they searched for.
  await searchInput.fill('');
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.locator('#loadingSpinner').waitFor({ state: 'hidden' });
  await page.locator('.mode-tab[data-mode="mylists"]').click();
});

test('creating a list and adding a word shows up immediately', async ({ page }) => {
  await createList(page, 'E2E List');
  await expect(page.locator('.ml-panel-title')).toHaveText('E2E List');

  await addWord(page, 'casa');
  await expect(page.locator('.ml-word-text')).toHaveText('casa');
  await expect(page.locator('.ml-stat-chip').first()).toHaveText('1 Word');
});

test('undoing the removal of a list\'s last word restores it in the panel, not just storage', async ({ page }) => {
  await createList(page, 'UndoTest');
  await addWord(page, 'casa');
  await expect(page.locator('.ml-word-text')).toHaveText('casa');

  await page.locator('.ml-remove-btn').click();
  // Removing a list's only word deletes the list itself, and with no other
  // list to fall back to the panel goes to its top-level empty state — not
  // word-list's own "No words in this list yet.", which would (incorrectly)
  // imply the list still exists.
  await expect(page.locator('.ml-panel-empty')).toBeVisible();

  await page.locator('.ml-undo-btn').click();
  // The regression: this used to keep showing the empty panel even though
  // the word really was back in storage — emptying the list deletes it, so
  // Undo has to both recreate it *and* re-render against the corrected
  // selection, not the one from just before recreation.
  await expect(page.locator('.ml-word-text')).toHaveText('casa');
  await expect(page.locator('.ml-panel-empty')).not.toBeVisible();
});

test('undoing a bulk remove of a list\'s only word restores it in the panel', async ({ page }) => {
  await createList(page, 'BulkUndoTest');
  await addWord(page, 'casa');

  await page.locator('.ml-word-check').click();
  await page.locator('button', { hasText: '× Remove' }).click();
  await expect(page.locator('.ml-panel-empty')).toBeVisible();

  await page.locator('.ml-undo-btn').click();
  await expect(page.locator('.ml-word-text')).toHaveText('casa');
});

test('bulk move relocates the word, and Undo brings it back to the source list', async ({ page }) => {
  await createList(page, 'MoveSource');
  await addWord(page, 'casa');
  await createList(page, 'MoveTarget');

  // Back to the source list.
  await page.locator('.ml-list-name', { hasText: 'MoveSource' }).click();
  await expect(page.locator('.ml-word-text')).toHaveText('casa');

  await page.locator('.ml-word-check').click();
  await page.locator('button', { hasText: 'Move to…' }).click();
  await page.locator('.ml-move-popover-item', { hasText: 'MoveTarget' }).click();

  // Moving the source's only word deletes it, so the view follows the
  // selection to MoveTarget — regression coverage for a bug found writing
  // this test: the panel's title used to stay stuck on the deleted list's
  // name while the word list below it correctly showed MoveTarget's
  // contents, an inconsistent header/body split. See afterBulkChange's own
  // comment in word-list.ts.
  await expect(page.locator('.ml-panel-title')).toHaveText('MoveTarget');
  await expect(page.locator('.ml-word-text')).toHaveText('casa');

  await page.locator('.ml-undo-btn').click();
  // Undo explicitly returns to the source list, same as single/bulk remove.
  await expect(page.locator('.ml-panel-title')).toHaveText('MoveSource');
  await expect(page.locator('.ml-word-text')).toHaveText('casa');
});
