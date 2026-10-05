/**
 * db-provision.ts — setup for the Tauri desktop app's own, writable SQLite copy.
 *
 * On first launch, the bundled read-only resource db (staged into
 * src-tauri/resources/vocabulary.db by scripts/build-native.ts, from
 * whatever VocabApp-Data built) is copied into the app's writable data
 * directory. On later launches the copy is reused untouched UNLESS the installer
 * carries a newer build of the data (compared by the `built_at` the pipeline stamps
 * into `meta`, against `dbBuiltAt` in asset-manifest.json). Then the old copy is
 * kept as vocabulary.<its stamp>.bak.db next to it and the new one is copied in,
 * so an update ships new data and a person's own edits are never silently lost.
 * Before this, the copy was never refreshed: an installer built from re-ranked
 * data kept showing the old ranking.
 *
 * Only ever imported behind isPackagedApp() — see bootstrap.ts.
 */
import { appDataDir, resolveResource, join } from '@tauri-apps/api/path';
import { exists, mkdir, copyFile, remove } from '@tauri-apps/plugin-fs';
import Database from '@tauri-apps/plugin-sql';
import { needsRefresh, backupName } from './db-freshness.js';

const DB_FILENAME = 'vocabulary.db';
const BUNDLED_RESOURCE_PATH = `data/${DB_FILENAME}`;

async function localDbPath(): Promise<string> {
  return join(await appDataDir(), DB_FILENAME);
}

/**
 * Ensures the app's own writable db copy exists and is not older than the one in
 * the installer. Returns the absolute path to that copy, for
 * Database.load(`sqlite:${path}`).
 */
export async function ensureLocalDb(): Promise<string> {
  const dataDir = await appDataDir();
  if (!(await exists(dataDir))) await mkdir(dataDir, { recursive: true });

  const localPath = await localDbPath();
  const resourcePath = await resolveResource(BUNDLED_RESOURCE_PATH);
  if (!(await exists(localPath))) {
    await copyFile(resourcePath, localPath);
    return localPath;
  }

  const bundledBuiltAt = await bundledStamp();
  if (bundledBuiltAt) {
    const localBuiltAt = await localStamp(localPath);
    if (needsRefresh(localBuiltAt, bundledBuiltAt)) {
      await copyFile(localPath, await join(dataDir, backupName(localBuiltAt)));
      await replaceLocalDb(localPath, resourcePath);
    }
  }
  return localPath;
}

/** The bundled copy's `built_at`, written into the manifest at build time; null if it cannot be read. */
async function bundledStamp(): Promise<string | null> {
  try {
    const res = await fetch('/data/asset-manifest.json');
    if (!res.ok) return null;
    const manifest = await res.json() as { dbBuiltAt?: string | null };
    return manifest.dbBuiltAt ?? null;
  } catch {
    return null;
  }
}

/** The local copy's `built_at`, or null when it has none (provisioned before the pipeline stamped one). */
async function localStamp(localPath: string): Promise<string | null> {
  let db: Database | null = null;
  try {
    db = await Database.load(`sqlite:${localPath}`);
    const rows = await db.select<{ value: string }[]>("SELECT value FROM meta WHERE key = 'built_at'");
    return rows[0]?.value ?? null;
  } catch {
    return null;
  } finally {
    try { await db?.close(); } catch { /* nothing to close */ }
  }
}

/** Overwrite the local copy; a leftover -wal/-shm from the old file must not be replayed onto the new one. */
async function replaceLocalDb(localPath: string, resourcePath: string): Promise<void> {
  for (const suffix of ['-wal', '-shm']) {
    if (await exists(localPath + suffix)) await remove(localPath + suffix);
  }
  await copyFile(resourcePath, localPath);
}

/**
 * Placeholder for a future explicit "reset to bundled data" action —
 * intentionally destructive (discards any local edits) and intentionally
 * not wired to any UI yet. Not called anywhere today.
 */
export async function resetLocalDbToBundled(): Promise<string> {
  const localPath = await localDbPath();
  await replaceLocalDb(localPath, await resolveResource(BUNDLED_RESOURCE_PATH));
  return localPath;
}
