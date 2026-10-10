// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { classifyBurst, buzz, initHaptics } from '../../src/client/utils/haptics.ts';

describe('classifyBurst', () => {
  it('is quiet when nothing was marked', () => {
    expect(classifyBurst([])).toBeNull();
  });
  it('buzzes "right" for a correct mark and "wrong" for an incorrect one', () => {
    expect(classifyBurst([['correct']])).toBe('right');
    expect(classifyBurst([['incorrect']])).toBe('wrong');
    expect(classifyBurst([['tv-option--wrong']])).toBe('wrong');
    expect(classifyBurst([['pm-correct']])).toBe('right');
  });
  it('lets wrong win when one burst has both', () => {
    expect(classifyBurst([['correct'], ['incorrect']])).toBe('wrong');
  });
  it('stays silent for a restore or reveal-all (many marks at once)', () => {
    expect(classifyBurst(Array.from({ length: 12 }, () => ['correct']))).toBeNull();
  });
});

describe('haptics', () => {
  let vibrate: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '<input id="a"><div id="row"></div>';
    vibrate = vi.fn(() => true);
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
  });
  afterEach(() => {
    delete (navigator as unknown as Record<string, unknown>)['vibrate'];
  });

  it('buzz() vibrates, and does nothing when the setting is off', () => {
    buzz('right');
    expect(vibrate).toHaveBeenCalledTimes(1);
    localStorage.setItem('s_haptics', 'false');
    buzz('wrong');
    expect(vibrate).toHaveBeenCalledTimes(1);
  });

  it('buzzes when the learner answers, but not when a quiz is restored with nobody touching the page', async () => {
    initHaptics();
    const row = document.getElementById('row') as HTMLElement;

    row.classList.add('correct');                       // nobody has touched the page yet: a restore
    await new Promise(r => setTimeout(r, 0));
    expect(vibrate).not.toHaveBeenCalled();

    document.getElementById('a')!.dispatchEvent(new Event('input', { bubbles: true }));
    row.classList.remove('correct');
    row.classList.add('incorrect');                     // right after typing: an answer
    await new Promise(r => setTimeout(r, 0));
    expect(vibrate).toHaveBeenCalledTimes(1);
  });
});
