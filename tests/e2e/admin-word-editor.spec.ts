import { test, expect } from '@playwright/test';

/**
 * (The list is scoped to #wordList: the Conjugation tab keeps its own verb
 * list of `.word-item`s in the DOM, and "hablar" is in it too.)
 *
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
/**
 * Searching before the panel's initial word list has loaded is a race: the
 * initial (unfiltered) response can land after the filtered one and replace it.
 * Under parallel load that is exactly what happened, so wait for the first list
 * to appear before typing a search.
 */
async function searchForHablar(page: import('@playwright/test').Page): Promise<void> {
  await expect(page.locator('#wordList .word-item').first()).toBeVisible();
  await page.locator('#searchInput').fill('hablar');
}

const MARKER = ' [e2e marker]';

/**
 * The test writes to the real database and reverts as its *last step* — so a
 * failure anywhere before that (a timeout, a redirect, a slow server) used to
 * leave the marker in the data permanently. This runs whether the test passed
 * or not and strips any trailing marker through the API.
 */
test.afterEach(async ({ request }) => {
  const list = await request.get('/api/admin/vocab?lang=spanish&search=hablar&limit=5');
  const body = await list.json() as { data?: { word: string; notes: string }[] };
  const word = body.data?.find(w => w.word === 'hablar');
  if (!word || !word.notes.endsWith(MARKER)) return;
  let notes = word.notes;
  while (notes.endsWith(MARKER)) notes = notes.slice(0, -MARKER.length);
  await request.post('/api/admin/vocab/hablar?lang=spanish', { data: { notes } });
});

test('editing a word persists across reload, and the change is real', async ({ page }) => {
  await page.goto('/admin');

  await searchForHablar(page);
  const wordItem = page.locator('#wordList .word-item', { has: page.locator('.word-item-key', { hasText: /^hablar$/ }) });
  await wordItem.click();

  const notesField = page.locator('#editNotes');
  const original = await notesField.inputValue();
  const marker = MARKER;

  await notesField.fill(original + marker);
  await page.locator('#saveBtn').click();
  await expect(page.locator('#adminToastContainer .admin-toast-message').last()).toContainText('Saved');

  await page.reload();
  await searchForHablar(page);
  await page.locator('#wordList .word-item', { has: page.locator('.word-item-key', { hasText: /^hablar$/ }) }).click();
  await expect(page.locator('#editNotes')).toHaveValue(original + marker);

  // Revert — this suite must never leave a permanent mark on real data.
  await page.locator('#editNotes').fill(original);
  await page.locator('#saveBtn').click();
  await expect(page.locator('#adminToastContainer .admin-toast-message').last()).toContainText('Saved');
});
