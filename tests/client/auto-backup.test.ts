/**
 * auto-backup.test.ts — the installed apps' automatic backup (utils/auto-backup.ts), against a fake Documents
 * folder: what a fresh install offers, what it never overwrites, and Android's "pick the file" path.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const store = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem:    (k: string) => store.get(k) ?? null,
  setItem:    (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  clear:      () => { store.clear(); },
  get length() { return store.size; },
  key: (i: number) => [...store.keys()][i] ?? null,
};
(globalThis as Record<string, unknown>).window = globalThis;
(globalThis as Record<string, unknown>).document = { addEventListener: () => {}, visibilityState: 'visible' };
(globalThis as Record<string, unknown>).setInterval = () => 0;
(globalThis as Record<string, unknown>).addEventListener = () => {};

const { initAutoBackup, AUTO_BACKUP_KEY, AUTO_BACKUP_FILE, describeBackup } = await import('../../src/client/utils/auto-backup.js');
const { buildFullBackup } = await import('../../src/client/utils/full-backup.js');
type Driver = Parameters<typeof initAutoBackup>[1];

/** A Documents/VocabApp folder. `foreign` names are files an earlier install owns: unwritable, and unreadable unless `canReadOthers`. */
function fakeFolder(opts: { files?: Record<string, string>; foreign?: string[]; canReadOthers: boolean }) {
  const files = new Map(Object.entries(opts.files ?? {}));
  const foreign = new Set(opts.foreign ?? []);
  const driver: NonNullable<Driver> = {
    where: 'Documents/VocabApp', canReadOthers: opts.canReadOthers,
    read: async name => (foreign.has(name) && !opts.canReadOthers ? null : files.get(name) ?? null),
    write: async (name, text) => {
      if (foreign.has(name)) throw new Error('EACCES');
      files.set(name, text);
    },
  };
  return { driver, files };
}

/** A backup file as an earlier install would have left it. */
function oldBackup(data: Record<string, string>): string {
  return JSON.stringify({ format: 'vocabapp-full-backup', version: 1, exportedAt: '2026-10-01T10:00:00.000Z', schema: 0, data });
}
const OLD_DATA = { vq_lists_spanish: '{"Reading":["hablar","comer"]}', s_theme: 'dark', vq_mode: 'table' };

function ui(answers: { restore?: boolean; pick?: string | null } = {}) {
  return {
    offerFound: vi.fn(async () => answers.restore ?? false),
    askToPick: vi.fn(async () => answers.pick ?? null),
    restored: vi.fn(),
  };
}

beforeEach(() => store.clear());

describe('in a browser', () => {
  it('does nothing at all', async () => {
    const u = ui();
    expect(await initAutoBackup(u, null)).toBeNull();
    expect(store.size).toBe(0);
    expect(u.offerFound).not.toHaveBeenCalled();
  });
});

describe('Windows (the app reads the folder itself)', () => {
  it('a fresh install that finds a backup offers it, and restores it on yes', async () => {
    const { driver } = fakeFolder({ files: { [AUTO_BACKUP_FILE]: oldBackup(OLD_DATA) }, canReadOthers: true });
    const u = ui({ restore: true });
    expect(await initAutoBackup(u, driver)).toBe(AUTO_BACKUP_FILE);
    expect(u.offerFound).toHaveBeenCalledOnce();
    expect(store.get('vq_lists_spanish')).toBe(OLD_DATA.vq_lists_spanish);
    expect(store.get('s_theme')).toBe('dark');
    expect(store.get(AUTO_BACKUP_KEY)).toBe(AUTO_BACKUP_FILE);
    expect(u.restored).toHaveBeenCalledOnce();
  });

  it('"Start fresh" leaves the old file untouched and writes beside it', async () => {
    const { driver, files } = fakeFolder({ files: { [AUTO_BACKUP_FILE]: oldBackup(OLD_DATA) }, canReadOthers: true });
    const before = files.get(AUTO_BACKUP_FILE);
    const name = await initAutoBackup(ui({ restore: false }), driver);
    expect(name).not.toBe(AUTO_BACKUP_FILE);
    expect(files.get(AUTO_BACKUP_FILE)).toBe(before);
    expect(files.has(name!)).toBe(true);
    expect(store.get('vq_lists_spanish')).toBeUndefined();
  });

  it('someone who already has data is not asked, and the file is brought up to date', async () => {
    store.set('vq_lists_spanish', '{"Mine":["casa"]}');
    const { driver, files } = fakeFolder({ files: { [AUTO_BACKUP_FILE]: oldBackup(OLD_DATA) }, canReadOthers: true });
    const u = ui();
    expect(await initAutoBackup(u, driver)).toBe(AUTO_BACKUP_FILE);
    expect(u.offerFound).not.toHaveBeenCalled();
    expect(JSON.parse(files.get(AUTO_BACKUP_FILE)!).data.vq_lists_spanish).toBe('{"Mine":["casa"]}');
  });

  it('with nothing to find, it just starts keeping the file — and asks nothing', async () => {
    const { driver, files } = fakeFolder({ canReadOthers: true });
    const u = ui();
    expect(await initAutoBackup(u, driver)).toBe(AUTO_BACKUP_FILE);
    expect(u.offerFound).not.toHaveBeenCalled();
    expect(u.askToPick).not.toHaveBeenCalled();
    expect(files.has(AUTO_BACKUP_FILE)).toBe(true);
  });

  it('after the first start the check never runs again: it only writes', async () => {
    store.set(AUTO_BACKUP_KEY, 'vocabapp-backup-20261001-100000.json');
    store.set('s_theme', 'light');
    const { driver, files } = fakeFolder({ files: { [AUTO_BACKUP_FILE]: oldBackup(OLD_DATA) }, canReadOthers: true });
    const u = ui({ restore: true });
    expect(await initAutoBackup(u, driver)).toBe('vocabapp-backup-20261001-100000.json');
    expect(u.offerFound).not.toHaveBeenCalled();
    expect(JSON.parse(files.get('vocabapp-backup-20261001-100000.json')!).data.s_theme).toBe('light');
  });
});

