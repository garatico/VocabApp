/**
 * db-provision.ts — first-run setup for the Tauri desktop app's own,
 * writable SQLite copy.
 *
 * On first launch, the bundled read-only resource db (staged into
 * src-tauri/resources/vocabulary.db by scripts/build-native.ts, from
 * whatever VocabApp-Data built) is copied into the app's writable data
 * directory. Every launch after that reuses the existing copy untouched —
 * app updates never overwrite it, so a user's own admin edits are never
 * silently discarded. Getting newer vocab data is a deliberate, separate
 * action (resetLocalDbToBundled, below) — not wired to any UI yet.
 *
 * Only ever imported behind isPackagedApp() — see bootstrap.ts.
 */
import { appDataDir, resolveResource, join } from '@tauri-apps/api/path';
import { exists, mkdir, copyFile } from '@tauri-apps/plugin-fs';

const DB_FILENAME = 'vocabulary.db';
const BUNDLED_RESOURCE_PATH = `data/${DB_FILENAME}`;

async function localDbPath(): Promise<string> {
  return join(await appDataDir(), DB_FILENAME);
}

/**
 * Ensures the app's own writable db copy exists, provisioning it from the
 * bundled resource on first run. Returns the absolute path to that copy,
 * for Database.load(`sqlite:${path}`).
 */
export async function ensureLocalDb(): Promise<string> {
  const dataDir = await appDataDir();
  if (!(await exists(dataDir))) await mkdir(dataDir, { recursive: true });

  const localPath = await localDbPath();
  if (!(await exists(localPath))) {
    const resourcePath = await resolveResource(BUNDLED_RESOURCE_PATH);
    await copyFile(resourcePath, localPath);
  }
  return localPath;
}

/**
 * Placeholder for a future explicit "reset to bundled data" action —
 * intentionally destructive (discards any local edits) and intentionally
 * not wired to any UI yet. Not called anywhere today.
 */
export async function resetLocalDbToBundled(): Promise<string> {
  const localPath = await localDbPath();
  const resourcePath = await resolveResource(BUNDLED_RESOURCE_PATH);
  await copyFile(resourcePath, localPath);
  return localPath;
}
