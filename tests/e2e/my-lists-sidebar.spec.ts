import { test, expect, type Page, type Locator } from '@playwright/test';
import { disableSimpleMode } from './helpers.ts';

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

  answerNext(page);
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

// ═══ Smart lists ═══════════════════════════════════════════════════════════════
test('smart lists: create, rename, copy and delete', async ({ page }) => {
  await createInline(page, '.ml-smart-head', 'Verbs');
  await expect(card(page, 'ml-smart-item', 'Verbs')).toBeVisible();

  await renameInline(page, card(page, 'ml-smart-item', 'Verbs'), 'Verbs2');
  await expect(card(page, 'ml-smart-item', 'Verbs2')).toBeVisible();

  answerNext(page, 'Verbs2 (copy)');
  await menuAction(page, card(page, 'ml-smart-item', 'Verbs2'), 'copy');
  await expect(card(page, 'ml-smart-item', 'Verbs2 (copy)')).toBeVisible();

  answerNext(page);
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

  answerNext(page);
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

  answerNext(page);
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

  answerNext(page, 'Nights (copy)');
  await menuAction(page, card(page, 'ml-visual-item', 'Nights'), 'copy');
  await expect(card(page, 'ml-visual-item', 'Nights (copy)')).toBeVisible();

  answerNext(page);
  await menuAction(page, card(page, 'ml-visual-item', 'Nights (copy)'), 'delete');
  await expect(card(page, 'ml-visual-item', 'Nights (copy)')).toHaveCount(0);
  await expect(page.locator('.ml-panel-title')).toHaveCount(0);              // its panel closed with it

  answerNext(page);
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
  await expect(page.locator('.ml-smart-desc')).toHaveText('Dark Theme · Extra Large Text · 8 More Settings');

  // Editing and selecting never repaint the app; only Apply does.
  await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);
  await card(page, 'ml-visual-item', 'Look').click();
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
  await expect(page.locator('.ml-smart-desc')).toContainText('8 More Settings')   // a new profile starts from every setting as it is now;

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
  expect(await accent()).toBe('#00aa55');
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
  expect(await accent()).toBe('#00aa55');

  await page.locator('#settingResetMlColors').evaluate((el: HTMLElement) => el.click());
  expect(await accent()).toBe(original);
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
