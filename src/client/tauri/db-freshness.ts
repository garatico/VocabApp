/**
 * db-freshness.ts — decides whether the app's writable copy of vocabulary.db is
 * older than the one bundled in the installer. Pure, so it is tested without
 * Tauri; db-provision.ts does the file work.
 *
 * Every pipeline build stamps `built_at` into the database's `meta` table, and the
 * build writes the bundled copy's stamp into asset-manifest.json (`dbBuiltAt`).
 * The local copy is refreshed only when the bundled one is strictly newer.
 */

/** ms since the epoch for an ISO timestamp, or null when it is absent or unreadable. */
export function stampTime(stamp: string | null | undefined): number | null {
  if (!stamp) return null;
  const t = Date.parse(stamp);
  return Number.isNaN(t) ? null : t;
}

/**
 * True when the local copy should be replaced by the bundled one.
 * - No bundled stamp (an older build, or the manifest did not load): never, so behaviour is as before.
 * - A local copy with no readable stamp (provisioned before the pipeline stamped one): yes.
 * - Otherwise: only when the bundled build is newer.
 */
export function needsRefresh(localBuiltAt: string | null | undefined, bundledBuiltAt: string | null | undefined): boolean {
  const bundled = stampTime(bundledBuiltAt);
  if (bundled === null) return false;
  const local = stampTime(localBuiltAt);
  return local === null || bundled > local;
}

/**
 * `name`, made unique against `taken` by a number before `.bak.db` — so a second backup with the same
 * stamp (two "unknown"s, when the stamp could not be read twice) never overwrites the first, which may
 * be the one holding the learner's edits.
 */
export function uniqueBackupName(name: string, taken: (candidate: string) => boolean): string {
  if (!taken(name)) return name;
  for (let n = 2; ; n++) {
    const candidate = name.replace(/\.bak\.db$/, `.${n}.bak.db`);
    if (!taken(candidate)) return candidate;
  }
}

/** A file-name-safe version of a stamp, for the backup of the copy being replaced. */
export function backupName(localBuiltAt: string | null | undefined): string {
  const safe = (localBuiltAt ?? 'unknown').replace(/[^0-9A-Za-z]+/g, '-').replace(/^-|-$/g, '') || 'unknown';
  return `vocabulary.${safe}.bak.db`;
}
