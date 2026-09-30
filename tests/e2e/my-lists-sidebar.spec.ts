import { test, expect, type Page, type Locator } from '@playwright/test';
import { disableSimpleMode, confirmNext } from './helpers.ts';

/**
 * My Lists sidebar — every section's create / rename / copy / delete, plus folders, the emoji and
 * hide-from pickers, collapse state and keyboard navigation.
 *
 * Written before splitting sidebar.ts's 1,680-line createSidebar() closure into per-section
 * modules, and run against the code both before and after: the existing specs covered only the
 * single-language lists and one drag, so most of what that refactor touched was untested.
 */

const NEW_BTN = '.ml-new-list-btn:not(.ml-new-folder-btn)';

test.beforeEach(async ({ page }) => {
  await disableSimpleMode(page);
  await page.goto('/');
  await page.locator('#loadingSpinner').waitFor({ state: 'hidden' });
  await page.locator('.mode-tab[data-mode="mylists"]').click();
  await expect(page.locator('.ml-single-head')).toBeVisible();
});

/** A regex matching exactly `text`, whatever punctuation it contains ("Zoo (copy)" has parentheses). */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
const exactly = (text: string): RegExp => new RegExp('^' + escapeRegex(text) + '$');

/** A card by exact name, within one section's kind (ml-single-item, ml-smart-item, ml-profile-item…). */
function card(page: Page, kind: string, name: string, within: Page | Locator = page): Locator {
  return within.locator(`.ml-list-item.${kind}`, { has: page.locator('.ml-list-name', { hasText: exactly(name) }) }).first();
}

/** Open a card's gear menu and click one item. The menu is moved to <body> while open. */
async function menuAction(page: Page, gearOwner: Locator, tone: 'rename' | 'copy' | 'delete' | 'emoji' | 'hide'): Promise<void> {
  await gearOwner.locator('.ml-menu-gear').first().click();
  await page.locator(`.ml-action-menu:not([hidden]) .ml-menu-item--${tone}`).click();
}

/** Answer the next window.prompt / confirm. */
function answerNext(page: Page, value?: string): void {
  page.once('dialog', d => { void (value === undefined ? d.accept() : d.accept(value)); });
}

async function createInline(page: Page, headSelector: string, name: string): Promise<void> {
  await page.locator(`${headSelector} ${NEW_BTN}`).click();
  const input = page.locator('.ml-list-item--editing .ml-list-name-input');
  await input.fill(name);
  await input.press('Enter');
}

async function renameInline(page: Page, c: Locator, newName: string): Promise<void> {
  await menuAction(page, c, 'rename');
  // The name span becomes an input, so `c` (found by its name) no longer matches — go straight to the input.
  const input = page.locator('.ml-list-item:not(.ml-list-item--editing) .ml-list-name-input');
  await input.fill(newName);
  await input.press('Enter');
}

// ═══ Single-language lists ═════════════════════════════════════════════════════
test('single-language lists: create, rename, copy, delete and undo', async ({ page }) => {
  await createInline(page, '.ml-single-head', 'Alpha');
  await expect(card(page, 'ml-single-item', 'Alpha')).toBeVisible();

  await renameInline(page, card(page, 'ml-single-item', 'Alpha'), 'Beta');
  await expect(card(page, 'ml-single-item', 'Beta')).toBeVisible();
  await expect(card(page, 'ml-single-item', 'Alpha')).toHaveCount(0);

  answerNext(page, 'Beta (copy)');
  await menuAction(page, card(page, 'ml-single-item', 'Beta'), 'copy');
  await expect(card(page, 'ml-single-item', 'Beta (copy)')).toBeVisible();

  await confirmNext(page);
  await menuAction(page, card(page, 'ml-single-item', 'Beta (copy)'), 'delete');
  await expect(card(page, 'ml-single-item', 'Beta (copy)')).toHaveCount(0);
  await expect(page.locator('.ml-undo-msg')).toContainText('Deleted "Beta (copy)"');

  await page.locator('.ml-undo-btn').click();
  await expect(card(page, 'ml-single-item', 'Beta (copy)')).toBeVisible();
});

test('a duplicate name is refused, with a message, and nothing is created', async ({ page }) => {
  await createInline(page, '.ml-single-head', 'Same');
  await expect(card(page, 'ml-single-item', 'Same')).toBeVisible();

  let alertText = '';
  page.once('dialog', d => { alertText = d.message(); void d.accept(); });
  await createInline(page, '.ml-single-head', 'Same');
  await expect.poll(() => alertText).toMatch(/already exists/i);
  await expect(page.locator('.ml-list-item.ml-single-item', { has: page.locator('.ml-list-name', { hasText: exactly('Same') }) })).toHaveCount(1);
});

test('a list card can be given an emoji from its gear menu', async ({ page }) => {
  await createInline(page, '.ml-single-head', 'Decor');
  await menuAction(page, card(page, 'ml-single-item', 'Decor'), 'emoji');
  await page.locator('.ml-emoji-tab', { hasText: 'Study' }).click();
  await page.locator('.ml-folder-style-quick button', { hasText: '📚' }).click();
  await expect(card(page, 'ml-single-item', 'Decor').locator('.ml-list-emoji')).toHaveText('📚');
});

// ═══ Folders (single-language scope) ═══════════════════════════════════════════
test('folders: create, give an emoji and colour, choose what to hide from, collapse and remember', async ({ page }) => {
  answerNext(page, 'Trips');
  await page.locator('.ml-single-head .ml-new-folder-btn').click();
  const folderHead = page.locator('.ml-folder-head', { hasText: 'Trips' });
  await expect(folderHead).toBeVisible();
  await expect(page.locator('.ml-folder-body .ml-list-empty', { hasText: 'No lists in this folder yet' })).toBeVisible();

  // Emoji & colour
  await folderHead.locator('.ml-menu-gear').click();
  await page.locator('.ml-action-menu:not([hidden]) .ml-menu-item--emoji').click();
  await page.locator('.ml-emoji-tab', { hasText: 'Travel' }).click();
  await page.locator('.ml-folder-style-quick button', { hasText: '✈️' }).click();
  await page.locator('.ml-folder-swatch').nth(1).click();
  await expect(folderHead).toHaveClass(/ml-folder-head--colored/);
  await expect(folderHead).toContainText('✈️');
  await page.mouse.click(5, 5);                               // dismiss the popover

  // Hide from …
  await folderHead.locator('.ml-menu-gear').click();
  await page.locator('.ml-action-menu:not([hidden]) .ml-menu-item--hide').click();
  await expect(page.locator('.ml-folder-style-pop .ml-chip-dropdown-item')).not.toHaveCount(0);
  await page.locator('.ml-folder-style-pop .ml-chip-dropdown-item', { hasText: 'Picture' }).locator('input').check();
  await page.mouse.click(5, 5);

  // Collapse, and it stays collapsed across a reload
  await folderHead.locator('.ml-section-toggle-btn').click();
  await expect(page.locator('.ml-folder-group', { has: folderHead }).locator('.ml-folder-body')).toBeHidden();
  await page.reload();
  await page.locator('#loadingSpinner').waitFor({ state: 'hidden' });
  await page.locator('.mode-tab[data-mode="mylists"]').click();
  await expect(page.locator('.ml-folder-group', { has: page.locator('.ml-folder-head', { hasText: 'Trips' }) }).locator('.ml-folder-body')).toBeHidden();
});

