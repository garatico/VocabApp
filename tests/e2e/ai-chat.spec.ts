import { test, expect } from '@playwright/test';

/**
 * AI Chat — deliberately never clicks "Load model". The original scope for
 * this file assumed headless Chromium has no WebGPU, so ai-chat-mode.ts's
 * own hasWebGPU() check would fall back to MockEngine (no model, no
 * download — see mock-engine.ts) and a real conversation could be tested
 * safely. That assumption turned out to be wrong: this Playwright's
 * Chromium reports `navigator.gpu` present, so clicking Load model here
 * constructs the real WebLLMEngine and starts an actual multi-gigabyte
 * download — not something a test should ever trigger. This covers the
 * one thing safely reachable without loading anything: the pre-load UI.
 */
test('the pre-load UI renders and preset switching works without a model', async ({ page }) => {
  await page.goto('/');
  await page.locator('#loadingSpinner').waitFor({ state: 'hidden' });

  const errors: string[] = [];
  page.on('pageerror', err => errors.push(err.message));

  await page.locator('.mode-tab[data-mode="chat"]').click();

  await expect(page.locator('.chat-status-pill')).toHaveText('Not loaded');
  await expect(page.locator('.chat-input')).toBeDisabled();
  await expect(page.locator('.chat-send-btn')).toBeDisabled();

  await page.locator('.chat-preset-chip', { hasText: 'Quiz me' }).click();
  await expect(page.locator('.chat-preset-chip', { hasText: 'Quiz me' })).toHaveClass(/active/);
  await expect(page.locator('.chat-input')).toHaveAttribute('placeholder', /start/i);

  await page.locator('.chat-lang-select').selectOption('french');
  await expect(page.locator('.chat-status-pill')).toHaveText('Not loaded');

  expect(errors).toEqual([]);
});
