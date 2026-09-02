import { test, expect } from '@playwright/test';

/**
 * Admin panel — Word Editor. Unlike every other mode tested so far, this
 * writes to the real SQLite database (see CLAUDE.md's admin-panel gating),
 * so this test edits a field, verifies the save persisted across a reload,
 * and then reverts it back to the original value as its own last step —
 * this suite should never leave a permanent mark on the real data.
 *
 * `hablar` is Spanish's most frequent verb — a stable, permanent fact about
 * this checked-in dataset, the same reasoning table-mode.spec.ts and
 * conjugation-mode.spec.ts already rely on.
 */
test('editing a word persists across reload, and the change is real', async ({ page }) => {
  await page.goto('/admin');

  const searchInput = page.locator('#searchInput');
  await searchInput.fill('hablar');
  const wordItem = page.locator('.word-item', { has: page.locator('.word-item-key', { hasText: /^hablar$/ }) });
  await wordItem.click();

  const notesField = page.locator('#editNotes');
  const original = await notesField.inputValue();
  const marker = ' [e2e marker]';

  await notesField.fill(original + marker);
  await page.locator('#saveBtn').click();
  await expect(page.locator('#statusMessage')).toContainText('Saved');

  await page.reload();
  await page.locator('#searchInput').fill('hablar');
  await page.locator('.word-item', { has: page.locator('.word-item-key', { hasText: /^hablar$/ }) }).click();
  await expect(page.locator('#editNotes')).toHaveValue(original + marker);

  // Revert — this suite must never leave a permanent mark on real data.
  await page.locator('#editNotes').fill(original);
  await page.locator('#saveBtn').click();
  await expect(page.locator('#statusMessage')).toContainText('Saved');
});
