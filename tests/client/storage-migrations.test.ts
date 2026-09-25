// @vitest-environment jsdom
/**
 * storage-migrations.test.ts — Phase 2 of the storage-migration plan.
 *
 * Four layers, from mechanics to real data:
 *   1. the runner: order, resuming, failure, and what a crash leaves behind;
 *   2. each step, on the awkward inputs real browsers actually contain;
 *   3. DIFFERENTIAL: the old lazy migrations (still in the app) and the new steps
 *      are run over the same legacy data — hand-built and fuzzed — and must leave
 *      identical storage and identical readings. This is what proves the new
 *      framework replaces the old behaviour rather than approximating it;
 *   4. real data: migrating today's golden dump changes nothing, and a restore of
 *      an old backup ends up migrated.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  MIGRATIONS, CURRENT_SCHEMA, SCHEMA_KEY, runMigrations, readSchemaVersion,
  type Migration, type MigrationStore,
} from '../../src/client/utils/storage-migrations.ts';
import { installStorageStub, dumpStorage, loadStorage, type Store } from '../helpers/storage-fixture.ts';
import { ROOT } from '../helpers/storage-scan.ts';

// ── a plain-map store for testing the runner without localStorage ────────────────
function mapStore(initial: Record<string, string> = {}, opts: { failWrites?: (key: string) => boolean } = {}): MigrationStore & { map: Map<string, string> } {
  const map = new Map(Object.entries(initial));
  return {
    map,
    get: k => map.get(k) ?? null,
    set: (k, v) => { if (opts.failWrites?.(k)) return false; map.set(k, v); return true; },
    remove: k => { map.delete(k); },
    keys: () => [...map.keys()],
  };
}
const dump = (s: { map: Map<string, string> }): Record<string, string> =>
  Object.fromEntries([...s.map.entries()].sort(([a], [b]) => a < b ? -1 : 1));
const J = JSON.stringify;

// ═══ 1. the runner ══════════════════════════════════════════════════════════════
describe('the runner', () => {
  it('has well-formed steps: ids 1..N in order, unique names', () => {
    expect(MIGRATIONS.map(m => m.id)).toEqual(MIGRATIONS.map((_, i) => i + 1));
    expect(new Set(MIGRATIONS.map(m => m.name)).size).toBe(MIGRATIONS.length);
    expect(CURRENT_SCHEMA).toBe(MIGRATIONS.length);
  });

  it('on a fresh browser runs everything, stamps the version, and writes nothing else', () => {
    const s = mapStore();
    const r = runMigrations(s);
    expect(r).toMatchObject({ from: 0, to: CURRENT_SCHEMA });
    expect(r.ran).toHaveLength(MIGRATIONS.length);
    expect(r.ran.every(x => x.changed === 0)).toBe(true);
    expect(dump(s)).toEqual({ [SCHEMA_KEY]: String(CURRENT_SCHEMA) });
  });

  it('does nothing the second time', () => {
    const s = mapStore({ vq_mastery_spanish_Known: J(['a']) });
    runMigrations(s);
    const after = dump(s);
    const r = runMigrations(s);
    expect(r.ran).toEqual([]);
    expect(dump(s)).toEqual(after);
  });

  it('resumes from the stored version, running only later steps', () => {
    const s = mapStore({ [SCHEMA_KEY]: '3', vq_known_spanish: J(['x']), s_kid_friendly_mode: 'false' });
    const r = runMigrations(s);
    expect(r.ran.map(x => x.id)).toEqual([4, 5, 6]);
    // Step 2 (known -> lists) was already "done" by the marker's account, so its input is left alone.
    expect(s.map.has('vq_known_spanish')).toBe(true);
    expect(s.map.get('s_simple_mode')).toBe('false');
  });

  it('leaves data written by a newer app completely alone', () => {
    const s = mapStore({ [SCHEMA_KEY]: String(CURRENT_SCHEMA + 5), vq_known_spanish: J(['x']) });
    const before = dump(s);
    const r = runMigrations(s);
    expect(r).toMatchObject({ newerThanApp: true, ran: [] });
    expect(dump(s)).toEqual(before);
  });

  it.each(['', 'abc', '-1', '2.5', '0', ' ', 'NaN'])('reads a malformed version %j as the original layout', raw => {
    expect(readSchemaVersion(mapStore({ [SCHEMA_KEY]: raw }))).toBe(0);
  });

  it('stops at a failing step, keeps the version where it was, and resumes there next time', () => {
    const log: string[] = [];
    let explode = true;
    const steps: Migration[] = [
      { id: 1, name: 'a', up: () => { log.push('a'); return { changed: 1 }; } },
      { id: 2, name: 'b', up: () => { log.push('b'); if (explode) throw new Error('disk on fire'); return { changed: 1 }; } },
      { id: 3, name: 'c', up: () => { log.push('c'); return { changed: 1 }; } },
    ];
    const s = mapStore();
    const r1 = runMigrations(s, steps);
    expect(r1.failed).toEqual({ id: 2, name: 'b', error: 'disk on fire' });
    expect(r1.to).toBe(1);
    expect(s.map.get(SCHEMA_KEY)).toBe('1');
    expect(log).toEqual(['a', 'b']);            // c was never attempted

    explode = false; log.length = 0;
    const r2 = runMigrations(s, steps);
    expect(log).toEqual(['b', 'c']);            // a is not repeated
    expect(r2.to).toBe(3);
    expect(r2.failed).toBeUndefined();
  });

  it('a write that does not stick fails the step and leaves the OLD data intact (new is written before old is removed)', () => {
    const legacy = { vq_mastery_spanish_Known: J(['a', 'b']), vq_mastery_spanish_Travel: J(['c']) };
    const s = mapStore(legacy, { failWrites: k => k === 'vq_mastery_spanish' });   // quota on the target key
    const r = runMigrations(s);
    expect(r.failed?.id).toBe(1);
    expect(r.failed?.error).toMatch(/could not write vq_mastery_spanish/);
    expect(dump(s)).toEqual(legacy);            // nothing lost, nothing half-done
    expect(r.to).toBe(0);
  });

  it('an unwritable version marker just means the steps run again — harmlessly', () => {
    const s = mapStore({ vq_mastery_spanish_Known: J(['a']) }, { failWrites: k => k === SCHEMA_KEY });
    runMigrations(s);
    const afterFirst = dump(s);
    expect(s.map.has(SCHEMA_KEY)).toBe(false);
    runMigrations(s);
    expect(dump(s)).toEqual(afterFirst);
  });

  it('every step is idempotent on rich legacy data', () => {
    const s = mapStore(LEGACY_RICH);
    runMigrations(s);
    const once = dump(s);
    for (const step of MIGRATIONS) step.up(s);        // again, directly, bypassing the marker
    expect(dump(s)).toEqual(once);
  });
});

// ═══ 2. each step ═══════════════════════════════════════════════════════════════
const LEGACY_RICH: Record<string, string> = {
  vq_mastery_spanish_Known: J(['a', 'b']), vq_mastery_spanish_Travel: J(['b', 'c']), vq_mastery_spanish: J(['z']),
  vq_mastery_french_Known: J(['d']),
  vq_known_german: J(['w1', 'w2']),
  vq_listfilter_spanish: J({ mode: 'focus', selected: ['Travel'] }),
  uc_glossorder_spanish: J({ casa: ['house', 'home'] }),
  s_kid_friendly_mode: 'false', s_conj_keep_shape: 'false',
};

const step = (id: number): Migration => MIGRATIONS.find(m => m.id === id) as Migration;
const run = (id: number, initial: Record<string, string>): Record<string, string> => {
  const s = mapStore(initial); step(id).up(s); return dump(s);
};

describe('step 1 — mastery: per-list keys into one set per language', () => {
  it('unions the per-list sets into the language set (existing first), then removes them', () => {
    expect(run(1, LEGACY_RICH)).toMatchObject({ vq_mastery_spanish: J(['z', 'a', 'b', 'c']), vq_mastery_french: J(['d']) });
    const out = run(1, LEGACY_RICH);
    expect(Object.keys(out).filter(k => /^vq_mastery_(spanish|french)_/.test(k))).toEqual([]);
  });

  it('never mistakes the current dates/scale keys for legacy per-list keys', () => {
    const current = { vq_mastery_dates_spanish: J({ a: 1 }), vq_mastery_scale_spanish: J({ a: 2 }), vq_mastery_spanish: J(['a']) };
    expect(run(1, current)).toEqual(current);
  });

  it('treats a corrupt or non-array legacy value as empty but still removes it', () => {
    const out = run(1, { vq_mastery_spanish_A: '{{{', vq_mastery_spanish_B: J({ not: 'array' }), vq_mastery_spanish_C: J([1, 2]), vq_mastery_spanish_D: J(['ok']) });
    expect(out).toEqual({ vq_mastery_spanish: J(['ok']) });
  });

  it('ignores a "language" that is not one of ours', () => {
    const odd = { vq_mastery_klingon_Known: J(['a']) };
    expect(run(1, odd)).toEqual(odd);
  });
});

describe('step 2 — lists: "known words" becomes the list "Known"', () => {
  it('converts when the language has no lists yet', () => {
    expect(run(2, { vq_known_german: J(['a', 'b']) })).toEqual({ vq_lists_german: J({ Known: ['a', 'b'] }) });
  });
  it('an empty set creates no list but the old key still goes', () => {
    expect(run(2, { vq_known_german: J([]) })).toEqual({});
  });
  it('leaves everything alone when the language already has lists', () => {
    const both = { vq_known_german: J(['a']), vq_lists_german: J({ Mine: ['x'] }) };
    expect(run(2, both)).toEqual(both);
  });
  it('a corrupt old set reads as empty', () => {
    expect(run(2, { vq_known_german: 'nope' })).toEqual({});
  });
});

describe('step 3 — list filter into the shared bucket', () => {
  const bucket = (o: object): Record<string, string> => ({ vq_listfilter_spanish__shared: J(o) });
  it('keeps hide and focus', () => {
    expect(run(3, { vq_listfilter_spanish: J({ mode: 'focus', selected: ['A'] }) })).toEqual(bucket({ active: true, mode: 'focus', selected: ['A'] }));
    expect(run(3, { vq_listfilter_spanish: J({ mode: 'hide', selected: [] }) })).toEqual(bucket({ active: true, mode: 'hide', selected: [] }));
  });
  it("'off' becomes inactive, keeping the selection", () => {
    expect(run(3, { vq_listfilter_spanish: J({ mode: 'off', selected: ['A'] }) })).toEqual(bucket({ active: false, mode: 'hide', selected: ['A'] }));
  });
  it('an unknown mode or missing selection gets the defaults', () => {
    expect(run(3, { vq_listfilter_spanish: J({ mode: 'sideways' }) })).toEqual(bucket({ active: true, mode: 'hide', selected: [] }));
    expect(run(3, { vq_listfilter_spanish: J({ selected: 'oops' }) })).toEqual(bucket({ active: true, mode: 'hide', selected: [] }));
  });
  it('an existing shared bucket wins, and the legacy key is still removed', () => {
    const shared = { vq_listfilter_spanish__shared: J({ active: true, mode: 'focus', selected: ['Mine'] }) };
    expect(run(3, { ...shared, vq_listfilter_spanish: J({ mode: 'hide', selected: [] }) })).toEqual(shared);
  });
  it('a corrupt or non-object legacy value is dropped without creating a bucket', () => {
    expect(run(3, { vq_listfilter_spanish: '{{' })).toEqual({});
    expect(run(3, { vq_listfilter_spanish: J([1, 2]) })).toEqual({});
  });
  it('never touches the per-bucket keys that share the prefix', () => {
    const buckets = { vq_listfilter_spanish__table: J({ active: true, mode: 'hide', selected: [] }) };
    expect(run(3, buckets)).toEqual(buckets);
  });
});

describe('step 4 — My Content: first-cut gloss order into word overrides', () => {
  it('creates the override and removes the legacy key', () => {
    expect(run(4, { uc_glossorder_spanish: J({ casa: ['a', 'b'] }) })).toEqual({ uc_wordoverride_spanish: J({ casa: { glossOrder: ['a', 'b'] } }) });
  });
  it('merges into an existing override without disturbing its other fields', () => {
    const out = run(4, { uc_glossorder_spanish: J({ casa: ['a'] }), uc_wordoverride_spanish: J({ casa: { notes: 'mine', updatedAt: 5 }, perro: { notes: 'x' } }) });
    expect(JSON.parse(out.uc_wordoverride_spanish)).toEqual({ casa: { notes: 'mine', updatedAt: 5, glossOrder: ['a'] }, perro: { notes: 'x' } });
  });
  it('an empty or corrupt legacy value is just removed', () => {
    expect(run(4, { uc_glossorder_spanish: J({}) })).toEqual({});
    expect(run(4, { uc_glossorder_spanish: 'bad' })).toEqual({});
    expect(run(4, { uc_glossorder_spanish: J({ casa: 'not-an-array' }) })).toEqual({});
  });
});

describe('steps 5 and 6 — settings renamed long ago', () => {
  it('Simple Mode: adopts the old value only when the new key is absent, and keeps the old key', () => {
    expect(run(5, { s_kid_friendly_mode: 'false' })).toEqual({ s_kid_friendly_mode: 'false', s_simple_mode: 'false' });
    expect(run(5, { s_kid_friendly_mode: 'true' })).toEqual({ s_kid_friendly_mode: 'true', s_simple_mode: 'true' });
    const explicit = { s_kid_friendly_mode: 'false', s_simple_mode: 'true' };
    expect(run(5, explicit)).toEqual(explicit);
    expect(run(5, {})).toEqual({});
  });
  it("Conjugation: the old boolean maps 'false' -> close, anything else -> grey; a valid new value wins", () => {
    expect(run(6, { s_conj_keep_shape: 'false' })).toMatchObject({ s_conj_deselected: 'close' });
    expect(run(6, { s_conj_keep_shape: 'true' })).toMatchObject({ s_conj_deselected: 'grey' });
    expect(run(6, { s_conj_keep_shape: 'junk' })).toMatchObject({ s_conj_deselected: 'grey' });
    expect(run(6, { s_conj_keep_shape: 'false', s_conj_deselected: 'answer' })).toMatchObject({ s_conj_deselected: 'answer' });
    expect(run(6, { s_conj_keep_shape: 'false', s_conj_deselected: 'bogus' })).toMatchObject({ s_conj_deselected: 'close' });
    expect(run(6, { s_conj_deselected: 'blank' })).toEqual({ s_conj_deselected: 'blank' });
  });
});

// ═══ 3. differential: the old lazy code vs the new steps ════════════════════════
type Rng = () => number;
const rngFrom = (seed: number): Rng => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const pick = <T>(r: Rng, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
const words = (r: Rng): string[] => Array.from({ length: Math.floor(r() * 4) }, () => pick(r, ['casa', 'perro', 'gato', 'de', 'que', 'mesa', 'sol']));

/** A random browser: for each language, a random mix of legacy, current, decoy and corrupt keys. */
function randomLegacyStore(r: Rng): Record<string, string> {
  const out: Record<string, string> = {};
  const junk = (): string => pick(r, ['{{{', 'null', '"str"', '42', J({ a: 1 }), J([1, 2])]);
  for (const lang of ['spanish', 'french', 'german']) {
    if (r() < 0.6) for (const list of ['Known', 'Travel'].filter(() => r() < 0.7))
      out[`vq_mastery_${lang}_${list}`] = r() < 0.15 ? junk() : J(words(r));
    if (r() < 0.4) out[`vq_mastery_${lang}`] = r() < 0.1 ? junk() : J(words(r));
    if (r() < 0.3) { out[`vq_mastery_dates_${lang}`] = J({ casa: 1 }); out[`vq_mastery_scale_${lang}`] = J({ casa: 2 }); }

    if (r() < 0.5) out[`vq_known_${lang}`] = r() < 0.15 ? junk() : J(words(r));
    if (r() < 0.3) out[`vq_lists_${lang}`] = J({ Mine: words(r) });

    if (r() < 0.5) out[`vq_listfilter_${lang}`] = r() < 0.2 ? junk()
      : J({ mode: pick(r, ['hide', 'focus', 'off', 'weird', undefined]), selected: pick(r, [words(r), 'oops', undefined]) });
    if (r() < 0.25) out[`vq_listfilter_${lang}__shared`] = J({ active: true, mode: 'focus', selected: ['Mine'] });

    if (r() < 0.5) out[`uc_glossorder_${lang}`] = r() < 0.2 ? junk()
      : J(Object.fromEntries(words(r).map(w => [w, words(r)])));
    if (r() < 0.3) out[`uc_wordoverride_${lang}`] = r() < 0.1 ? junk() : J({ casa: { notes: 'n', updatedAt: 1 }, perro: { hiddenGlosses: ['x'] } });
  }
  if (r() < 0.6) out['s_kid_friendly_mode'] = pick(r, ['true', 'false', 'weird']);
  if (r() < 0.3) out['s_simple_mode'] = pick(r, ['true', 'false']);
  if (r() < 0.6) out['s_conj_keep_shape'] = pick(r, ['true', 'false', 'weird']);
  if (r() < 0.3) out['s_conj_deselected'] = pick(r, ['close', 'blank', 'grey', 'answer', 'bogus']);
  return out;
}

