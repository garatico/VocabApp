import { test, expect, type Page } from '@playwright/test';
import { appReady } from './helpers.ts';

/**
 * Romanian and Russian in Conjugation mode, against the checked-in vocabulary.db: each has its own tenses and
 * pronouns; Romanian's built tenses (perfect compus) are drillable; a Russian past cell takes either gender;
 * Russian may be typed in Latin letters. And the tense chips still toggle after the language is switched —
 * they used to gain a second listener per switch, so a click toggled twice and changed nothing.
 */
async function openConjugation(page: Page, lang: string): Promise<void> {
  await page.addInitScript(l => { window.localStorage.setItem('vq_lang', l); }, lang);
  await page.goto('/');
  await appReady(page);
  await page.locator('.mode-tab[data-mode="conjugation"]').click();
  await expect(page.locator('#conjTenseChips .conj-tense-chip').first()).toBeVisible();
}

/** Leave exactly one tense on: None keeps only the first, then swap the first for `key` if they differ. */
async function onlyTense(page: Page, key: string): Promise<void> {
  const chips = page.locator('#conjTenseChips .conj-tense-chip');
  await page.locator('#conjTensesNone').click();
  const first = await chips.first().getAttribute('data-tense');
  if (first !== key) {
    await chips.locator(`xpath=self::*[@data-tense="${key}"]`).click();
    await chips.first().click();
  }
  await expect(page.locator('#conjTenseChips .conj-tense-chip.active')).toHaveCount(1);
  await expect(page.locator(`#conjTenseChips .conj-tense-chip.active[data-tense="${key}"]`)).toHaveCount(1);
}

function cardFor(page: Page, verb: string) {
  return page.locator('.conj-card').filter({ has: page.locator('.conj-verb-spanish', { hasText: new RegExp(`^${verb}$`) }) }).first();
}

test('Romanian: its own tenses and pronouns, and the perfect compus is drillable', async ({ page }) => {
  await openConjugation(page, 'romanian');
  await expect(page.locator('#conjTenseChips .conj-tense-chip[data-tense="present_perfect"]')).toContainText('Perfect Compus');
  await expect(page.locator('#conjPronounToggles')).toContainText('el / ea');
  await onlyTense(page, 'present_perfect');
  await page.locator('#startBtn').click();
  const fi = cardFor(page, 'fi');
  await expect(fi).toContainText('Perfect Compus');
  const eu = fi.locator('input.conj-drill-input').first();
  await eu.fill('am fost');
  await expect(eu).toHaveClass(/(^|\s)correct(\s|$)/);
});

test('Russian: a past cell takes either gender, and Latin letters are accepted', async ({ page }) => {
  await openConjugation(page, 'russian');
  await onlyTense(page, 'preterite');
  await page.locator('#startBtn').click();
  const znat = cardFor(page, 'знать');
  const cells = znat.locator('input.conj-drill-input');
  await cells.nth(0).fill('знала');                     // я, said by a woman
  await expect(cells.nth(0)).toHaveClass(/(^|\s)correct(\s|$)/);
  await expect(cells.nth(0)).toHaveValue(/зна́л \/ зна́ла/);   // then shows both
  await cells.nth(1).fill('znal');                      // ты, in Latin letters
  await expect(cells.nth(1)).toHaveClass(/(^|\s)correct(\s|$)/);
});

test('the tense chips still toggle after switching language', async ({ page }) => {
  await openConjugation(page, 'russian');
  for (const lang of ['romanian', 'russian', 'romanian']) {
    await page.locator('#langSelect').selectOption(lang);
    await expect(page.locator('#conjTenseChips .conj-tense-chip[data-tense="present_perfect"]')).toHaveCount(lang === 'romanian' ? 1 : 0);
  }
  const chip = page.locator('#conjTenseChips .conj-tense-chip[data-tense="imperfect"]');
  const before = await chip.evaluate(el => el.classList.contains('active'));
  await chip.click();
  await expect.poll(() => chip.evaluate(el => el.classList.contains('active'))).toBe(!before);
  // and it was saved for Romanian, not for the language switched away from
  const saved = await page.evaluate(() => Object.keys(localStorage).filter(k => /tense/i.test(k) && /romanian/.test(k)));
  expect(saved.length).toBeGreaterThan(0);
});
