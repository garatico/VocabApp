import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { needsRefresh, backupName, stampTime } from '../src/client/tauri/db-freshness.ts';
import { readDbBuiltAt, buildAssetManifest } from '../scripts/lib/asset-manifest.ts';

describe('needsRefresh: the packaged app keeps its own db copy unless the installer has newer data', () => {
  const OLD = '2026-09-11T05:17:37+00:00';
  const NEW = '2026-10-05T03:49:26+00:00';

  it('replaces an older local copy', () => {
    expect(needsRefresh(OLD, NEW)).toBe(true);
  });

  it('keeps a copy that is the same or newer (a reinstall of an older build must not roll data back)', () => {
    expect(needsRefresh(NEW, NEW)).toBe(false);
    expect(needsRefresh(NEW, OLD)).toBe(false);
  });

  it('replaces a copy that carries no readable stamp (provisioned before the pipeline stamped one)', () => {
    expect(needsRefresh(null, NEW)).toBe(true);
    expect(needsRefresh('', NEW)).toBe(true);
    expect(needsRefresh('not a date', NEW)).toBe(true);
  });

  it('does nothing when the installer has no stamp, as before this check existed', () => {
    expect(needsRefresh(OLD, null)).toBe(false);
    expect(needsRefresh(null, undefined)).toBe(false);
    expect(needsRefresh(OLD, 'garbage')).toBe(false);
  });

  it('compares instants, not strings', () => {
    expect(needsRefresh('2026-10-05T03:00:00+00:00', '2026-10-05T04:00:00+01:00')).toBe(false);
    expect(stampTime('2026-10-05T04:00:00+01:00')).toBe(stampTime('2026-10-05T03:00:00+00:00'));
  });

  it('names the backup after the stamp of the copy it keeps', () => {
    expect(backupName(OLD)).toBe('vocabulary.2026-09-11T05-17-37-00-00.bak.db');
    expect(backupName(null)).toBe('vocabulary.unknown.bak.db');
  });
});

describe('the asset manifest carries the bundled db stamp', () => {
  // Vitest swaps better-sqlite3 for an in-memory shim that cannot open a real file, so the positive
  // path (a real vocabulary.db) is checked by the build itself: dist/data/asset-manifest.json gets dbBuiltAt.
  it('is null, not an error, when the database is absent or has no stamp', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fresh-'));
    try {
      expect(readDbBuiltAt(path.join(dir, 'absent.db'))).toBeNull();
      fs.writeFileSync(path.join(dir, 'vocabulary.db'), 'not a database');
      expect(readDbBuiltAt(path.join(dir, 'vocabulary.db'))).toBeNull();
      expect(buildAssetManifest(dir).dbBuiltAt).toBeNull();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