test('folders: rename carries its list, emoji/colour and collapsed state to the new name, and refuses a duplicate', async ({ page }) => {
  await createInline(page, '.ml-single-head', 'Passport');
  const folder = await makeFolder(page, '.ml-single-head', 'Trips');
  await dragOnto(page, card(page, 'ml-single-item', 'Passport'), folder.locator('.ml-folder-head'));
  await expect(folder.locator('.ml-list-item', { hasText: 'Passport' })).toBeVisible();

  await menuAction(page, folder.locator('.ml-folder-head'), 'emoji');
  await page.locator('.ml-emoji-tab', { hasText: 'Travel' }).click();
  await page.locator('.ml-folder-style-quick button', { hasText: '✈️' }).click();
  await page.mouse.click(5, 5);
  await folder.locator('.ml-section-toggle-btn').click();
  await expect(folder.locator('.ml-folder-body')).toBeHidden();

  // A second folder already named "Travel" makes the rename refuse to collide with it.
  await makeFolder(page, '.ml-single-head', 'Travel');
  answerNext(page, 'Travel');
  await menuAction(page, folder.locator('.ml-folder-head'), 'rename');
  await expect(folder.locator('.ml-folder-head')).toContainText('Trips');

  answerNext(page, 'Travel Plans');
  await menuAction(page, folder.locator('.ml-folder-head'), 'rename');
  const renamed = page.locator('.ml-folder-group', { has: page.locator('.ml-folder-head', { hasText: 'Travel Plans' }) });
  await expect(renamed).toBeVisible();
  await expect(page.locator('.ml-folder-head', { hasText: 'Trips' })).toHaveCount(0);
  await expect(renamed.locator('.ml-folder-head')).toContainText('✈️');            // the emoji moved with it
  await expect(renamed.locator('.ml-folder-body')).toBeHidden();                   // still collapsed
  await expect(renamed.locator('.ml-list-item', { hasText: 'Passport' })).toHaveCount(1); // present, just inside the collapsed box

  const meta = await page.evaluate(() => (JSON.parse(localStorage.getItem('vq_lists_meta_spanish') ?? '{}') as Record<string, { folders?: string[] }>).Passport);
  expect(meta?.folders).toEqual(['Travel Plans']);
});

test('folders: renaming a folder used by a Testing Profile updates that mode’s picker too', async ({ page }) => {
  await page.locator('.ml-profile-head .ml-new-list-btn:not(.ml-new-folder-btn)').click();
  const row = page.locator('.ml-list-item--editing-wide').first();
  await row.locator('select').selectOption('table');
  await row.locator('.ml-list-name-input').last().fill('Drill');
  await row.locator('.ml-list-name-input').last().press('Enter');

  // Testing Profile folders ask which mode they belong to, via an inline form rather than a plain prompt.
  await page.locator('.ml-profile-head .ml-new-folder-btn').click();
  const frow = page.locator('.ml-list-item--editing-wide').first();
  await frow.locator('select').selectOption('table');
  await frow.locator('.ml-list-name-input').last().fill('Core');
  await frow.locator('.ml-list-name-input').last().press('Enter');
  const folder = page.locator('.ml-folder-group', { has: page.locator('.ml-folder-head', { hasText: 'Core' }) }).first();
  await expect(folder).toBeVisible();
  await dragOnto(page, card(page, 'ml-profile-item', 'Drill'), folder.locator('.ml-folder-head'));
  await expect(folder.locator('.ml-list-item', { hasText: 'Drill' })).toBeVisible();

  answerNext(page, 'Fundamentals');
  await menuAction(page, folder.locator('.ml-folder-head'), 'rename');
  const renamed = page.locator('.ml-folder-group', { has: page.locator('.ml-folder-head', { hasText: 'Fundamentals' }) });
  await expect(renamed).toBeVisible();
  await expect(renamed.locator('.ml-list-item', { hasText: 'Drill' })).toBeVisible();

  await page.locator('.mode-tab[data-mode="table"]').click();
  await page.locator('#presetsBtn').click();
  await expect(page.locator('.preset-picker-folder', { hasText: 'Fundamentals' })).toBeVisible();
  await expect(page.locator('.preset-picker-apply', { hasText: 'Drill' })).toBeVisible();
  const stored = await page.evaluate(() => (JSON.parse(localStorage.getItem('vq_presets_table') ?? '{}') as Record<string, { folders?: string[] }>).Drill);
  expect(stored?.folders).toEqual(['Fundamentals']);
});

test('folders: delete just ungroups its lists, but can also delete them along with it', async ({ page }) => {
  await createInline(page, '.ml-single-head', 'Keepsake');
  const folder = await makeFolder(page, '.ml-single-head', 'Junk');
  await dragOnto(page, card(page, 'ml-single-item', 'Keepsake'), folder.locator('.ml-folder-head'));
  await expect(folder.locator('.ml-list-item', { hasText: 'Keepsake' })).toBeVisible();

  // Choose "folder only" — the list survives, just ungrouped.
  await menuAction(page, folder.locator('.ml-folder-head'), 'delete');
  await page.locator('.app-dialog .app-dialog-choice', { hasText: 'Delete folder only' }).click();
  await expect(page.locator('.ml-folder-head', { hasText: 'Junk' })).toHaveCount(0);
  await expect(card(page, 'ml-single-item', 'Keepsake')).toBeVisible();

  // Recreate the folder around the same list and this time choose "folder and all lists inside" — the
  // folder AND the list it held are gone. (Cancel leaves everything as it was.)
  const folder2 = await makeFolder(page, '.ml-single-head', 'Junk');
  await dragOnto(page, card(page, 'ml-single-item', 'Keepsake'), folder2.locator('.ml-folder-head'));
  await menuAction(page, folder2.locator('.ml-folder-head'), 'delete');
  await page.locator('.app-dialog .app-dialog-cancel').click();
  await expect(page.locator('.ml-folder-head', { hasText: 'Junk' })).toHaveCount(1);
  await menuAction(page, folder2.locator('.ml-folder-head'), 'delete');
  await page.locator('.app-dialog .app-dialog-choice', { hasText: 'Delete folder and all lists inside' }).click();
  await expect(page.locator('.ml-folder-head', { hasText: 'Junk' })).toHaveCount(0);
  await expect(card(page, 'ml-single-item', 'Keepsake')).toHaveCount(0);
});

