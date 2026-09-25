// @vitest-environment jsdom
/**
 * storage-golden.test.ts — Phase 0 safety net for the storage migration.
 *
 * Pins down, before anything is migrated:
 *   - what the app actually writes to localStorage today (a golden dump);
 *   - what the app *sees* when it reads that dump (a golden semantic snapshot);
 *   - which key families the fixture covers, and — via a scan of the source —
 *     that no key family exists that we haven't consciously accounted for.
 *
 * Regenerate the goldens after an intentional change with:
 *   UPDATE_STORAGE_GOLDEN=1 npx vitest run tests/client/storage-golden.test.ts
 * and review the diff: an unexpected change to the raw dump is a change to what
 * the app writes, which is exactly what a migration has to know about.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { familiesInSource, ROOT } from '../helpers/storage-scan.ts';
import { keyClass } from '../../src/client/utils/storage-keys.ts';
import {
  installStorageStub, dumpStorage, loadStorage, deterministically,
  seedRealisticStorage, readSemanticState, type Store,
} from '../helpers/storage-fixture.ts';

const RAW_GOLDEN = join(ROOT, 'tests/fixtures/storage/current.raw.json');
const SEMANTIC_GOLDEN = join(ROOT, 'tests/fixtures/storage/current.semantic.json');
const UPDATE = process.env['UPDATE_STORAGE_GOLDEN'] === '1';

let store: Store;
beforeEach(() => { store = installStorageStub(); });

interface RawGolden {
  note: string;
  /** The frozen clock at the end of seeding — reads must happen at this instant. */
  endedAt: number;
  origins: Record<string, 'api' | 'raw'>;
  data: Record<string, string>;
}

const rawKeys = (g: RawGolden): string[] => Object.keys(g.origins).filter(k => g.origins[k] === 'raw');
const readJson = <T>(p: string): T => JSON.parse(readFileSync(p, 'utf8')) as T;
const writeGolden = (p: string, v: unknown): void => {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(v, null, 2) + '\n');
};

/** Seed a fresh store and return everything worth comparing. */
async function seedFresh(): Promise<{ raw: RawGolden; semantic: Record<string, unknown> }> {
  return deterministically(async () => {
    const { origins, endedAt } = await seedRealisticStorage(store);
    return {
      raw: {
        endedAt,
        note: 'Produced by tests/helpers/storage-fixture.ts through the app\'s own writers (origin "api") '
            + 'plus raw seeds for DOM-driven keys (origin "raw"). Do not edit by hand.',
        origins: Object.fromEntries(Object.entries(origins).sort(([a], [b]) => a < b ? -1 : 1)),
        data: dumpStorage(store),
      },
      semantic: await readSemanticState(Object.keys(origins).filter(k => origins[k] === 'raw')),
    };
  });
}

if (UPDATE) {
  describe('regenerate goldens', () => {
    it('writes the raw and semantic goldens', async () => {
      const { raw, semantic } = await seedFresh();
      writeGolden(RAW_GOLDEN, raw);
      writeGolden(SEMANTIC_GOLDEN, semantic);
      expect(Object.keys(raw.data).length).toBeGreaterThan(50);
    });
  });
}

describe('the fixture', () => {
  it('is reproducible: seeding twice gives byte-identical storage', async () => {
    const a = await seedFresh();
    store = installStorageStub();
    const b = await seedFresh();
    expect(b.raw.data).toEqual(a.raw.data);
    expect(b.semantic).toEqual(a.semantic);
  });

  it('matches the checked-in raw golden — i.e. the app still writes what it wrote', async () => {
    const golden = readJson<RawGolden>(RAW_GOLDEN);
    const { raw } = await seedFresh();
    expect(raw.data).toEqual(golden.data);
    expect(raw.origins).toEqual(golden.origins);
  });

  it('is rich enough to mean something (guards against a vacuous snapshot)', async () => {
    const { raw, semantic } = await seedFresh();
    expect(Object.keys(raw.data).length).toBeGreaterThan(150);
    const es = (semantic['perLang'] as Record<string, Record<string, unknown>>)['spanish'];
    expect(Object.keys(es['lists'] as object)).toEqual(['Known', 'Travel']);
    expect((es['mastered'] as string[]).length).toBeGreaterThan(0);
    expect(Object.keys(es['srs'] as object).length).toBeGreaterThan(0);
    expect((es['sessions'] as unknown[]).length).toBe(2);
    expect((es['userWords'] as unknown[]).length).toBe(1);
    expect(Object.keys(es['pictureOverrides'] as object)).toEqual(['gato', 'perro']);
    expect((semantic['streak'] as { current: number }).current).toBe(3);   // three consecutive active days
    expect(Object.keys(semantic['settings'] as object).length).toBeGreaterThan(50);
    expect(semantic['resume']).not.toBeNull();
  });
});

