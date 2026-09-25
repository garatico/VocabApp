/**
 * storage-migrations.ts — versioned, ordered, idempotent upgrades of what is in
 * localStorage. (Phase 2 of the storage-migration plan.)
 *
 * Before this, "upgrading" old data meant a handful of private functions, each
 * run lazily the first time something happened to read the affected key, each
 * guarded by its own per-page-load flag, with no record anywhere of which layout
 * a browser's data was actually in. That is fine until the next change, which
 * has to guess.
 *
 * Now there is a schema version (`vq_schema_version`: the id of the last step
 * that completed) and a list of steps. On startup every step newer than the
 * stored version runs, in order, and the version advances one step at a time.
 *
 * Rules a step must follow — they are what make this safe on people's real data:
 *
 *  - **Self-contained.** A step means "layout N → N+1" for ever, so it reads and
 *    writes raw keys and imports nothing that evolves (not the list, mastery or
 *    settings modules). Its meaning must not change when those modules do.
 *  - **Idempotent.** Running it twice, or over data that is already migrated,
 *    changes nothing. That is what makes a crash, a second tab and a restored old
 *    backup all harmless.
 *  - **Write the new value before removing the old one.** An interruption then
 *    leaves data that is still readable, and the step simply runs again.
 *  - **Fail loudly, not partially.** A write that does not stick throws; the runner
 *    stops, leaves the version where it was, and tries again next start.
 *
 * The older lazy migrations (migrateMastery, the "known words" and list-filter
 * conversions in word-lists.ts, the gloss-order fold in user-content.ts, and the
 * two settings fallbacks) are still in their owner modules. They are now
 * redundant — these steps have already done their work by the time anything
 * reads — and are kept only as belt and braces; tests/client/storage-migrations.test.ts
 * proves the two agree on hand-built and fuzzed legacy data. Removing them, and the
 * legacy keys they and steps 5-6 leave behind, is a later, deliberate step. One
 * consequence: they act on legacy-named keys even when the stored version is
 * *newer* than this app knows; the runner itself touches nothing in that case.
 *
 * The version is deliberately not part of a full backup (it is `bookkeeping`
 * in storage-keys.ts). A backup records the schema it was taken at instead, and a
 * restore sets the version back to that, so the steps run over the restored data.
 */

import { readString, writeString, remove, keys } from './storage.ts';

/** The id of the last step that completed; absent means the original, unversioned layout. */
export const SCHEMA_KEY = 'vq_schema_version';

/** The raw operations a step is allowed. Not `localStorage`, so tests can run steps on a plain map. */
export interface MigrationStore {
  get(key: string): string | null;
  /** False when the write did not stick (quota, storage disabled). */
  set(key: string, value: string): boolean;
  remove(key: string): void;
  keys(): string[];
}

export interface StepResult {
  /** Keys created, rewritten or removed. Zero means the data was already in the new layout. */
  changed: number;
}

export interface Migration {
  /** 1, 2, 3 … with no gaps. Never reused, never reordered, never edited once shipped. */
  id:   number;
  name: string;
  up(store: MigrationStore): StepResult;
}

export interface MigrationReport {
  /** The stored version when this run started. */
  from:    number;
  /** The stored version now. */
  to:      number;
  ran:     { id: number; name: string; changed: number }[];
  /** The step that threw, if one did; later steps were not attempted. */
  failed?: { id: number; name: string; error: string };
  /** The stored version is newer than this app knows: nothing was touched. */
  newerThanApp?: boolean;
}

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * The languages that had per-language storage when the layouts below were current.
 * Frozen on purpose: a legacy key can only exist for a language that existed then,
 * and (see step 1) a captured "language" must be checked against a real name —
 * `vq_mastery_dates_<lang>` matches the legacy pattern too.
 */
const LEGACY_LANGUAGES = ['spanish', 'portuguese', 'italian', 'french', 'german', 'dutch', 'chinese', 'japanese'] as const;

