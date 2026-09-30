import { test, expect } from '@playwright/test';
import { disableSimpleMode } from './helpers.ts';

/**
 * Testing Profiles — save the current filter bundle from Table mode's own
 * Profiles button, and confirm it reopens cleanly. Full CRUD (rename/
 * delete) lives in My Lists — see my-lists/profile-panel.ts — this only
 * covers the save-here / apply-here path most learners actually use.
 *
 * #presetsBtn is one of the controls Simple Mode hides (index.html's
 * data-simple-hide) — see helpers.ts's disableSimpleMode.
 */
test('saving a profile from Table mode makes it reusable', async ({ page }) => {
  await disableSimpleMode(page);
  await page.goto('/');
  await page.locator('#loadingSpinner').waitFor({ state: 'hidden' });

  await page.locator('#presetsBtn').click();
  const nameInput = page.locator('.preset-picker-save-row input');
  await nameInput.fill('E2E Profile');
  await page.locator('.preset-picker-save-row button', { hasText: 'Save' }).click();

  const savedRow = page.locator('.preset-picker-row', { hasText: 'E2E Profile' });
  await expect(savedRow).toBeVisible();

  // Applying closes the popover without error — it's live for the rest of
  // the session, not something this test needs to inspect the effect of.
  await savedRow.locator('.preset-picker-apply').click();
  await expect(page.locator('#presetPickerPopover')).toHaveCount(0);

  // Also reachable — and deletable — from My Lists' own Testing Profiles
  // section, the same list this popover's Save just wrote into.
  await page.locator('.mode-tab[data-mode="mylists"]').click();
  await expect(page.locator('.ml-list-name', { hasText: 'E2E Profile' })).toBeVisible();
});

/**
 * A Conjugation profile can turn off specific pronoun ("Forms") slots — see
 * presets.ts's ConjugationBundle.disabledPronouns and profile-panel.ts's own
 * Forms chip row, added alongside the pre-existing Tense/Regularity ones.
 */
test('a conjugation profile can turn off specific forms, and applying it reflects them live', async ({ page }) => {
  await disableSimpleMode(page);
  await page.goto('/');
  await page.locator('#loadingSpinner').waitFor({ state: 'hidden' });
  await page.locator('.mode-tab[data-mode="mylists"]').click();

  const profileHead = page.locator('.ml-profile-head:not(.ml-visual-head)').first();
  await profileHead.locator('.ml-new-list-btn:not(.ml-new-folder-btn)').click();
  await page.locator('.ml-list-item--editing select.ml-list-name-input').selectOption('conjugation');
  const nameInput = page.locator('.ml-list-item--editing input.ml-list-name-input');
  await nameInput.fill('NoVosotros');
  await nameInput.press('Enter');

  // Spanish's PRONOUNS order is yo/tu/el/nosotros/vosotros/ellos — index 4 is "vosotros".
  const formsChip = page.locator('.ml-profile-editor-forms-chips .conj-pronoun-toggle').nth(4);
  await expect(formsChip).toHaveText('vosotros');
  await expect(formsChip).toHaveClass(/active/);
  await formsChip.click();
  await expect(formsChip).not.toHaveClass(/active/);

  const stored = await page.evaluate(() =>
    (JSON.parse(localStorage.getItem('vq_presets_conjugation') ?? '{}') as
      Record<string, { conjugation?: { disabledPronouns?: number[] } }>).NoVosotros);
  expect(stored?.conjugation?.disabledPronouns).toEqual([4]);

  // Applying it on the Conjugation tab turns the live "vosotros" toggle off too.
  await page.locator('.mode-tab[data-mode="conjugation"]').click();
  await page.locator('#presetsBtn').click();
  await page.locator('.preset-picker-row', { hasText: 'NoVosotros' }).locator('.preset-picker-apply').click();
  const liveToggle = page.locator('#conjPronounToggles .conj-pronoun-toggle').nth(4);
  await expect(liveToggle).not.toHaveClass(/active/);
});

test('a conjugation profile lays its forms out like Conjugation mode: yo / tú / él, then nosotros / vosotros / ellos', async ({ page }) => {
  await disableSimpleMode(page);
  await page.goto('/');
  await page.locator('#loadingSpinner').waitFor({ state: 'hidden' });
  await page.locator('.mode-tab[data-mode="mylists"]').click();
  await page.locator('.ml-profile-head:not(.ml-visual-head) .ml-new-list-btn:not(.ml-new-folder-btn)').click();
  await page.locator('.ml-list-item--editing select.ml-list-name-input').selectOption('conjugation');
  const nameInput = page.locator('.ml-list-item--editing input.ml-list-name-input');
  await nameInput.fill('Grid');
  await nameInput.press('Enter');

  // No Part of Speech filter on a verbs-only mode.
  await expect(page.locator('.ml-profile-editor-label', { hasText: 'Part of Speech' })).toHaveCount(0);

  const xs = await page.locator('.ml-profile-editor-forms-chips .conj-pronoun-toggle').evaluateAll(
    els => els.map(e => Math.round(e.getBoundingClientRect().left)));
  expect(xs).toHaveLength(6);
  expect(new Set(xs.slice(0, 3)).size).toBe(1);            // yo, tú, él share a column
  expect(new Set(xs.slice(3)).size).toBe(1);               // nosotros, vosotros, ellos share the next
  expect(xs[3]).toBeGreaterThan(xs[0]);
});