test('a list card can be given a custom colour via the native colour input', async ({ page }) => {
  await createInline(page, '.ml-single-head', 'Hue');
  await menuAction(page, card(page, 'ml-single-item', 'Hue'), 'emoji');
  await page.locator('.ml-folder-custom input.ml-folder-swatch--custom').fill('#123456');
  await page.mouse.click(5, 5);
  await expect(card(page, 'ml-single-item', 'Hue')).toHaveClass(/ml-list-item--colored/);
  const meta = await page.evaluate(() => (JSON.parse(localStorage.getItem('vq_lists_meta_spanish') ?? '{}') as Record<string, { color?: string }>).Hue);
  expect(meta?.color).toBe('#123456');
});

// ═══ Smart lists ═══════════════════════════════════════════════════════════════
test('smart lists: create, rename, copy and delete', async ({ page }) => {
  await createInline(page, '.ml-smart-head', 'Verbs');
  await expect(card(page, 'ml-smart-item', 'Verbs')).toBeVisible();

  await renameInline(page, card(page, 'ml-smart-item', 'Verbs'), 'Verbs2');
  await expect(card(page, 'ml-smart-item', 'Verbs2')).toBeVisible();

  answerNext(page, 'Verbs2 (copy)');
  await menuAction(page, card(page, 'ml-smart-item', 'Verbs2'), 'copy');
  await expect(card(page, 'ml-smart-item', 'Verbs2 (copy)')).toBeVisible();

  await confirmNext(page);
  await menuAction(page, card(page, 'ml-smart-item', 'Verbs2 (copy)'), 'delete');
  await expect(card(page, 'ml-smart-item', 'Verbs2 (copy)')).toHaveCount(0);
  await expect(card(page, 'ml-smart-item', 'Verbs2')).toBeVisible();
});

// ═══ Cross-language lists ══════════════════════════════════════════════════════
test('cross-language lists: create, rename, copy, delete and undo', async ({ page }) => {
  await createInline(page, '.ml-multi-head', 'Zoo');
  await expect(card(page, 'ml-multi-item', 'Zoo')).toBeVisible();

  answerNext(page, 'Zoo2');
  await menuAction(page, card(page, 'ml-multi-item', 'Zoo'), 'rename');
  await expect(card(page, 'ml-multi-item', 'Zoo2')).toBeVisible();

  answerNext(page, 'Zoo2 (copy)');
  await menuAction(page, card(page, 'ml-multi-item', 'Zoo2'), 'copy');
  await expect(card(page, 'ml-multi-item', 'Zoo2 (copy)')).toBeVisible();

  await confirmNext(page);
  await menuAction(page, card(page, 'ml-multi-item', 'Zoo2 (copy)'), 'delete');
  await expect(card(page, 'ml-multi-item', 'Zoo2 (copy)')).toHaveCount(0);
  await page.locator('.ml-undo-btn').click();
  await expect(card(page, 'ml-multi-item', 'Zoo2 (copy)')).toBeVisible();
});

test('copying a cross-language list copies its words, not just its name', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('vq_lists_multi', JSON.stringify({
    Pets: [{ word: 'perro', language: 'spanish' }, { word: 'chat', language: 'french' }],
  })));
  await page.reload();
  await page.locator('#loadingSpinner').waitFor({ state: 'hidden' });
  await page.locator('.mode-tab[data-mode="mylists"]').click();
  await expect(card(page, 'ml-multi-item', 'Pets').locator('.ml-list-count')).toHaveText('2 words');

  answerNext(page, 'Pets (copy)');
  await menuAction(page, card(page, 'ml-multi-item', 'Pets'), 'copy');
  const copy = card(page, 'ml-multi-item', 'Pets (copy)');
  await expect(copy).toBeVisible();
  await expect(copy.locator('.ml-list-count')).toHaveText('2 words');
  await expect(card(page, 'ml-multi-item', 'Pets').locator('.ml-list-count')).toHaveText('2 words');   // the original is untouched
});

test('only one gear menu is open at a time, and Escape closes it and returns focus to its gear', async ({ page }) => {
  await createInline(page, '.ml-single-head', 'MenuA');
  await createInline(page, '.ml-single-head', 'MenuB');
  const gearA = card(page, 'ml-single-item', 'MenuA').locator('.ml-menu-gear');
  const gearB = card(page, 'ml-single-item', 'MenuB').locator('.ml-menu-gear');
  const openMenus = page.locator('.ml-action-menu:not([hidden])');

  await gearA.click();
  await expect(openMenus).toHaveCount(1);
  await expect(gearA).toHaveAttribute('aria-expanded', 'true');

  await gearB.click();                                        // opening B closes A's
  await expect(openMenus).toHaveCount(1);
  await expect(gearA).toHaveAttribute('aria-expanded', 'false');
  await expect(gearB).toHaveAttribute('aria-expanded', 'true');

  await page.keyboard.press('Escape');
  await expect(openMenus).toHaveCount(0);
  await expect(gearB).toBeFocused();
});