describe('Android (a reinstalled app may not read or overwrite its earlier file)', () => {
  it('asks the learner to pick the file, restores what they pick, and writes its own copy', async () => {
    const { driver, files } = fakeFolder({ files: { [AUTO_BACKUP_FILE]: oldBackup(OLD_DATA) }, foreign: [AUTO_BACKUP_FILE], canReadOthers: false });
    const u = ui({ pick: oldBackup(OLD_DATA) });
    const name = await initAutoBackup(u, driver);
    expect(u.askToPick).toHaveBeenCalledOnce();
    expect(store.get('vq_lists_spanish')).toBe(OLD_DATA.vq_lists_spanish);
    expect(name).not.toBe(AUTO_BACKUP_FILE);
    expect(store.get(AUTO_BACKUP_KEY)).toBe(name);
    expect(u.restored).toHaveBeenCalledOnce();
    expect(files.get(AUTO_BACKUP_FILE)).toBe(oldBackup(OLD_DATA));            // never overwritten
  });

  it('"Start fresh" (nothing picked) carries on with a file of its own', async () => {
    const { driver, files } = fakeFolder({ files: { [AUTO_BACKUP_FILE]: oldBackup(OLD_DATA) }, foreign: [AUTO_BACKUP_FILE], canReadOthers: false });
    const name = await initAutoBackup(ui({ pick: null }), driver);
    expect(name).toMatch(/^vocabapp-backup-\d{8}-\d{6}\.json$/);
    expect(files.has(name!)).toBe(true);
    expect(store.get('vq_lists_spanish')).toBeUndefined();
  });

  it('a first install (no earlier file) asks nothing', async () => {
    const { driver } = fakeFolder({ canReadOthers: false });
    const u = ui();
    expect(await initAutoBackup(u, driver)).toBe(AUTO_BACKUP_FILE);
    expect(u.askToPick).not.toHaveBeenCalled();
  });
});

describe('the file itself', () => {
  it('is a full backup, and never carries the install\'s own bookkeeping', async () => {
    store.set('vq_lists_spanish', '{"Mine":["casa"]}');
    const { driver, files } = fakeFolder({ canReadOthers: true });
    await initAutoBackup(ui(), driver);
    const written = JSON.parse(files.get(AUTO_BACKUP_FILE)!);
    expect(written.format).toBe('vocabapp-full-backup');
    expect(written.data[AUTO_BACKUP_KEY]).toBeUndefined();
    expect(Object.keys(written.data)).toEqual(Object.keys(buildFullBackup().data));
  });

  it('describeBackup turns down anything that is not one of ours, or is empty', () => {
    expect(describeBackup(null)).toBeNull();
    expect(describeBackup('not json')).toBeNull();
    expect(describeBackup('{"format":"something-else","data":{"a":"1"}}')).toBeNull();
    expect(describeBackup(oldBackup({}))).toBeNull();
    expect(describeBackup(oldBackup(OLD_DATA))?.keys).toBe(3);
  });
});
