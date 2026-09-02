import { test, expect } from '@playwright/test';

/**
 * Admin panel — Conjugation Practice tab. Regression coverage for a real
 * bug found earlier this session: this tab called a nonexistent
 * `/api/admin/words` endpoint (should be `/vocab`), so the verb list never
 * loaded — silently, since the fetch just 404'd into the tab's own error
 * text rather than throwing anywhere visible. This is read-only (a drill
 * UI, no answer-checking against the database — see admin-conjugation.ts's
 * own header comment), so no revert needed.
 */
test('the verb list loads and a verb can be selected for drilling', async ({ page }) => {
  await page.goto('/admin');
  await page.locator('[data-tab="conjugation"]').click();

  const verbCount = page.locator('#conjVerbCount');
  await expect(verbCount).not.toHaveText('—');
  await expect(verbCount).not.toHaveText('0');

  const firstVerb = page.locator('.conj-verb-item').first();
  await firstVerb.click();

  await expect(page.locator('#conjTableCard')).toBeVisible();
  await expect(page.locator('.conj-input').first()).toBeVisible();
});