/** Everything the app reads back out of the migrated-or-not data. */
async function readings(): Promise<Record<string, unknown>> {
  const mastery = await import('../../src/client/modes/my-lists/mastery.ts');
  const lists   = await import('../../src/client/utils/word-lists.ts');
  const content = await import('../../src/client/data/user-content.ts');
  const { Settings } = await import('../../src/client/settings.ts');
  const out: Record<string, unknown> = {};
  for (const lang of ['spanish', 'french', 'german']) {
    out[lang] = {
      mastered: [...mastery.getMastered(lang)].sort(),
      lists: Object.fromEntries(lists.getListNames(lang).map(n => [n, [...lists.getList(lang, n)].sort()])),
      filter: lists.getListFilterState(lang, 'table'),
      overrides: content.getWordOverrides(lang),
    };
  }
  out['simpleMode'] = Settings.getSimpleMode();
  out['conjDeselected'] = Settings.getConjDeselected();
  return out;
}

/** What the OLD code does: touch each thing lazily, the way the app's readers do. */
async function lazily(store: Store): Promise<{ raw: Record<string, string>; read: Record<string, unknown> }> {
  vi.resetModules();                                   // the old code guards itself with per-page-load flags
  const mastery = await import('../../src/client/modes/my-lists/mastery.ts');
  for (const lang of ['spanish', 'french', 'german']) mastery.migrateMastery(lang);
  const read = await readings();                       // reading triggers the lists/filter/gloss migrations
  return { raw: dumpStorage(store), read };
}

