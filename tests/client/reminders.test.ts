// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { parseReminderTime, remindersSupported, enableReminders, syncReminders } from '../../src/client/utils/reminders.ts';

describe('parseReminderTime', () => {
  it('reads HH:MM', () => {
    expect(parseReminderTime('19:30')).toEqual({ hour: 19, minute: 30 });
    expect(parseReminderTime('07:05')).toEqual({ hour: 7, minute: 5 });
    expect(parseReminderTime('0:00')).toEqual({ hour: 0, minute: 0 });
  });
  it('falls back to 19:00 for anything unusable', () => {
    for (const bad of ['', 'abc', '25:00', '12:75', '7', '19-30']) {
      expect(parseReminderTime(bad)).toEqual({ hour: 19, minute: 0 });
    }
  });
});

describe('where reminders exist', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => { delete (globalThis as Record<string, unknown>)['Capacitor']; });

  it('are unsupported in a browser, and say so instead of throwing', async () => {
    expect(remindersSupported()).toBe(false);
    expect(await enableReminders()).toBe('unsupported');
    await expect(syncReminders()).resolves.toBeUndefined();
  });

  it('are supported inside the native app shell', () => {
    (globalThis as Record<string, unknown>)['Capacitor'] = { isNativePlatform: () => true };
    expect(remindersSupported()).toBe(true);
  });
});