describe('semantic equivalence — what the app sees', () => {
  it('reading the golden dump gives the golden semantic snapshot', async () => {
    const golden = readJson<RawGolden>(RAW_GOLDEN);
    const expected = readJson<Record<string, unknown>>(SEMANTIC_GOLDEN);
    loadStorage(store, golden.data);
    const seen = await deterministically(() => readSemanticState(rawKeys(golden)), golden.endedAt);
    expect(seen).toEqual(expected);
  });

  it('the snapshot read from a fresh seed equals the one read from the golden dump', async () => {
    const golden = readJson<RawGolden>(RAW_GOLDEN);
    const fresh = await seedFresh();

    store = installStorageStub();
    loadStorage(store, golden.data);
    const fromGolden = await deterministically(() => readSemanticState(rawKeys(golden)), golden.endedAt);
    expect(fromGolden).toEqual(fresh.semantic);
  });

  it('a value the app cannot read would show up: dropping a key changes the snapshot', async () => {
    const golden = readJson<RawGolden>(RAW_GOLDEN);
    const expected = readJson<Record<string, unknown>>(SEMANTIC_GOLDEN);
    loadStorage(store, golden.data);
    store.delete('vq_srs_spanish');   // simulate a migration that lost a key
    const seen = await deterministically(() => readSemanticState(rawKeys(golden)), golden.endedAt);
    expect(seen).not.toEqual(expected);
  });
});

// ── coverage: every key family in the source is accounted for ────────────────

/** Families the fixture cannot produce, each with the reason. A new entry is a decision. */
const KNOWN_UNCOVERED: Record<string, string> = {
  vq_known_: 'LEGACY. The pre-lists "known words" set; word-lists.ts migrates it into a list named "Known" and deletes '
    + 'it on first read, so seeding it would change the lists. Phase 2 folds that migration into the framework and tests it there.',
  s_kid_friendly_mode: 'LEGACY name of s_simple_mode, read as a fallback only while the new key is absent '
    + '(settings.ts getSimpleMode). Seeding it beside the new key would test nothing; Phase 2 covers it with a legacy-only fixture.',
  s_conj_keep_shape: 'LEGACY name of s_conj_deselected, read as a fallback only while the new key is absent. Same treatment.',
  uc_glossorder_: 'LEGACY. The first cut of gloss ordering; user-content.ts migrates it into word overrides on read. '
    + 'Same treatment as vq_known_.',
};

/** A dump key belongs to a family when it equals it or extends a trailing-underscore prefix. */
function belongs(key: string, family: string): boolean {
  return key === family || (family.endsWith('_') && key.startsWith(family));
}

describe('key-family coverage', () => {
  it('every family named in the source is covered by the fixture or consciously listed', () => {
    const golden = readJson<RawGolden>(RAW_GOLDEN);
    const keys = Object.keys(golden.data);
    const uncovered = [...familiesInSource()].filter(f => !keys.some(k => belongs(k, f))).sort();
    const unexplained = uncovered.filter(f => !(f in KNOWN_UNCOVERED));
    expect(unexplained, `Key families with no fixture coverage and no reason on record — seed them in `
      + `tests/helpers/storage-fixture.ts, or add them to KNOWN_UNCOVERED with why:\n${unexplained.join('\n')}`).toEqual([]);
  });

  it('KNOWN_UNCOVERED has no stale entries', () => {
    const golden = readJson<RawGolden>(RAW_GOLDEN);
    const keys = Object.keys(golden.data);
    const stale = Object.keys(KNOWN_UNCOVERED).filter(f => keys.some(k => belongs(k, f)));
    expect(stale).toEqual([]);
  });

  it('every key is labelled, and everything irreplaceable came from the app\'s own writers', () => {
    const golden = readJson<RawGolden>(RAW_GOLDEN);
    expect(Object.keys(golden.origins).sort()).toEqual(Object.keys(golden.data).sort());
    expect(existsSync(SEMANTIC_GOLDEN)).toBe(true);

    // Settings and per-screen UI state are legitimately raw seeds (their writers are
    // DOM handlers). Data the learner could not get back if it were lost must not be:
    // a hand-typed value there would prove nothing about what the app writes.
    // "Data" is decided by the registry (utils/storage-keys.ts), not by a prefix guess.
    const data = Object.keys(golden.data).filter(k => keyClass(k) === 'data');
    expect(data.filter(k => golden.origins[k] !== 'api')).toEqual([]);
    // ...and there must be some of them, or the check above is vacuous.
    expect(data.length).toBeGreaterThan(20);
  });
});