// ═══ Testing profiles ══════════════════════════════════════════════════════════
test('testing profiles: create in a mode, rename, copy, delete, and a per-mode folder', async ({ page }) => {
  const profileHead = page.locator('.ml-profile-head').first();
  await profileHead.locator(NEW_BTN).click();
  await page.locator('.ml-list-item--editing select.ml-list-name-input').selectOption('picture');
  const input = page.locator('.ml-list-item--editing input.ml-list-name-input');
  await input.fill('Fast');
  await input.press('Enter');

  const group = page.locator('.ml-profile-mode-group', { hasText: 'Picture Quiz' });
  await expect(card(page, 'ml-profile-item', 'Fast', group)).toBeVisible();

  await renameInline(page, card(page, 'ml-profile-item', 'Fast', group), 'Faster');
  await expect(card(page, 'ml-profile-item', 'Faster', group)).toBeVisible();

  answerNext(page, 'Faster (copy)');
  await menuAction(page, card(page, 'ml-profile-item', 'Faster', group), 'copy');
  await expect(card(page, 'ml-profile-item', 'Faster (copy)', group)).toBeVisible();

  // A folder scoped to that mode, made from the section head's "+ Folder"
  await profileHead.locator('.ml-new-folder-btn').click();
  await page.locator('.ml-list-item--editing select.ml-list-name-input').selectOption('picture');
  const folderInput = page.locator('.ml-list-item--editing input.ml-list-name-input');
  await folderInput.fill('Drills');
  await folderInput.press('Enter');
  await expect(group.locator('.ml-folder-head', { hasText: 'Drills' })).toBeVisible();

  await confirmNext(page);
  await menuAction(page, card(page, 'ml-profile-item', 'Faster (copy)', group), 'delete');
  await expect(card(page, 'ml-profile-item', 'Faster (copy)', group)).toHaveCount(0);
  await expect(card(page, 'ml-profile-item', 'Faster', group)).toBeVisible();
});

// ═══ Visual profiles (only when switched on in Settings) ═══════════════════════
async function openVisualProfiles(page: Page): Promise<void> {
  await page.evaluate(() => localStorage.setItem('s_show_visual_profiles', 'true'));
  await page.reload();
  await page.locator('#loadingSpinner').waitFor({ state: 'hidden' });
  await page.locator('.mode-tab[data-mode="mylists"]').click();
  await expect(page.locator('.ml-visual-head')).toBeVisible();
}

const storedVisual = (page: Page, name: string): Promise<Record<string, unknown> | undefined> =>
  page.evaluate(n => (JSON.parse(localStorage.getItem('vq_visual_profiles') ?? '{}') as Record<string, Record<string, unknown>>)[n], name);

test('visual profiles: create, rename, copy, delete', async ({ page }) => {
  await openVisualProfiles(page);
  await createInline(page, '.ml-visual-head', 'Night');
  const c = card(page, 'ml-visual-item', 'Night');
  await expect(c).toBeVisible();
  await expect(c).toHaveClass(/\bactive\b/);            // creating it opens it, like every other list

  await renameInline(page, c, 'Nights');
  await expect(card(page, 'ml-visual-item', 'Nights')).toBeVisible();
  await expect(page.locator('.ml-panel-title')).toContainText('Nights');   // the open panel follows the rename

  await menuAction(page, card(page, 'ml-visual-item', 'Nights'), 'copy');   // asks in the app's own dialog, not window.prompt
  await page.locator('.app-dialog .app-dialog-input').fill('Nights (copy)');
  await page.locator('.app-dialog .app-dialog-input').press('Enter');
  await expect(card(page, 'ml-visual-item', 'Nights (copy)')).toBeVisible();

  await confirmNext(page);
  await menuAction(page, card(page, 'ml-visual-item', 'Nights (copy)'), 'delete');
  await expect(card(page, 'ml-visual-item', 'Nights (copy)')).toHaveCount(0);
  await expect(page.locator('.ml-panel-title')).toHaveCount(0);              // its panel closed with it

  await confirmNext(page);
  await menuAction(page, card(page, 'ml-visual-item', 'Nights'), 'delete');
  await expect(card(page, 'ml-visual-item', 'Nights')).toHaveCount(0);
});

test('visual profiles: selecting opens the panel without applying; the panel edits and applies', async ({ page }) => {
  await openVisualProfiles(page);
  await createInline(page, '.ml-visual-head', 'Look');
  await expect(page.locator('.ml-panel-title')).toContainText('Look');

  await page.getByLabel('Theme', { exact: true }).selectOption('dark');
  await page.getByLabel('Font Size', { exact: true }).selectOption('xl');
  expect(await storedVisual(page, 'Look')).toMatchObject({ theme: 'dark', fontSize: 'xl' });
  await expect(page.locator('.ml-smart-desc')).toHaveText('Dark Theme · Extra Large Text · 9 More Settings');

  // Editing never repaints the app; only Apply does.
  await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);
  await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);
  await page.locator('.ml-panel-title-group .ml-export-btn', { hasText: 'Apply Now' }).click();
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);

  // "No change" clears a setting, and "use what it looks like now" fills both back in.
  await page.getByLabel('Font Size', { exact: true }).selectOption('');
  expect((await storedVisual(page, 'Look'))?.fontSize).toBeUndefined();
  await page.locator('.ml-vp-current').click();
  expect((await storedVisual(page, 'Look'))?.theme).toBe('dark');
  expect((await storedVisual(page, 'Look'))?.fontSize).toBe('xl');   // Apply switched the app to xl above
});

test('visual profiles: table columns, row density and other display settings are saved and applied', async ({ page }) => {
  await openVisualProfiles(page);
  await createInline(page, '.ml-visual-head', 'Dense');

  await page.getByLabel('Columns', { exact: true }).selectOption('4');
  await page.getByLabel('Row Density', { exact: true }).selectOption('ultra');
  await page.getByLabel('Frequency Rank Badge', { exact: true }).selectOption('false');
  expect(((await storedVisual(page, 'Dense'))?.settings)).toMatchObject({ tableCols: '4', rowDensity: 'ultra', showRank: 'false' });
  await expect(page.locator('.ml-smart-desc')).toContainText('9 More Settings')   // a new profile starts from every setting as it is now;

  // Nothing changes until Apply…
  const setting = (k: string): Promise<string | null> => page.evaluate(key => localStorage.getItem('s_' + key), k);
  await expect(page.locator('body')).not.toHaveClass(/table-ultra-compact-rows/);
  expect(await setting('table_cols')).toBeNull();

  // …then each goes through the real Settings control, so the app repaints and persists it.
  await page.locator('.ml-panel-title-group .ml-export-btn', { hasText: 'Apply Now' }).click();
  await expect(page.locator('body')).toHaveClass(/table-ultra-compact-rows/);
  expect(await setting('table_cols')).toBe('4');
  expect(await setting('table_show_rank')).toBe('false');
  await expect(page.locator('#settingCols .sort-order-btn.active')).toHaveAttribute('data-cols', '4');

  // A setting left on "No change" is not part of the profile and is never touched.
  await page.getByLabel('Columns', { exact: true }).selectOption('');
  expect(((await storedVisual(page, 'Dense'))?.settings)).not.toHaveProperty('tableCols');

  // A brand-new profile captures every setting as it is right now.
  await createInline(page, '.ml-visual-head', 'Snapshot');
  expect(((await storedVisual(page, 'Snapshot'))?.settings)).toMatchObject({ tableCols: '4', rowDensity: 'ultra', showRank: 'false' });
});

