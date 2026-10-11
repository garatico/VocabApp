import { test, expect, type Page } from '@playwright/test';
import { appReady, disableSimpleMode } from './helpers.ts';

async function open(page: Page, seed: () => void = () => {}): Promise<void> {
  await disableSimpleMode(page);
  await page.addInitScript(() => { localStorage.setItem('s_onboarding_seen', 'true'); });
  await page.addInitScript(seed);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await appReady(page);
}

test.describe('command palette', () => {
  test('Ctrl+K opens it, typing filters, Enter goes there, Escape closes', async ({ page }) => {
    await open(page);
    await page.keyboard.press('Control+k');
    const input = page.locator('.cmdk-input');
    await expect(input).toBeFocused();
    await expect(page.locator('.cmdk-panel')).toHaveAttribute('role', 'dialog');

    await input.fill('history');
    await expect(page.locator('.cmdk-item').first()).toContainText('History');
    await page.keyboard.press('Enter');
    await expect(page.locator('.cmdk-panel')).toHaveCount(0);
    await expect(page.locator('.mode-tab[data-mode="history"]')).toHaveClass(/active/);

    await page.keyboard.press('Control+k');
    await expect(input).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('.cmdk-panel')).toHaveCount(0);
  });

  test('finds a setting by its label and opens it in Settings', async ({ page }) => {
    await open(page);
    await page.keyboard.press('Control+k');
    await page.locator('.cmdk-input').fill('pronunciation');
    const first = page.locator('.cmdk-item').first();
    await expect(first).toContainText('Pronunciation');
    await page.keyboard.press('Enter');
    await expect(page.locator('.mode-tab[data-mode="settings"]')).toHaveClass(/active/);
    await expect(page.locator('#settingPronunciationRow')).toBeInViewport();
  });

  test('changes the language', async ({ page }) => {
    await open(page);
    await page.keyboard.press('Control+k');
    await page.locator('.cmdk-input').fill('french');
    await page.keyboard.press('Enter');
    await expect(page.locator('#langSelect')).toHaveValue('french');
  });

  test('works from inside a text box, and shows a message when nothing matches', async ({ page }) => {
    await open(page);
    await page.locator('.mode-tab[data-mode="settings"]').click();
    await page.locator('#settingsSearch').focus();
    await page.keyboard.press('Control+k');
    await page.locator('.cmdk-input').fill('qzxqzxqzx');
    await expect(page.locator('.cmdk-empty')).toBeVisible();
  });
});

/** A stand-in for the browser's speech engine: records what would be spoken, with which voice. */
const FAKE_SPEECH = (): void => {
  const spoken: { text: string; lang: string; voice: string | null }[] = [];
  (window as unknown as { __spoken: typeof spoken }).__spoken = spoken;
  const voices = [
    { name: 'English US', lang: 'en-US', default: true, localService: true },
    { name: 'Spanish Spain', lang: 'es-ES', default: false, localService: true },
    { name: 'Spanish Mexico', lang: 'es-MX', default: false, localService: true },
  ];
  class Utterance { text: string; lang = ''; voice: { name: string } | null = null; rate = 1; constructor(t: string) { this.text = t; } }
  Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: Utterance, configurable: true });
  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    value: {
      getVoices: () => voices,
      cancel() {},
      speak(u: Utterance) { spoken.push({ text: u.text, lang: u.lang, voice: u.voice?.name ?? null }); },
      addEventListener() {}, removeEventListener() {},
    },
  });
};

test.describe('pronunciation', () => {
  test('is off by default: no speaker button anywhere', async ({ page }) => {
    await page.addInitScript(FAKE_SPEECH);
    await open(page);
    await page.locator('#startBtn').click();
    await expect(page.locator('#tableWrap input[type="text"]').first()).toBeVisible();
    await expect(page.locator('.speak-btn')).toHaveCount(0);
  });

  test('on: the speaker says the word with a voice for its language', async ({ page }) => {
    await page.addInitScript(FAKE_SPEECH);
    await open(page, () => { localStorage.setItem('s_pronunciation', 'true'); });
    await page.locator('#startBtn').click();
    const btn = page.locator('#tableWrap .speak-btn').first();
    await expect(btn).toBeVisible();
    await btn.click();
    const spoken = await page.evaluate(() => (window as unknown as { __spoken: { text: string; lang: string; voice: string }[] }).__spoken);
    expect(spoken).toHaveLength(1);
    expect(spoken[0].lang).toBe('es-ES');
    expect(spoken[0].voice).toBe('Spanish Spain');
    expect(spoken[0].text.length).toBeGreaterThan(0);
  });

  test('follows the regional flag chosen for the language', async ({ page }) => {
    await page.addInitScript(FAKE_SPEECH);
    await open(page, () => { localStorage.setItem('s_pronunciation', 'true'); localStorage.setItem('s_lang_flag_spanish', 'mx'); });
    await page.locator('#startBtn').click();
    await page.locator('#tableWrap .speak-btn').first().click();
    const spoken = await page.evaluate(() => (window as unknown as { __spoken: { lang: string }[] }).__spoken);
    expect(spoken[0].lang).toBe('es-MX');
  });

  test('says nothing, and says why, when the device has no voice for the language', async ({ page }) => {
    await page.addInitScript(FAKE_SPEECH);
    await open(page, () => { localStorage.setItem('s_pronunciation', 'true'); });
    await page.locator('#langSelect').selectOption('german');
    await expect(page.locator('#vocabBgLoading')).toBeHidden({ timeout: 30_000 });   // the language has finished loading
    await page.locator('#startBtn').click();
    const btn = page.locator('#tableWrap .speak-btn').first();
    await expect(btn).toBeVisible({ timeout: 30_000 });
    await btn.click();
    await expect(page.locator('.toast-message').first()).toContainText('No German voice');
    expect(await page.evaluate(() => (window as unknown as { __spoken: unknown[] }).__spoken.length)).toBe(0);
  });
});
