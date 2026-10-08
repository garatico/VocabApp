import { test, expect } from '@playwright/test';
import { disableSimpleMode } from './helpers.ts';

/**
 * History mode — a finished quiz has to actually show up here, and the
 * missed words have to land in "Due for Review". Deliberately uses Give Up
 * rather than answering for real: it's the fastest way to a "finished quiz"
 * from a clean slate, and exercises the same completion path (recordMastery
 * in table-controls.ts) that answering every word for real would.
 */

test('a finished quiz appears in Recent sessions and Due for Review', async ({ page }) => {
  await page.goto('/');
  await page.locator('#loadingSpinner').waitFor({ state: 'hidden' });

  // A single page's worth, so completion doesn't depend on pagination.
  await page.locator('#sizeSelect').selectOption('100');
  await page.locator('#startBtn').click();
  await page.locator('#tableReset').click();
  await expect(page.locator('#tableSummary')).toBeVisible();

  await page.locator('.mode-tab[data-mode="history"]').click();

  const sessionRow = page.locator('.history-session-table tbody tr').first();
  await expect(sessionRow).toContainText('Table');
  await expect(sessionRow).toContainText('0 / 100');

  await expect(page.locator('.history-review .history-trouble-item')).not.toHaveCount(0);
});

/**
 * "Omit from Due" per word (srs.ts's exemption set) plus its master switch
 * (Settings → Session History → "Omit from Due" per word). A fake word
 * rather than a real one — srsDueWords only ever reads the schedule store,
 * so nothing here depends on real vocabulary data existing.
 */
test('a word marked exempt is left out of Due for Review, unless the master switch is off', async ({ page }) => {
  await disableSimpleMode(page);
  await page.addInitScript(() => {
    window.localStorage.setItem('vq_lists_spanish', JSON.stringify({ Test: ['zzztestword'] }));
    window.localStorage.setItem('vq_srs_spanish', JSON.stringify({ zzztestword: { box: 1, dueAt: 1 } }));
    window.localStorage.setItem('vq_srs_exempt_spanish', JSON.stringify(['zzztestword']));
  });
  await page.goto('/');
  await page.locator('#loadingSpinner').waitFor({ state: 'hidden' });

  await page.locator('.mode-tab[data-mode="history"]').click();
  await page.locator('#historyTab-review').click();                              // History's views are tabs
  await expect(page.locator('.history-trouble-word', { hasText: 'zzztestword' })).toHaveCount(0);

  // The per-word button shows up on the word's own row in My Lists, marked
  // "on" (excluded) since it's in the exempt set.
  await page.locator('.mode-tab[data-mode="mylists"]').click();
  const exemptBtn = page.locator('.ml-due-exempt-btn');
  await expect(exemptBtn).toHaveClass(/ml-due-exempt-btn--on/);

  // Switch the master toggle off and reload — the button disappears, and the
  // word resumes counting as due, exemption data untouched.
  await page.evaluate(() => window.localStorage.setItem('s_due_exempt_enabled', 'false'));
  await page.reload();
  await page.locator('#loadingSpinner').waitFor({ state: 'hidden' });

  await page.locator('.mode-tab[data-mode="mylists"]').click();
  await expect(page.locator('.ml-due-exempt-btn')).toHaveCount(0);

  await page.locator('.mode-tab[data-mode="history"]').click();
  await page.locator('#historyTab-review').click();                              // History's views are tabs
  await expect(page.locator('.history-trouble-word', { hasText: 'zzztestword' })).toBeVisible();

  // Switching it back on resumes the exemption from the same, untouched data.
  await page.evaluate(() => window.localStorage.setItem('s_due_exempt_enabled', 'true'));
  await page.reload();
  await page.locator('#loadingSpinner').waitFor({ state: 'hidden' });
  await page.locator('.mode-tab[data-mode="history"]').click();
  await page.locator('#historyTab-review').click();                              // History's views are tabs
  await expect(page.locator('.history-trouble-word', { hasText: 'zzztestword' })).toHaveCount(0);
});