test('visual profiles: emoji, folders (create, file into, drag onto)', async ({ page }) => {
  await openVisualProfiles(page);
  await createInline(page, '.ml-visual-head', 'Cosy');
  await createInline(page, '.ml-visual-head', 'Bright');

  await menuAction(page, card(page, 'ml-visual-item', 'Cosy'), 'emoji');
  await page.locator('.ml-emoji-tab', { hasText: 'Study' }).click();
  await page.locator('.ml-folder-style-quick button', { hasText: '📚' }).click();
  await expect(card(page, 'ml-visual-item', 'Cosy').locator('.ml-list-emoji')).toHaveText('📚');
  expect((await storedVisual(page, 'Cosy'))?.emoji).toBe('📚');

  answerNext(page, 'Reading');
  await page.locator('.ml-visual-head .ml-new-folder-btn').click();
  const folder = page.locator('.ml-folder-group', { has: page.locator('.ml-folder-head', { hasText: 'Reading' }) });
  await expect(folder).toBeVisible();

  // File one via the panel's Folders control…
  await card(page, 'ml-visual-item', 'Cosy').click();
  await page.locator('.ml-panel .ml-chip-dropdown', { hasText: 'Folders' }).locator('button').first().click();
  await page.locator('.ml-panel .ml-chip-dropdown-item', { hasText: 'Reading' }).locator('input').check();
  await expect(folder.locator('.ml-list-item', { hasText: 'Cosy' })).toBeVisible();

  // …and another by dragging it onto the folder header.
  await card(page, 'ml-visual-item', 'Bright').dragTo(folder.locator('.ml-folder-head'));
  await expect(folder.locator('.ml-list-item', { hasText: 'Bright' })).toBeVisible();
  expect((await storedVisual(page, 'Bright'))?.folders).toEqual(['Reading']);
});

