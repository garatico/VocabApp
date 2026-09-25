/**
 * storage-boot.ts — runs the storage migrations, as a side effect of being imported.
 *
 * Import this FIRST in every entry point (app.ts, admin.ts). ES modules evaluate
 * in import order, so this finishes before the modules imported after it run
 * their own top-level code — nothing then reads storage in a half-migrated state.
 * It is synchronous for the same reason; see storage-migrations.ts for the rules
 * the steps follow and what happens when one fails.
 *
 * Two tabs starting at once may both run it. That is safe because every step is
 * idempotent and writes the new value before removing the old one.
 */

import { runMigrations, type MigrationReport } from './storage-migrations.ts';
import { logger } from './logger.ts';

export const migrationReport: MigrationReport = runMigrations();

if (migrationReport.ran.length > 0) {
  logger.info(
    `storage: migrated layout ${migrationReport.from} -> ${migrationReport.to} `
    + `(${migrationReport.ran.map(s => `${s.id}:${s.changed}`).join(', ')} keys changed per step)`,
  );
}
if (migrationReport.failed) {
  logger.warn(
    `storage: migration ${migrationReport.failed.id} ("${migrationReport.failed.name}") failed: `
    + `${migrationReport.failed.error}. Data is unchanged from that step on; it will be retried next start.`,
  );
}
if (migrationReport.newerThanApp) {
  logger.warn(`storage: data is at layout ${migrationReport.from}, newer than this app understands; leaving it alone.`);
}