function parseJson(raw: string | null): unknown {
  if (raw === null) return undefined;
  try { return JSON.parse(raw); } catch { return undefined; }
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** A JSON array of strings, or `[]` for anything else — a corrupt value reads as empty. */
function stringArray(raw: string | null): string[] {
  const v = parseJson(raw);
  return Array.isArray(v) && v.every(x => typeof x === 'string') ? v as string[] : [];
}

/** A write that must stick: a false return aborts the step rather than losing data quietly. */
function put(store: MigrationStore, key: string, value: string): void {
  if (!store.set(key, value)) throw new Error(`could not write ${key}`);
}

const ownGet = <T>(o: Record<string, T>, k: string): T | undefined =>
  Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined;

// ── the steps ────────────────────────────────────────────────────────────────

export const MIGRATIONS: readonly Migration[] = [
  {
    id: 1,
    name: 'mastery: per-list keys into one set per language',
    // Mastery used to be stored per (language, list) as vq_mastery_<lang>_<list>. It is now one
    // set per language, vq_mastery_<lang>. Union the old sets in, then drop the old keys.
    up(store) {
      let changed = 0;
      for (const lang of LEGACY_LANGUAGES) {
        const legacy = store.keys().filter(k => {
          const m = /^vq_mastery_([a-z]+)_(.+)$/.exec(k);
          return m !== null && m[1] === lang;
        });
        if (legacy.length === 0) continue;
        const target = `vq_mastery_${lang}`;
        const merged = new Set(stringArray(store.get(target)));
        for (const k of legacy) stringArray(store.get(k)).forEach(w => merged.add(w));
        put(store, target, JSON.stringify([...merged]));
        for (const k of legacy) store.remove(k);
        changed += legacy.length + 1;
      }
      return { changed };
    },
  },

  {
    id: 2,
    name: 'lists: the old "known words" set becomes a list named "Known"',
    // vq_known_<lang> (one bare set) predates named lists. Only converted when the language has no
    // lists yet — a browser that already has lists keeps its old key untouched, as before.
    up(store) {
      let changed = 0;
      for (const lang of LEGACY_LANGUAGES) {
        const target = `vq_lists_${lang}`;
        if (store.get(target) !== null) continue;
        const oldKey = `vq_known_${lang}`;
        const oldRaw = store.get(oldKey);
        if (oldRaw === null) continue;
        const words = stringArray(oldRaw);
        if (words.length > 0) put(store, target, JSON.stringify({ Known: words }));
        store.remove(oldKey);
        changed++;
      }
      return { changed };
    },
  },

  {
    id: 3,
    name: 'list filter: the single per-language setting moves into the shared bucket',
    // vq_listfilter_<lang> held one Hide/Focus setting for every mode. Filters are now stored per
    // bucket (vq_listfilter_<lang>__<bucket>); every mode started chained, so the shared bucket is
    // exactly what they all had. An existing shared bucket wins over the legacy value.
    up(store) {
      let changed = 0;
      for (const lang of LEGACY_LANGUAGES) {
        const legacyKey = `vq_listfilter_${lang}`;
        const raw = store.get(legacyKey);
        if (raw === null) continue;
        const old = parseJson(raw);
        if (isRecord(old)) {
          const selected = Array.isArray(old['selected']) ? old['selected'] : [];
          // 'off' meant "stop filtering but keep my lists checked": inactive. What it would filter
          // when switched back on is unknowable from the old value, so it gets the default.
          const state = old['mode'] === 'off'
            ? { active: false, mode: 'hide', selected }
            : { active: true, mode: old['mode'] === 'hide' || old['mode'] === 'focus' ? old['mode'] : 'hide', selected };
          const shared = `vq_listfilter_${lang}__shared`;
          if (store.get(shared) === null) put(store, shared, JSON.stringify(state));
        }
        store.remove(legacyKey);
        changed++;
      }
      return { changed };
    },
  },

  {
    id: 4,
    name: 'My Content: the first-cut gloss order folds into word overrides',
    // uc_glossorder_<lang> held just a gloss reorder, before word overrides grew to hold it.
    up(store) {
      let changed = 0;
      for (const lang of LEGACY_LANGUAGES) {
        const legacyKey = `uc_glossorder_${lang}`;
        const raw = store.get(legacyKey);
        if (raw === null) continue;
        const parsed = parseJson(raw);
        const legacy: Record<string, string[]> =
          isRecord(parsed) && Object.values(parsed).every(v => Array.isArray(v) && v.every(x => typeof x === 'string'))
            ? parsed as Record<string, string[]> : {};

        if (Object.keys(legacy).length > 0) {
          const target = `uc_wordoverride_${lang}`;
          const existing = parseJson(store.get(target));
          const overrides: Record<string, Record<string, unknown>> =
            isRecord(existing) && Object.values(existing).every(isRecord)
              ? existing as Record<string, Record<string, unknown>> : {};
          for (const [word, order] of Object.entries(legacy)) {
            overrides[word] = { ...ownGet(overrides, word), glossOrder: order };
          }
          put(store, target, JSON.stringify(overrides));
        }
        store.remove(legacyKey);
        changed++;
      }
      return { changed };
    },
  },

  {
    id: 5,
    name: 'settings: Simple Mode takes over from the old "kid friendly mode" key',
    // The setting was renamed. The old key is read as a fallback only while the new one is absent;
    // this makes the new key real. The old key is left in place for now (see the plan's Phase 3).
    up(store) {
      const legacy = store.get('s_kid_friendly_mode');
      if (legacy === null || store.get('s_simple_mode') !== null) return { changed: 0 };
      put(store, 's_simple_mode', legacy === 'true' ? 'true' : 'false');
      return { changed: 1 };
    },
  },

  {
    id: 6,
    name: 'settings: conjugation "deselected" mode takes over from the old boolean',
    // s_conj_keep_shape (a boolean) became the four-way s_conj_deselected. 'false' meant "close",
    // and 'grey' is the keep variant that shows the most. The old key is left in place for now.
    up(store) {
      const valid = ['close', 'blank', 'grey', 'answer'];
      const current = store.get('s_conj_deselected');
      if (current !== null && valid.includes(current)) return { changed: 0 };
      const legacy = store.get('s_conj_keep_shape');
      if (legacy === null) return { changed: 0 };
      put(store, 's_conj_deselected', legacy === 'false' ? 'close' : 'grey');
      return { changed: 1 };
    },
  },
];

/** The layout this build of the app writes. */
export const CURRENT_SCHEMA: number = MIGRATIONS[MIGRATIONS.length - 1]?.id ?? 0;

// ── the runner ───────────────────────────────────────────────────────────────

/** The real thing, through storage.ts's never-throwing readers and writers. */
export function defaultStore(): MigrationStore {
  return {
    get:    k => readString(k),
    set:    (k, v) => writeString(k, v),
    remove: k => remove(k),
    keys:   () => keys(),
  };
}

/** The stored version; anything absent or malformed reads as the original layout, 0. */
export function readSchemaVersion(store: MigrationStore): number {
  const n = Number(store.get(SCHEMA_KEY));
  return Number.isInteger(n) && n > 0 ? n : 0;
}

/**
 * Bring the stored data up to the latest layout. Synchronous, so it can finish
 * before anything else in the app reads storage (see storage-boot.ts).
 *
 * Never throws: a failure is reported and the version stays where it was, so the
 * next start tries again while the app carries on with the legacy fallbacks it
 * already has.
 */
export function runMigrations(
  store: MigrationStore = defaultStore(),
  steps: readonly Migration[] = MIGRATIONS,
): MigrationReport {
  const latest = steps.length ? steps[steps.length - 1].id : 0;
  const from = readSchemaVersion(store);
  const report: MigrationReport = { from, to: from, ran: [] };

  // Data written by a newer app: its layout is unknown to us, so touch nothing.
  if (from > latest) { report.newerThanApp = true; return report; }

  for (const step of steps) {
    if (step.id <= from) continue;
    try {
      const { changed } = step.up(store);
      report.ran.push({ id: step.id, name: step.name, changed });
      // Advance only once the step has fully succeeded. If this write fails the step just runs
      // again next start — which is safe, because steps are idempotent.
      store.set(SCHEMA_KEY, String(step.id));
      report.to = step.id;
    } catch (err) {
      report.failed = { id: step.id, name: step.name, error: err instanceof Error ? err.message : String(err) };
      break;
    }
  }
  return report;
}