// ═══ Recolouring the list kinds (Settings → Appearance → My Lists Colors) ═══════
test('list kind colours: a colour chosen in Settings recolours the sidebar, persists, and resets', async ({ page }) => {
  const accent = (): Promise<string> => page.evaluate(() => getComputedStyle(document.querySelector('.ml-profile-head') as Element).getPropertyValue('--ml-accent-profile').trim());
  const original = await accent();
  const rows = page.locator('#settingMlColors .conj-color-row');
  await expect(rows).toHaveCount(5);
  await expect(rows.locator('.conj-color-name')).toHaveText(['Single-Language Lists', 'Smart Lists', 'Cross-Language Lists', 'Testing Profiles', 'Visual Profiles']);

  // <input type="color"> can't be driven by clicking; set its value and fire the event it listens for.
  await rows.filter({ hasText: 'Testing Profiles' }).locator('input[type="color"]').evaluate((el: HTMLInputElement) => {
    el.value = '#00aa55'; el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect.poll(accent).toBe('#00aa55');
  await expect(page.locator('.ml-profile-head')).toHaveCSS('border-left-color', 'rgb(0, 170, 85)');

  // Single-Language Lists too — and it must not recolour the rest of the app (it defaults to the app accent).
  const appAccent = await page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--accent').trim());
  await rows.filter({ hasText: 'Single-Language Lists' }).locator('input[type="color"]').evaluate((el: HTMLInputElement) => {
    el.value = '#cc3366'; el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(page.locator('.ml-single-head')).toHaveCSS('border-left-color', 'rgb(204, 51, 102)');
  expect(await page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--accent').trim())).toBe(appAccent);

  await page.reload();
  await page.locator('#loadingSpinner').waitFor({ state: 'hidden' });
  await page.locator('.mode-tab[data-mode="mylists"]').click();
  await expect(page.locator('.ml-profile-head')).toBeVisible();
  await expect.poll(accent).toBe('#00aa55');

  await page.locator('#settingResetMlColors').evaluate((el: HTMLElement) => el.click());
  await expect.poll(accent).toBe(original);
});

// ═══ Drag and drop: every kind of list, including every kind of profile ═════════
/**
 * Drag one card onto a folder header the way a person does: press on the card, start moving, then bring
 * the folder into view and release. (Playwright's own dragTo scrolls the long sidebar *after* pressing,
 * which starts the drag on whatever card slid under the pointer.)
 */
async function dragOnto(page: Page, source: Locator, target: Locator): Promise<void> {
  await source.scrollIntoViewIfNeeded();
  const s = (await source.boundingBox())!;
  await page.mouse.move(s.x + 30, s.y + s.height / 2);
  await page.mouse.down();
  await page.mouse.move(s.x + 40, s.y + s.height / 2 + 8, { steps: 4 });
  await target.scrollIntoViewIfNeeded();
  const t = (await target.boundingBox())!;
  await page.mouse.move(t.x + 40, t.y + t.height / 2, { steps: 10 });
  await page.mouse.up();
}

/** Make a folder in a section through its head's "+ Folder" (a plain prompt). */
async function makeFolder(page: Page, headSelector: string, name: string): Promise<Locator> {
  answerNext(page, name);
  await page.locator(`${headSelector} .ml-new-folder-btn`).click();
  const group = page.locator('.ml-folder-group', { has: page.locator('.ml-folder-head', { hasText: name }) }).first();
  await expect(group).toBeVisible();
  return group;
}

test('drag and drop: single, smart and cross-language lists can be dropped onto a folder', async ({ page }) => {
  for (const [head, kind, name, folderName] of [
    ['.ml-single-head', 'ml-single-item', 'Dnd Single', 'FolderS'],
    ['.ml-smart-head', 'ml-smart-item', 'Dnd Smart', 'FolderM'],
    ['.ml-multi-head', 'ml-multi-item', 'Dnd Multi', 'FolderX'],
  ] as const) {
    await createInline(page, head, name);
    const folder = await makeFolder(page, head, folderName);
    await dragOnto(page, card(page, kind, name), folder.locator('.ml-folder-head'));
    await expect(folder.locator('.ml-list-item', { hasText: name })).toBeVisible();
  }
});

for (const mode of ['table', 'picture', 'conjugation'] as const) {
  test(`drag and drop: a ${mode} Testing Profile goes into a ${mode} folder, and shows up under it when picking a profile in that mode`, async ({ page }) => {
    const profile = `P ${mode}`;
    const folderName = `F ${mode}`;

    // A profile in this mode.
    await page.locator('.ml-profile-head .ml-new-list-btn:not(.ml-new-folder-btn)').click();
    const row = page.locator('.ml-list-item--editing-wide').first();
    await row.locator('select').selectOption(mode);
    await row.locator('.ml-list-name-input').last().fill(profile);
    await row.locator('.ml-list-name-input').last().press('Enter');
    await expect(card(page, 'ml-profile-item', profile)).toBeVisible();

    // A folder in the same mode (Testing Profile folders are per mode and ask which).
    await page.locator('.ml-profile-head .ml-new-folder-btn').click();
    const frow = page.locator('.ml-list-item--editing-wide').first();
    await frow.locator('select').selectOption(mode);
    await frow.locator('.ml-list-name-input').last().fill(folderName);
    await frow.locator('.ml-list-name-input').last().press('Enter');
    const folder = page.locator('.ml-folder-group', { has: page.locator('.ml-folder-head', { hasText: folderName }) }).first();
    await expect(folder).toBeVisible();

    await dragOnto(page, card(page, 'ml-profile-item', profile), folder.locator('.ml-folder-head'));
    await expect(folder.locator('.ml-list-item', { hasText: profile })).toBeVisible();
    const stored = await page.evaluate(m => JSON.parse(localStorage.getItem('vq_presets_' + m) ?? '{}') as Record<string, { folders?: string[] }>, mode);
    expect(stored[profile]?.folders).toEqual([folderName]);

    // …and the picker on that mode's own tab groups it under the folder.
    await page.locator(`.mode-tab[data-mode="${mode}"]`).click();
    await page.locator('#presetsBtn').click();
    const heading = page.locator('.preset-picker-folder', { hasText: folderName });
    await expect(heading).toBeVisible();
    await expect(page.locator('.preset-picker-apply', { hasText: profile })).toBeVisible();
    const order = await page.locator('.preset-picker-folder, .preset-picker-apply').evaluateAll(els => els.map(e => e.textContent ?? ''));
    expect(order.findIndex(t => t.includes(folderName))).toBeLessThan(order.findIndex(t => t.includes(profile)));
  });
}

test('drag and drop: a profile will not go into a folder that belongs to another mode', async ({ page }) => {
  // A mode's folders only show once that mode has a profile, so give Conjugation one.
  await page.locator('.ml-profile-head .ml-new-list-btn:not(.ml-new-folder-btn)').click();
  const other = page.locator('.ml-list-item--editing-wide').first();
  await other.locator('select').selectOption('conjugation');
  await other.locator('.ml-list-name-input').last().fill('AnyConj');
  await other.locator('.ml-list-name-input').last().press('Enter');
  await expect(card(page, 'ml-profile-item', 'AnyConj')).toBeVisible();

  await page.locator('.ml-profile-head .ml-new-list-btn:not(.ml-new-folder-btn)').click();
  const row = page.locator('.ml-list-item--editing-wide').first();
  await row.locator('select').selectOption('table');
  await row.locator('.ml-list-name-input').last().fill('OnlyTable');
  await row.locator('.ml-list-name-input').last().press('Enter');

  await page.locator('.ml-profile-head .ml-new-folder-btn').click();
  const frow = page.locator('.ml-list-item--editing-wide').first();
  await frow.locator('select').selectOption('conjugation');
  await frow.locator('.ml-list-name-input').last().fill('ConjOnly');
  await frow.locator('.ml-list-name-input').last().press('Enter');
  const folder = page.locator('.ml-folder-group', { has: page.locator('.ml-folder-head', { hasText: 'ConjOnly' }) }).first();
  await expect(folder).toBeVisible();

  await dragOnto(page, card(page, 'ml-profile-item', 'OnlyTable'), folder.locator('.ml-folder-head'));
  await expect(folder.locator('.ml-list-item', { hasText: 'OnlyTable' })).toHaveCount(0);
});

// ═══ Whole-sidebar controls ════════════════════════════════════════════════════
test('sections collapse individually and all at once, and remember it', async ({ page }) => {
  const smartBody = page.locator('.ml-section-body[data-section="smart"]');
  await expect(smartBody).toBeVisible();
  await page.locator('.ml-section-toggle-btn[data-section="smart"]').click();
  await expect(smartBody).toBeHidden();

  await page.locator('.ml-collapse-all-btn').click();
  for (const id of ['single', 'smart', 'multi', 'profiles']) {
    await expect(page.locator(`.ml-section-body[data-section="${id}"]`)).toBeHidden();
  }
  await expect(page.locator('.ml-collapse-all-btn')).toHaveText('Expand All');

  await page.reload();
  await page.locator('#loadingSpinner').waitFor({ state: 'hidden' });
  await page.locator('.mode-tab[data-mode="mylists"]').click();
  await expect(page.locator('.ml-section-body[data-section="single"]')).toBeHidden();

  await page.locator('.ml-collapse-all-btn').click();
  await expect(page.locator('.ml-section-body[data-section="single"]')).toBeVisible();
});

test('changing the sidebar language shows that language\'s lists', async ({ page }) => {
  await createInline(page, '.ml-single-head', 'OnlySpanish');
  await expect(card(page, 'ml-single-item', 'OnlySpanish')).toBeVisible();
  await page.locator('.ml-lang-select').selectOption('french');
  await expect(card(page, 'ml-single-item', 'OnlySpanish')).toHaveCount(0);
  await expect(page.locator('.ml-list-empty', { hasText: 'No lists yet' }).first()).toBeVisible();
  await page.locator('.ml-lang-select').selectOption('spanish');
  await expect(card(page, 'ml-single-item', 'OnlySpanish')).toBeVisible();
});

test('Browse All Words takes over the panel and highlights its button', async ({ page }) => {
  await page.locator('.ml-browse-btn').click();
  await expect(page.locator('.ml-browse-btn')).toHaveClass(/ml-browse-btn--active/);
});

test('arrow keys move between cards and Enter opens the focused one', async ({ page }) => {
  await createInline(page, '.ml-single-head', 'Kb1');
  await createInline(page, '.ml-single-head', 'Kb2');
  const first = card(page, 'ml-single-item', 'Kb1');
  await first.focus();
  await page.keyboard.press('ArrowDown');
  const focusedText = await page.evaluate(() => (document.activeElement as HTMLElement | null)?.textContent ?? '');
  expect(focusedText).not.toContain('Kb1 ');                    // focus moved off the first card
  await page.keyboard.press('Home');
  await expect(page.locator('.ml-list-item').first()).toBeFocused();
});

// ═══ Nested folders and aggregate lists ════════════════════════════════════════
test('folders nest: a subfolder sits inside its parent, and renaming the parent carries it', async ({ page }) => {
  await createInline(page, '.ml-single-head', 'Passport');
  answerNext(page, 'Trips');
  await page.locator('.ml-single-head .ml-new-folder-btn').click();
  const trips = page.locator('.ml-folder-group', { has: page.locator('.ml-folder-head', { hasText: 'Trips' }) }).first();

  answerNext(page, 'Asia');
  await menuAction(page, trips.locator('.ml-folder-head').first(), 'copy');   // "Add Subfolder"
  const asia = trips.locator('.ml-folder-group', { has: page.locator('.ml-folder-head', { hasText: 'Asia' }) });
  await expect(asia).toBeVisible();

  await dragOnto(page, card(page, 'ml-single-item', 'Passport'), asia.locator('.ml-folder-head'));
  await expect(asia.locator('.ml-list-item', { hasText: 'Passport' })).toBeVisible();

  answerNext(page, 'Journeys');
  await menuAction(page, trips.locator('.ml-folder-head').first(), 'rename');
  const journeys = page.locator('.ml-folder-group', { has: page.locator('.ml-folder-head', { hasText: 'Journeys' }) }).first();
  await expect(journeys.locator('.ml-folder-group', { hasText: 'Asia' })).toBeVisible();
  const meta = await page.evaluate(() => (JSON.parse(localStorage.getItem('vq_lists_meta_spanish') ?? '{}') as Record<string, { folders?: string[] }>).Passport);
  expect(meta?.folders).toEqual(['Journeys/Asia']);
});

test('an aggregate cross-language list is made of single-language lists, live', async ({ page }) => {
  await createInline(page, '.ml-single-head', 'Food');
  await page.evaluate(() => {
    localStorage.setItem('vq_lists_spanish', JSON.stringify({ Food: ['pan', 'queso'] }));
    localStorage.setItem('vq_lists_multi', JSON.stringify({ Everything: [] }));
    localStorage.setItem('vq_lists_multi_meta', JSON.stringify({ Everything: { sources: [{ lang: 'spanish', list: 'Food' }] } }));
  });
  await page.reload();
  await page.locator('#loadingSpinner').waitFor({ state: 'hidden' });
  await page.locator('.mode-tab[data-mode="mylists"]').click();
  await card(page, 'ml-multi-item', 'Everything').click();
  await expect(page.locator('.ml-word-list .ml-word-via', { hasText: 'Food' })).toHaveCount(2);
  await expect(card(page, 'ml-multi-item', 'Everything').locator('.ml-list-count')).toHaveText('2 words');
});

test('drag and drop: a list moves between folders and back out, and folders nest and come back out', async ({ page }) => {
  await createInline(page, '.ml-single-head', 'Passport');
  const a = await makeFolder(page, '.ml-single-head', 'Alpha');
  const b = await makeFolder(page, '.ml-single-head', 'Beta');
  const folders = (): Promise<string[] | undefined> => page.evaluate(() =>
    (JSON.parse(localStorage.getItem('vq_lists_meta_spanish') ?? '{}') as Record<string, { folders?: string[] }>).Passport?.folders);

  // ungrouped → Alpha (added), Alpha → Beta (moved, not copied)
  await dragOnto(page, card(page, 'ml-single-item', 'Passport'), a.locator('.ml-folder-head'));
  await expect.poll(folders).toEqual(['Alpha']);
  await dragOnto(page, card(page, 'ml-single-item', 'Passport', a), b.locator('.ml-folder-head'));
  await expect.poll(folders).toEqual(['Beta']);

  // out of the folder, back to ungrouped
  await dragOnto(page, card(page, 'ml-single-item', 'Passport', b), page.locator('.ml-section-body--single .ml-root-drop'));
  await expect.poll(folders).toEqual([]);

  // a folder dropped onto another nests inside it, and drops back out to the top level
  await dragOnto(page, b.locator('.ml-folder-head').first(), a.locator('.ml-folder-head').first());
  const registry = (): Promise<string[]> => page.evaluate(() => JSON.parse(localStorage.getItem('ml_folders_single_spanish') ?? '[]') as string[]);
  await expect.poll(registry).toContain('Alpha/Beta');
  await expect(a.locator('.ml-folder-group', { hasText: 'Beta' })).toBeVisible();

  const inner = a.locator('.ml-folder-group', { hasText: 'Beta' });
  await dragOnto(page, inner.locator('.ml-folder-head').first(), page.locator('.ml-section-body--single .ml-root-drop'));
  await expect.poll(registry).toEqual(['Alpha', 'Beta']);
});

test('a single-language list can be made of other lists of its language', async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem('vq_lists_spanish', JSON.stringify({ Food: ['pan', 'queso'], Meals: ['cena'] }));
    localStorage.setItem('vq_lists_meta_spanish', JSON.stringify({ Meals: { sources: [{ lang: 'spanish', list: 'Food' }] } }));
  });
  await page.reload();
  await page.locator('#loadingSpinner').waitFor({ state: 'hidden' });
  await page.locator('.mode-tab[data-mode="mylists"]').click();
  await card(page, 'ml-single-item', 'Meals').click();
  await expect(page.locator('.ml-word-list .ml-word-via', { hasText: 'Food' })).toHaveCount(2);
  await expect(card(page, 'ml-single-item', 'Meals').locator('.ml-list-count')).toHaveText('3 words');
});

test('an open list can be deselected by clicking it again, or with the X in the panel corner', async ({ page }) => {
  await createInline(page, '.ml-single-head', 'Alpha');
  await createInline(page, '.ml-single-head', 'Beta');
  await expect(page.locator('.ml-panel-title')).toHaveText('Beta');

  await card(page, 'ml-single-item', 'Beta').click();          // click the open one again
  await expect(page.locator('.ml-panel-title')).toHaveCount(0);
  await expect(page.locator('.ml-list-item.active')).toHaveCount(0);
  await expect(page.locator('.ml-panel-empty')).toContainText('Select a list');
  await expect(page.locator('.ml-panel-close')).toHaveCount(0);

  await card(page, 'ml-single-item', 'Alpha').click();
  await expect(page.locator('.ml-panel-title')).toHaveText('Alpha');
  await page.locator('.ml-panel-close').click();               // the X
  await expect(page.locator('.ml-panel-title')).toHaveCount(0);
  await expect(page.locator('.ml-list-item.active')).toHaveCount(0);
});

test('Move to / Copy to: sections are labelled, collapsible and coloured like the sidebar', async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem('vq_lists_spanish', JSON.stringify({ Source: ['pan'], 'A rather long destination list name': [] , Short: [] }));
    localStorage.setItem('vq_lists_multi', JSON.stringify({ Everywhere: [] }));
  });
  await page.reload();
  await page.locator('#loadingSpinner').waitFor({ state: 'hidden' });
  await page.locator('.mode-tab[data-mode="mylists"]').click();
  await expect(card(page, 'ml-single-item', 'Source')).toHaveClass(/active/);   // the first list opens by itself
  await page.locator('.ml-word-list .ml-move-btn').first().click();

  const pop = page.locator('.ml-move-popover');
  await expect(pop.locator('.ml-move-section--single .ml-move-section-head')).toContainText('Single-Language Lists');
  await expect(pop.locator('.ml-move-section--multi .ml-move-section-head')).toContainText('Cross-Language Lists');

  // as wide as its longest name: nothing is cut off
  const clipped = await pop.locator('.ml-move-popover-item').evaluateAll(els => els.some(e => e.scrollWidth > e.clientWidth + 1));
  expect(clipped).toBe(false);

  // coloured like the sidebar's sections
  const bars = await page.evaluate(() => {
    const c = (sel: string): string => getComputedStyle(document.querySelector(sel) as Element).borderLeftColor;
    return { pop: [c('.ml-move-section--single .ml-move-section-head'), c('.ml-move-section--multi .ml-move-section-head')],
             side: [c('.ml-single-head'), c('.ml-multi-head')] };
  });
  expect(bars.pop).toEqual(bars.side);

  // each section folds
  const body = pop.locator('.ml-move-section--single .ml-move-section-body');
  await expect(body).toBeVisible();
  await pop.locator('.ml-move-section--single .ml-move-section-head').click();
  await expect(body).toBeHidden();
  await expect(pop.locator('.ml-move-section--multi .ml-move-section-body')).toBeVisible();
});

