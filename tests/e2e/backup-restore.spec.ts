import { test, expect } from '@playwright/test';
import { disableSimpleMode, appReady } from './helpers.ts';

/**
 * My Lists' and My Content's backup/restore — the disaster-recovery path
 * both files' own header comments describe: everything lives only in
 * localStorage, so this is the whole safety net. Downloads the real
 * backup, wipes storage (the "cleared site data" scenario the feature
 * exists for), and restores from the same file — a real round trip, not
 * just a check that a button produces *a* file.
 *
 * The backup's bytes are taken from the Blob the page builds (captured as it
 * is handed to URL.createObjectURL), and given to the file input as a buffer;
 * the test still waits for the download itself. Playwright's saved copy of a
 * download is not reliable on Windows: under load about one run in three read
 * it as EPERM or as empty — saveAs() hit the same EPERM — so the restore got
 * nothing and the list never came back. That was the flakiness, not the app.
 */

type Page = import('@playwright/test').Page;

/** From here on, keep every Blob the page turns into a download URL. */
async function captureDownloadBlobs(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __downloadBlobs?: Blob[] };
    if (w.__downloadBlobs) return;
    w.__downloadBlobs = [];
    const original = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (obj: Blob | MediaSource): string => {
      if (obj instanceof Blob) w.__downloadBlobs!.push(obj);
      return original(obj);
    };
  });
}

/** Click `trigger`, wait for the download it starts, and return the downloaded file's contents. */
async function downloadVia(page: Page, trigger: () => Promise<void>): Promise<{ name: string; mimeType: string; buffer: Buffer }> {
  await captureDownloadBlobs(page);
  const [download] = await Promise.all([page.waitForEvent('download'), trigger()]);
  const text = await page.evaluate(async () => {
    const blobs = (window as unknown as { __downloadBlobs: Blob[] }).__downloadBlobs;
    return blobs[blobs.length - 1].text();
  });
  return { name: download.suggestedFilename() || 'vocabapp-backup.json', mimeType: 'application/json', buffer: Buffer.from(text, 'utf8') };
}

test('My Lists: backing up, wiping storage, and restoring brings a list back', async ({ page }) => {
  // Also reapplied automatically after the mid-test localStorage.clear() +
  // reload below — addInitScript reruns on every navigation of this page,
  // not just the first — so My Lists stays reachable post-wipe too.
  await disableSimpleMode(page);
  await page.goto('/');
  await appReady(page);
  await page.locator('.mode-tab[data-mode="mylists"]').click();

  // :not(.ml-new-folder-btn) — see my-lists.spec.ts's createList helper for why.
  await page.locator('.ml-single-head .ml-new-list-btn:not(.ml-new-folder-btn)').click();
  const nameInput = page.locator('.ml-list-name-input');
  await nameInput.fill('BackupRoundTrip');
  await nameInput.press('Enter');

  const searchInput = page.locator('.ml-add-input');
  await searchInput.fill('casa');
  await page.locator('.ml-add-result-word', { hasText: /^casa$/ }).locator('xpath=..').locator('.ml-add-btn').click();
  await searchInput.fill('');
  await expect(page.locator('.ml-word-text')).toHaveText('casa');

  const backup = await downloadVia(page, () => page.locator('.ml-backup-btn').click());
  expect(backup.buffer.toString('utf8')).toContain('BackupRoundTrip');

  // The "cleared site data" scenario this feature exists for.
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await appReady(page);
  await page.locator('.mode-tab[data-mode="mylists"]').click();
  // Exact text — .ml-list-empty is reused (with modifier classes) for the
  // Smart/Cross-Language/Testing-Profiles sections' own empty hints too.
  await expect(page.getByText('No lists yet.')).toBeVisible();

  // Scoped to #myListsWrap — every mode's own file input lives in the DOM
  // simultaneously (only the section is hidden/shown), so an unscoped
  // input[type="file"] can match more than one once other modes have been
  // visited too.
  await page.locator('#myListsWrap input[type="file"]').setInputFiles(backup);
  await expect(page.locator('.ml-list-name', { hasText: 'BackupRoundTrip' })).toBeVisible();
  // Open it — unless the restore already did (clicking the open list closes it).
  const restored = page.locator('.ml-list-item', { has: page.locator('.ml-list-name', { hasText: 'BackupRoundTrip' }) }).first();
  await expect(async () => {
    if (await page.locator('.ml-word-text').count() === 0) await restored.click();
    await expect(page.locator('.ml-word-text')).toHaveText('casa', { timeout: 1500 });
  }).toPass();
});

test('My Content: backing up, wiping storage, and restoring brings a word back', async ({ page }) => {
  await disableSimpleMode(page);
  await page.goto('/');
  await appReady(page);
  await page.locator('.mode-tab[data-mode="myContent"]').click();

  // Add a word through the Words tab's editor, then look at just the words the
  // user added — that filter is what proves it survives the round trip.
  await page.locator('#mcwe-newWordBtn').click();
  await page.locator('#mcwe-editWord').fill('palabraprueba');
  await page.locator('#mcwe-editTranslation').fill('testword');
  await page.locator('#mcwe-saveBtn').click();
  await page.getByRole('button', { name: 'Added', exact: true }).click();
  await expect(page.locator('.mc-we .word-item .word-item-key')).toHaveText('palabraprueba');

  await page.locator('.mc-file-menu-btn').click();                              // the "Backup & export" menu
  const backup = await downloadVia(page, () => page.getByRole('menuitem', { name: 'Download my content' }).click());
  expect(backup.buffer.toString('utf8')).toContain('palabraprueba');

  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await appReady(page);
  await page.locator('.mode-tab[data-mode="myContent"]').click();
  await page.getByRole('button', { name: 'Added', exact: true }).click();
  await expect(page.locator('.mc-we .word-item')).toHaveCount(0);

  // setInputFiles targets the hidden <input type="file"> directly rather
  // than clicking "Load a file…" first, which would open a real OS file
  // picker Playwright doesn't control.
  await page.locator('#myContentBar input[type="file"]').setInputFiles(backup);
  await page.getByRole('button', { name: 'Added', exact: true }).click();
  await expect(page.locator('.mc-we .word-item .word-item-key')).toHaveText('palabraprueba');
});