/**
 * The settings keys steps 5/6 write, and the marker. The old code never wrote them — it only
 * *read* the legacy names as a fallback — so their raw bytes legitimately differ (e.g. a bogus
 * s_conj_deselected next to a legacy s_conj_keep_shape reads as "close" either way, but the step
 * also stores "close"). What must match is what the app *reads*, which `readings()` compares.
 */
const STEP_ONLY_KEYS = ['s_simple_mode', 's_conj_deselected', SCHEMA_KEY];
const withoutStepOnly = (d: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(d).filter(([k]) => !STEP_ONLY_KEYS.includes(k)));

describe('differential — the new steps reproduce the old lazy migrations exactly', () => {
  async function compare(legacy: Record<string, string>): Promise<void> {
    // A: old behaviour
    let store = installStorageStub(); loadStorage(store, legacy);
    const a = await lazily(store);

    // B: new steps first, then the same readers (which should now find nothing left to migrate)
    store = installStorageStub(); loadStorage(store, legacy);
    const report = runMigrations();
    expect(report.failed).toBeUndefined();
    vi.resetModules();
    const b = { raw: dumpStorage(store), read: await readings() };

    expect(withoutStepOnly(b.raw)).toEqual(withoutStepOnly(a.raw));
    expect(b.read).toEqual(a.read);
  }

  it('on a hand-built browser with every kind of legacy data', async () => {
    await compare({ ...LEGACY_RICH });
  });

  it('the old lazy path really migrates the hand-built browser (so "old equals new" is not "both did nothing")', async () => {
    const store = installStorageStub(); loadStorage(store, { ...LEGACY_RICH });
    const { raw } = await lazily(store);
    for (const gone of ['vq_mastery_spanish_Known', 'vq_mastery_spanish_Travel', 'vq_mastery_french_Known', 'vq_known_german',
      'vq_listfilter_spanish', 'uc_glossorder_spanish']) expect(raw[gone], gone).toBeUndefined();
    expect(JSON.parse(raw['vq_mastery_spanish'])).toEqual(['z', 'a', 'b', 'c']);
    expect(JSON.parse(raw['vq_lists_german'])).toEqual({ Known: ['w1', 'w2'] });
    expect(JSON.parse(raw['vq_listfilter_spanish__shared'])).toMatchObject({ mode: 'focus' });
    expect(JSON.parse(raw['uc_wordoverride_spanish'])).toEqual({ casa: { glossOrder: ['house', 'home'] } });
  });

  it('on a browser with nothing legacy at all', async () => {
    await compare({ vq_lists_spanish: J({ Mine: ['casa'] }), vq_mastery_spanish: J(['casa']) });
  });

  it('on an empty browser', async () => {
    await compare({});
  });

  it('on 60 random browsers full of legacy, current, decoy and corrupt keys', async () => {
    const r = rngFrom(20260304);
    for (let i = 0; i < 60; i++) {
      const legacy = randomLegacyStore(r);
      try { await compare(legacy); } catch (e) { throw new Error(`random browser #${i} diverged: ${J(legacy)}\n${(e as Error).message}`); }
    }
  }, 120_000);
});

