import { test, expect, type Page } from '@playwright/test';
import { appReady, disableSimpleMode, openMode } from './helpers.ts';

async function open(page: Page, width = 1280, height = 900): Promise<void> {
  await disableSimpleMode(page);
  await page.addInitScript(() => { localStorage.setItem('s_onboarding_seen', 'true'); });
  await page.setViewportSize({ width, height });
  await page.goto('/');
  await appReady(page);
}

/** My Content's Words tab with the second word of the list open in the form. */
async function openFirstWords(page: Page): Promise<void> {
  await openMode(page, 'myContent');
  await expect(page.locator('.mc-we .word-item').first()).toBeVisible();
  await page.locator('.mc-we .word-item').nth(1).click();
  await expect(page.locator('.mc-we .edit-form-card')).toBeVisible();
}

test.describe('My Content word editor, desktop', () => {
  test('"Hide from quizzes" is a plain button up top with Collapse All, with no description box', async ({ page }) => {
    await open(page);
    await openFirstWords(page);
    const hide = page.locator('.mc-we .edit-form-header .we-hide-btn');
    await expect(hide).toBeVisible();
    await expect(hide).toHaveText('Hide from quizzes');
    await expect(page.locator('.mc-we .we-hide')).toHaveCount(0);        // the old box with its blurb is gone
    const collapse = (await page.locator('#mcwe-toggleAllSectionsBtn').boundingBox())!;
    const h = (await hide.boundingBox())!;
    expect(Math.abs(h.y - collapse.y)).toBeLessThan(120);                // in the same header block
  });

  test('"Meanings needed" is a number box from 1 to the word\'s senses; blank is Auto', async ({ page }) => {
    await open(page);
    await openFirstWords(page);
    const input = page.locator('.mc-we .we-meanings-input');
    const max = Number(await input.getAttribute('max'));
    expect(max).toBeGreaterThanOrEqual(1);
    await expect(page.locator('.mc-we .we-meanings-of')).toHaveText(`of ${max}`);
    if (max < 2) test.skip(true, 'the second word has a single sense');

    await input.fill('2');
    await input.press('Enter');
    await expect(input).toHaveValue('2');
    const word = await page.locator('#mcwe-editWord').inputValue();
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('vq_glossreq_spanish') ?? '{}') as Record<string, number>);
    expect(stored[word]).toBe(2);

    await input.fill(String(max + 5));                      // more than it has: kept at the number it has
    await input.press('Enter');
    await expect(input).toHaveValue(String(max));

    await page.locator('.mc-we .we-meanings-auto').click();
    await expect(input).toHaveValue('');
    const cleared = await page.evaluate(() => JSON.parse(localStorage.getItem('vq_glossreq_spanish') ?? '{}') as Record<string, number>);
    expect(cleared[word]).toBeUndefined();
  });

  test('sense notes stay folded until asked for, and open by themselves for a word that has one', async ({ page }) => {
    await open(page);
    await openFirstWords(page);
    const list = page.locator('.mc-we .we-meaning-list');
    const toggle = page.locator('.mc-we .we-meaning-toggle');
    await expect(toggle).toHaveText('+ Add a sense note');
    await expect(list).toBeHidden();
    const folded = (await page.locator('.mc-we .we-meaning-notes').boundingBox())!;
    expect(folded.height).toBeLessThan(50);                 // one line, not a row per gloss

    await toggle.click();
    await expect(list).toBeVisible();
    await expect(toggle).toHaveText('▾ Sense notes');
    const note = list.locator('input').first();
    await note.fill('e2e note');
    await page.locator('#mcwe-saveBtn').click();
    await expect(page.locator('#mcwe-saveBtn')).toBeDisabled();

    // Another word is folded again; this one opens with its note showing.
    await page.locator('.mc-we .word-item').nth(3).click();
    await expect(list).toBeHidden();
    await page.locator('.mc-we .word-item').nth(1).click();
    await expect(list).toBeVisible();
    await expect(list.locator('input').first()).toHaveValue('e2e note');
  });
});

test('"Edit in My Content" from a quiz opens the word in the editor, not just a search', async ({ page }) => {
  await open(page);
  await page.locator('#startBtn').click();
  await expect(page.locator('#tableWrap .spanish-word').first()).toBeVisible();
  await page.locator('#tableReset').click();                // Give Up: every word is revealed

  const first = page.locator('#tableWrap .spanish-word').first();
  const word = (JSON.parse((await first.getAttribute('data-word-json'))!) as { word: string }).word;
  await first.click();
  await page.getByRole('button', { name: /Edit in My Content/ }).click();

  await expect(page.locator('.mode-tab[data-mode="myContent"]')).toHaveClass(/active/);
  await expect(page.locator('#mcwe-editFormCard')).toBeVisible();
  await expect(page.locator('#mcwe-editWord')).toHaveValue(word);
  await expect(page.locator('.mc-we .word-item.active .word-item-key')).toHaveText(word);
});

test('on a phone, Part of Speech, Difficulty and CEFR band share one line', async ({ page }) => {
  await open(page, 390, 844);
  await openFirstWords(page);
  const tops = await page.locator('.mc-we .form-row-3 > .form-group').evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().top)));
  expect(tops).toHaveLength(3);
  expect(new Set(tops).size).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
});