test('My Lists fits one screen without page scroll', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
});

test('the emoji picker keeps only emoji, and offers every emoji this system can draw', async ({ page }) => {
  await createInline(page, '.ml-single-head', 'Decor');
  await menuAction(page, card(page, 'ml-single-item', 'Decor'), 'emoji');
  const box = page.locator('.ml-folder-style-pop input[type="text"]');
  await box.fill('hello');                                    // plain text is discarded
  await expect(box).toHaveValue('');
  await box.fill('abc 🚀 def');                               // the emoji in it is kept
  await expect(box).toHaveValue('🚀');
  await box.press('Enter');
  await expect(card(page, 'ml-single-item', 'Decor').locator('.ml-list-emoji')).toHaveText('🚀');

  await page.locator('.ml-emoji-tab', { hasText: 'All' }).click();
  expect(await page.locator('.ml-folder-style-quick button').count()).toBeGreaterThan(500);
  await expect(page.locator('.ml-folder-custom')).toContainText('Custom colour');
});

test('Export lives in each list card’s gear menu, and choosing "Made of" leaves one set of stats, in the top bar', async ({ page }) => {
  await page.evaluate(() => { localStorage.setItem('vq_lists_spanish', JSON.stringify({ Food: ['pan', 'queso'], Other: ['x'] })); });
  await page.reload();
  await page.locator('#loadingSpinner').waitFor({ state: 'hidden' });
  await page.locator('.mode-tab[data-mode="mylists"]').click();
  await expect(page.locator('.ml-panel .ml-export-btn')).toHaveCount(0);        // gone from the panel

  await card(page, 'ml-single-item', 'Food').locator('.ml-menu-gear').click();
  await page.locator('.ml-action-menu:not([hidden]) .ml-menu-item--parent', { hasText: 'Export' }).click();   // opens the submenu
  await expect(page.locator('.ml-action-menu:not([hidden]) .ml-menu-subitem')).toHaveCount(2);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('.ml-action-menu:not([hidden]) .ml-menu-subitem', { hasText: 'Words Only' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('Food-spanish-words.txt');

  await page.locator('.ml-panel .ml-chip-dropdown', { hasText: 'Made of' }).locator('button').first().click();
  await page.locator('.ml-panel .ml-chip-dropdown-item', { hasText: 'Other' }).locator('input').check();
  await expect(page.locator('#myListsBar .ml-stats-row')).toHaveCount(1);
  await expect(page.locator('.ml-panel .ml-stats-row')).toHaveCount(0);
  await expect(page.locator('#myListsBar .ml-stat-chip--count')).toHaveText('3 Words');
});

test('gear menus list their options in one consistent order, Delete last', async ({ page }) => {
  await createInline(page, '.ml-single-head', 'Alpha');
  const folder = await makeFolder(page, '.ml-single-head', 'Box');
  const labels = async (owner: Locator): Promise<string[]> => {
    await owner.locator('.ml-menu-gear').first().click();
    const items = (await page.locator('.ml-action-menu:not([hidden]) > .ml-menu-item').allTextContents()).map(s => s.replace(/[^A-Za-z& ]/g, '').trim());
    await page.keyboard.press('Escape');
    return items;
  };
  expect(await labels(card(page, 'ml-single-item', 'Alpha'))).toEqual(['Rename', 'Copy', 'Emoji & Colour', 'Export', 'Delete']);
  expect(await labels(folder.locator('.ml-folder-head'))).toEqual(['Rename', 'Add Subfolder', 'Emoji & Colour', 'Hide From', 'Delete']);
});

test('the list header row: its controls, Quiz and the deselect button share one centre line', async ({ page }) => {
  await createInline(page, '.ml-single-head', 'Alpha');
  const centres = await page.evaluate(() => {
    const mid = (sel: string): number => { const r = (document.querySelector(sel) as HTMLElement).getBoundingClientRect(); return r.top + r.height / 2; };
    return [mid('.ml-panel-header .ml-chip-dropdown-toggle'), mid('.ml-panel-header .ml-quiz-btn'), mid('.ml-panel-close')];
  });
  expect(Math.max(...centres) - Math.min(...centres)).toBeLessThan(1.5);
});
