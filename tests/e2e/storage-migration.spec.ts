import { test, expect, type Page } from '@playwright/test';

/**
 * Storage migrations, in a real browser: data left in an old layout is upgraded
 * before the app reads it, on both entry points, and a browser that has never
 * had any old data — or has data from a newer app — is left sensible.
 */

const LEGACY = {
  vq_known_spanish:            JSON.stringify(['casa', 'perro']),           // -> a list named "Known"
  vq_mastery_spanish_Travel:   JSON.stringify(['hotel']),                   // -> vq_mastery_spanish
  s_kid_friendly_mode:         'false',                                     // -> s_simple_mode = false
  s_conj_keep_shape:           'false',                                     // -> s_conj_deselected = close
};

/** Seed storage once, before the page's own scripts run — and never again on reload. */
async function seedOnce(page: Page, data: Record<string, string>): Promise<void> {
  await page.addInitScript(d => {
    if (window.localStorage.getItem('__e2e_seeded')) return;
    for (const [k, v] of Object.entries(d)) window.localStorage.setItem(k, v);
    window.localStorage.setItem('__e2e_seeded', '1');
  }, data);
}

const stored = (page: Page, key: string): Promise<string | null> => page.evaluate(k => localStorage.getItem(k), key);

test('an old-layout browser is migrated before the app reads it', async ({ page }) => {
  await seedOnce(page, LEGACY);
  await page.goto('/');
  await page.locator('#loadingSpinner').waitFor({ state: 'hidden' });

  // The layout version is stamped and every legacy key has been converted.
  expect(await stored(page, 'vq_schema_version')).toBe('6');
  expect(await stored(page, 'vq_known_spanish')).toBeNull();
  expect(await stored(page, 'vq_mastery_spanish_Travel')).toBeNull();
  expect(JSON.parse((await stored(page, 'vq_lists_spanish')) ?? 'null')).toEqual({ Known: ['casa', 'perro'] });
  expect(JSON.parse((await stored(page, 'vq_mastery_spanish')) ?? 'null')).toEqual(['hotel']);
  expect(await stored(page, 's_simple_mode')).toBe('false');
  expect(await stored(page, 's_conj_deselected')).toBe('close');

  // ...and the app itself sees it: with Simple Mode explicitly off, My Lists shows the converted list.
  await page.locator('.mode-tab[data-mode="mylists"]').click();
  await expect(page.locator('.ml-list-item', { hasText: 'Known' }).first()).toBeVisible();
});

test('the Admin panel migrates too — it is a separate entry point on the same storage', async ({ page }) => {
  await seedOnce(page, { vq_known_spanish: JSON.stringify(['casa']), s_kid_friendly_mode: 'true' });
  await page.goto('/admin');
  await expect(page.locator('#searchInput')).toBeVisible();

  expect(await stored(page, 'vq_schema_version')).toBe('6');
  expect(await stored(page, 'vq_known_spanish')).toBeNull();
  expect(JSON.parse((await stored(page, 'vq_lists_spanish')) ?? 'null')).toEqual({ Known: ['casa'] });
});

test('a browser with no old data just gets the version stamp', async ({ page }) => {
  await page.goto('/');
  await page.locator('#loadingSpinner').waitFor({ state: 'hidden' });
  expect(await stored(page, 'vq_schema_version')).toBe('6');
  // None of the legacy-conversion outputs appear out of nowhere.
  expect(await stored(page, 'vq_lists_spanish')).toBeNull();
  expect(await stored(page, 'vq_mastery_spanish')).toBeNull();
});

test('a second start does nothing (and a reload keeps working)', async ({ page }) => {
  await seedOnce(page, LEGACY);
  await page.goto('/');
  await page.locator('#loadingSpinner').waitFor({ state: 'hidden' });
  const snapshot = await page.evaluate(() => JSON.stringify(Object.entries(localStorage).sort()));

  await page.reload();
  await page.locator('#loadingSpinner').waitFor({ state: 'hidden' });
  // Compared without the keys the app itself keeps refreshing: the language/mode it last showed, and the
  // backup reminder's clock, which starts on the first load *after* the starter lists exist.
  const again = await page.evaluate(() => JSON.stringify(Object.entries(localStorage).sort()));
  const strip = (s: string): string[][] =>
    (JSON.parse(s) as string[][]).filter(([k]) => !/^(vq_lang|vq_mode|s_backup_first_seen)$/.test(k));
  expect(strip(again)).toEqual(strip(snapshot));
});

test('data from a newer app is left completely alone by the runner, and the app still starts', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  // s_kid_friendly_mode is what step 5 would convert into s_simple_mode. (Not vq_known_*: the app's older
  // lazy code still converts that on read regardless of the marker — see the note in storage-migrations.ts.)
  await seedOnce(page, { vq_schema_version: '99', s_kid_friendly_mode: 'false' });
  await page.goto('/');
  await page.locator('#loadingSpinner').waitFor({ state: 'hidden' });

  expect(await stored(page, 'vq_schema_version')).toBe('99');
  expect(await stored(page, 's_simple_mode')).toBeNull();          // step 5 did not run
  expect(await stored(page, 's_kid_friendly_mode')).toBe('false');
  await expect(page.locator('#startBtn')).toBeVisible();
  expect(errors).toEqual([]);
});