test.describe('My Content word editor: folded sections, facts strip, save bar, changed marker', () => {
  test('only Identity starts open; the others show a summary, and what is opened is remembered', async ({ page }) => {
    await open(page);
    await openFirstWords(page);
    const section = (key: string) => page.locator(`.mc-we .form-section:has(> .form-section-title[data-key="${key}"])`);
    await expect(section('identity')).not.toHaveClass(/collapsed/);
    for (const key of ['classification', 'linguistic data', 'examples & notes']) await expect(section(key)).toHaveClass(/collapsed/);
    await expect(section('classification').locator('.form-section-summary')).not.toHaveText('');

    await section('classification').locator('> .form-section-title').click();
    await expect(section('classification')).not.toHaveClass(/collapsed/);

    await page.reload();
    await appReady(page);
    await openFirstWords(page);
    await expect(section('classification')).not.toHaveClass(/collapsed/);   // as the learner left it
    await expect(section('examples & notes')).toHaveClass(/collapsed/);
  });

  test('the read-only linguistic data is a strip of chips, not a block of disabled inputs', async ({ page }) => {
    await open(page);
    await openFirstWords(page);
    await expect(page.locator('.mc-we .we-facts .we-fact').first()).toBeVisible();
    await expect(page.locator('#mcwe-editIPA')).toBeHidden();
    await expect(page.locator('#mcwe-editPlural')).toBeHidden();
  });

  test('the extra facts are off until switched on in Settings, and each fact has its own colour', async ({ page }) => {
    await open(page);
    await openFirstWords(page);
    const keys = await page.locator('.mc-we .we-fact').evaluateAll(els => els.map(e => (e as HTMLElement).dataset['fact']));
    expect(keys.length).toBeGreaterThan(0);
    for (const extra of ['syllables', 'register', 'reflexive', 'corpus', 'emoji']) expect(keys).not.toContain(extra);
    const colours = await page.locator('.mc-we .we-fact').evaluateAll(els => els.map(e => getComputedStyle(e).getPropertyValue('--fh').trim()));
    expect(new Set(colours).size).toBe(colours.length);                   // no two share a colour

    await page.evaluate(() => localStorage.setItem('s_we_facts_extra', 'syllables,register,corpus'));
    await page.reload();
    await appReady(page);
    await openFirstWords(page);
    const after = await page.locator('.mc-we .we-fact').evaluateAll(els => els.map(e => (e as HTMLElement).dataset['fact']));
    expect(after).toContain('syllables');
    expect(after).not.toContain('emoji');
  });

  test('on a phone the facts are equal cells, two across', async ({ page }) => {
    await open(page, 390, 844);
    await openFirstWords(page);
    const boxes = await page.locator('.mc-we .we-fact').evaluateAll(els => els.map(e => {
      const r = e.getBoundingClientRect();
      return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width) };
    }));
    expect(boxes.length).toBeGreaterThanOrEqual(2);
    expect(boxes[0].y).toBe(boxes[1].y);                                    // two on a row
    expect(boxes[0].w).toBe(boxes[1].w);                                    // equal widths
    if (boxes.length > 2) expect(boxes[2].y).toBeGreaterThan(boxes[0].y);   // then a second row
  });

  test('the number box is wide enough to show "Auto"', async ({ page }) => {
    await open(page, 390, 844);
    await openFirstWords(page);
    const fits = await page.locator('.mc-we .we-meanings-input').evaluate(el => {
      const i = el as HTMLInputElement;
      return i.clientWidth >= 70 && i.scrollWidth <= i.clientWidth + 1;
    });
    expect(fits).toBe(true);
  });

  test('Save and Reset sit in a bar pinned to the foot of the form, with a count of changed fields', async ({ page }) => {
    await open(page, 1280, 700);
    await openFirstWords(page);
    const bar = page.locator('.mc-we .edit-form-savebar');
    await expect(bar).toBeVisible();
    await expect(bar.locator('#mcwe-saveBtn')).toBeVisible();
    await expect(bar.locator('#mcwe-resetBtn')).toBeVisible();
    await expect(page.locator('.mc-we .edit-form-header #mcwe-saveBtn')).toHaveCount(0);

    // Open every section so the form is as long as it gets; the bar is still on screen.
    for (const key of ['classification', 'linguistic data', 'examples & notes']) {
      await page.locator(`.mc-we .form-section-title[data-key="${key}"]`).click();
    }
    const box = (await bar.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(700 + 1);
  });

  test('a changed field is marked like a changed setting, with a ↺ that puts it back', async ({ page }) => {
    await open(page);
    await openFirstWords(page);
    const translation = page.locator('#mcwe-editTranslation');
    const original = await translation.inputValue();
    const group = page.locator('.mc-we .form-group:has(#mcwe-editTranslation)');
    await expect(group).not.toHaveClass(/we-modified/);

    await translation.fill(`${original} (changed)`);
    await expect(group).toHaveClass(/we-modified/);
    await expect(page.locator('.mc-we .we-savebar-status')).toContainText('1 field differs from the original');
    const revert = group.locator('.we-revert');
    await expect(revert).toHaveText('↺');

    await revert.click();
    await expect(translation).toHaveValue(original);
    await expect(group).not.toHaveClass(/we-modified/);
  });
});