// ═══ 4. real data ═══════════════════════════════════════════════════════════════
describe('real data', () => {
  const golden = JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/storage/current.raw.json'), 'utf8')) as { data: Record<string, string> };
  let store: Store;
  beforeEach(() => { store = installStorageStub(); });

  it("migrating today's golden dump (from a browser that predates the marker) changes nothing but the marker", () => {
    const { [SCHEMA_KEY]: marker, ...withoutMarker } = golden.data;
    loadStorage(store, withoutMarker);
    const r = runMigrations();
    expect(r.failed).toBeUndefined();
    expect(r.ran.every(x => x.changed === 0)).toBe(true);             // every step found nothing to do
    expect(dumpStorage(store)).toEqual(golden.data);
    expect(marker).toBe(String(CURRENT_SCHEMA));
  });

  it('migrating an already-current dump is a no-op', () => {
    loadStorage(store, golden.data);
    const r = runMigrations();
    expect(r.ran).toEqual([]);
    expect(dumpStorage(store)).toEqual(golden.data);
  });
});

describe('backup and restore', () => {
  let store: Store;
  beforeEach(() => { store = installStorageStub(); });

  it('a backup records the current layout and never contains the version marker', async () => {
    const { buildFullBackup } = await import('../../src/client/utils/full-backup.ts');
    loadStorage(store, { [SCHEMA_KEY]: String(CURRENT_SCHEMA), vq_srs_spanish: J({}) });
    const b = buildFullBackup();
    expect(b.schema).toBe(CURRENT_SCHEMA);
    expect(Object.keys(b.data)).toEqual(['vq_srs_spanish']);
  });

  it('restoring an old backup (no schema field) puts the version back to 0 and the next start migrates it', async () => {
    const { applyFullBackup } = await import('../../src/client/utils/full-backup.ts');
    loadStorage(store, { [SCHEMA_KEY]: String(CURRENT_SCHEMA) });            // a fully migrated browser...
    const oldBackup = J({ format: 'vocabapp-full-backup', version: 1, data: { vq_known_spanish: J(['casa']), vq_mastery_spanish_Known: J(['perro']) } });
    applyFullBackup(oldBackup);                                              // ...restores pre-migration data
    expect(store.get(SCHEMA_KEY)).toBe('0');
    runMigrations();                                                         // (the reload's startup)
    expect(store.get('vq_lists_spanish')).toBe(J({ Known: ['casa'] }));
    expect(store.get('vq_mastery_spanish')).toBe(J(['perro']));
    expect(store.has('vq_known_spanish')).toBe(false);
  });

  it('restoring a backup taken at a given layout sets the version to that layout', async () => {
    const { applyFullBackup } = await import('../../src/client/utils/full-backup.ts');
    applyFullBackup(J({ format: 'vocabapp-full-backup', version: 1, schema: 3, data: { vq_srs_spanish: J({}) } }));
    expect(store.get(SCHEMA_KEY)).toBe('3');
  });

  it('refuses a backup from a newer layout, before writing anything', async () => {
    const { applyFullBackup } = await import('../../src/client/utils/full-backup.ts');
    loadStorage(store, { vq_srs_spanish: J({ keep: 1 }) });
    expect(() => applyFullBackup(J({ format: 'vocabapp-full-backup', version: 1, schema: CURRENT_SCHEMA + 1, data: { vq_srs_spanish: J({}) } })))
      .toThrow(/newer version/);
    expect(store.get('vq_srs_spanish')).toBe(J({ keep: 1 }));
  });
});
