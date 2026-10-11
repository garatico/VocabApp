/**
 * reminders.ts — an optional daily "time to practise" notification.
 *
 * Android only (Capacitor Local Notifications): a web page cannot show a notification at a set time
 * once it is closed, and the desktop app has no notification plugin, so elsewhere this reports itself
 * unsupported and Settings hides the row. Off by default. Nothing is sent anywhere — the phone itself
 * fires the notification at the chosen time, every day, whether or not the app is open.
 *
 * The text is fixed ("a few words are waiting") because it is scheduled ahead of time, when the number
 * of words that will be due is not yet known; a count that was wrong by evening would be worse than none.
 */
import { Settings } from '../settings.ts';
import { t } from '../i18n/index.ts';

const NOTIFICATION_ID = 7001;

interface CapacitorGlobal { Capacitor?: { isNativePlatform?: () => boolean } }

export function remindersSupported(): boolean {
  return !!(globalThis as CapacitorGlobal).Capacitor?.isNativePlatform?.();
}

/** "19:30" → { hour: 19, minute: 30 }; anything else falls back to 19:00. */
export function parseReminderTime(value: string): { hour: number; minute: number } {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return { hour: 19, minute: 0 };
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 23 || minute > 59) return { hour: 19, minute: 0 };
  return { hour, minute };
}

async function plugin(): Promise<typeof import('@capacitor/local-notifications').LocalNotifications | null> {
  if (!remindersSupported()) return null;
  try {
    return (await import('@capacitor/local-notifications')).LocalNotifications;
  } catch {
    return null;
  }
}

export type EnableResult = 'ok' | 'denied' | 'unsupported';

/** Asks Android for permission (once; it remembers) and schedules the daily notification. */
export async function enableReminders(): Promise<EnableResult> {
  const ln = await plugin();
  if (!ln) return 'unsupported';
  let perm = await ln.checkPermissions();
  if (perm.display !== 'granted') perm = await ln.requestPermissions();
  if (perm.display !== 'granted') return 'denied';
  await schedule(ln);
  return 'ok';
}

async function schedule(ln: NonNullable<Awaited<ReturnType<typeof plugin>>>): Promise<void> {
  const { hour, minute } = parseReminderTime(Settings.getReminderTime());
  await ln.cancel({ notifications: [{ id: NOTIFICATION_ID }] });
  await ln.schedule({
    notifications: [{
      id: NOTIFICATION_ID,
      title: 'VocabApp',
      body: t('reminders.body', 'Time for a quick practice — a few words are waiting.'),
      // `on` repeats every day at that time. allowWhileIdle lets it fire when the phone is dozing.
      schedule: { on: { hour, minute }, allowWhileIdle: true },
    }],
  });
}

export async function disableReminders(): Promise<void> {
  const ln = await plugin();
  if (!ln) return;
  await ln.cancel({ notifications: [{ id: NOTIFICATION_ID }] });
}

/** Run at start-up and after a change: make what is scheduled match the setting. Quiet on any failure. */
export async function syncReminders(): Promise<void> {
  try {
    const ln = await plugin();
    if (!ln) return;
    if (!Settings.getReminders()) { await ln.cancel({ notifications: [{ id: NOTIFICATION_ID }] }); return; }
    const perm = await ln.checkPermissions();
    if (perm.display === 'granted') await schedule(ln);
  } catch { /* a reminder is never worth an error on screen */ }
}
