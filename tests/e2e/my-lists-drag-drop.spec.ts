import { test, expect } from '@playwright/test';
import { disableSimpleMode } from './helpers.ts';

/**
 * My Lists — dragging a list card onto a folder header adds it to that
 * folder (sidebar.ts's makeListDraggable/makeFolderDropTarget), the same
 * outcome as the existing "Folders" checkbox dropdown in a list's own
 * filter row (panel.ts), just faster. The first drag-and-drop feature in
 * this codebase.
 */
test.beforeEach(async ({ page }) => {
  await disableSimpleMode(page);
  await page.goto('/');
  await page.locator('#loadingSpinner').waitFor({ state: 'hidden' });
  await page.locator('.mode-tab[data-mode="mylists"]').click();
});

test('dragging a single-language list onto a folder adds it there', async ({ page }) => {
  // Create a list.
  await page.locator('.ml-single-head .ml-new-list-btn:not(.ml-new-folder-btn)').click();
  const nameInput = page.locator('.ml-list-name-input');
  await nameInput.fill('DragTestList');
  await nameInput.press('Enter');

  // Create a folder to drop it into.
  page.once('dialog', dialog => dialog.accept('DragTestFolder'));
  await page.locator('.ml-single-head .ml-new-folder-btn').click();

  const listCard = page.locator('.ml-single-item', { has: page.locator('.ml-list-name', { hasText: /^DragTestList$/ }) });
  const folderHead = page.locator('.ml-folder-head', { hasText: 'DragTestFolder' });

  await expect(listCard).toBeVisible();
  await listCard.dragTo(folderHead);

  // The card now renders nested inside the folder's own body, and the
  // right-hand panel's "Folders" dropdown (already showing this list, since
  // creating one selects it) reflects the same assignment — two independent
  // confirmations the drop actually persisted, not just moved the DOM node.
  const folderBody = page.locator('.ml-folder-group', { has: folderHead }).locator('.ml-folder-body');
  await expect(folderBody.locator('.ml-list-name', { hasText: /^DragTestList$/ })).toBeVisible();
  await expect(page.locator('.ml-chip-dropdown-toggle', { hasText: 'DragTestFolder' })).toBeVisible();
});

test('a smart list cannot be dropped onto a single-language list folder', async ({ page }) => {
  // Folder to try (wrongly) dropping into.
  page.once('dialog', dialog => dialog.accept('SingleOnlyFolder'));
  await page.locator('.ml-single-head .ml-new-folder-btn').click();

  // A smart list — same inline name-then-Enter creation flow as a plain list.
  await page.locator('.ml-smart-head .ml-new-list-btn:not(.ml-new-folder-btn)').click();
  const smartNameInput = page.locator('.ml-list-name-input');
  await smartNameInput.fill('DragTestSmart');
  await smartNameInput.press('Enter');

  const smartCard = page.locator('.ml-smart-item', { has: page.locator('.ml-list-name', { hasText: /^DragTestSmart$/ }) });
  const folderHead = page.locator('.ml-folder-head', { hasText: 'SingleOnlyFolder' });
  await expect(smartCard).toBeVisible();

  await smartCard.dragTo(folderHead);

  // Rejected by the kind/sectionId mismatch in makeFolderDropTarget — the
  // folder (scoped to Single-Language Lists) stays empty.
  const folderBody = page.locator('.ml-folder-group', { has: folderHead }).locator('.ml-folder-body');
  await expect(folderBody).toContainText('No lists in this folder yet.');
});
