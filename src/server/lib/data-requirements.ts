/**
 * data-requirements.ts — what this app needs from a vocabulary database.
 *
 * This app does not build its own data. A separate project (VocabApp-Data)
 * runs a pipeline and produces `vocabulary.db`; everything here consumes it.
 * The two share no code, and after the split they do not share files either —
 * the entire interface is a SQLite file the app is handed.
 *
 * So this file is one half of a two-sided agreement, and it is deliberately
 * *not* a copy of the other half. The producer states what it builds, in its
 * own contract/schema.sql. This states what the app requires. They are
 * different sentences that happen to be compatible today, and the point of
 * writing both is that when they stop being compatible, something says so.
 *
 * That something is `checkDatabase`, run once at startup against the real
 * file. Not against the producer's DDL — against the database actually on
 * disk, because a database restored from an old backup, or built by a pipeline
 * from before a column existed, is exactly the case worth catching, and it is
 * the case where the file and the DDL disagree.
 *
 * WHY NOT JUST LET IT FAIL: without this, a database missing a column throws
 * on the first request that touches it, with a SQLite error, under a user, and
 * no indication that the fix is to rebuild the data. Here it fails at boot,
 * once, naming the column and the command.
 */

// ── What the app reads ────────────────────────────────────────────────────────

/**
 * Columns on `words` that this app's own SELECT names.
 *
 * Keep this list and the query in vocab-loader.ts in step — it is the query
 * that decides what is required, and this list is how the app says so out
 * loud before running it.
 *
 * `band` is not here, and was removed rather than forgotten. The pipeline used
 * to write a CEFR band into the database and this app never once selected it:
 * `bandFromRank` recomputes the band on every load, so the stored column was a
 * second copy of a derived value maintained by hand on the far side of a
 * project boundary. The two copies disagreed for a long time —
 * 500/1500/3000/5000/7000 here against 200/500/1000/2000/4000 there — and a
 * word ranked 3000 was B1 on screen and C1 in the data. The app now receives a
 * rank and decides for itself what to call it, so there is nothing left to
 * keep in step.
 */
export const REQUIRED_WORD_COLUMNS = [
  'id', 'word', 'translation', 'language', 'pos', 'difficulty', 'notes',
  'infinitive', 'reflexive', 'gender', 'plural', 'register', 'ipa',
  'syllables', 'conjugations', 'conjugation_class', 'future_stem',
  'conjugation_overrides', 'emoji', 'rank', 'corpus_frequency', 'domains',
] as const;

/** Tables the app queries. `meta` is absent on purpose — see below. */
export const REQUIRED_TABLES = [
  'words', 'word_glosses', 'word_examples', 'word_tags',
] as const;

/**
 * The oldest schema this app can read.
 *
 * A number rather than "must equal the current one": the producer bumps its
 * schema whenever the shape changes, including for additions this app has no
 * opinion about, and refusing a database because it is one version newer or
 * older than some moving target would make the two projects impossible to
 * release separately. What matters is whether the columns above are there.
 */
export const MINIMUM_SCHEMA_VERSION = 1;

/**
 * CEFR band cutoffs: [band, maxRankInclusive]. Display only.
 *
 * Nothing derived from these leaves the app or arrives in the data, which is
 * what makes it safe for the pipeline to have numbers of its own.
 */
export const BAND_CUTOFFS: ReadonlyArray<readonly [string, number]> = [
  ['A1',   500],
  ['A2',  1500],
  ['B1',  3000],
  ['B2',  5000],
  ['C1',  7000],
] as const;

/** Where to go when the database is unusable. */
export const REBUILD_INSTRUCTION =
  'rebuild it in the VocabApp-Data project (`python pipeline/pipeline.py all --write`) ' +
  'and point DATA_DIR at the result';

// ── Checking a real database ──────────────────────────────────────────────────

export interface DatabaseReport {
  /** Missing tables or columns. Non-empty means the app cannot serve at all. */
  fatal:    string[];
  /** Worth saying out loud; not a reason to refuse to start. */
  warnings: string[];
  schemaVersion:   number | null;
  pipelineVersion: number | null;
  builtAt:         string | null;
}

interface MinimalDb {
  prepare(sql: string): { all(...params: unknown[]): unknown[] };
}

/**
 * One value from the database's `meta` table.
 *
 * Absent table and absent row are both null, and both are ordinary: every
 * database built before the pipeline started stamping them has no `meta` at
 * all. That is a thing to report, not a thing to fail on.
 */
function metaValue(db: MinimalDb, key: string): string | null {
  try {
    const rows = db.prepare('SELECT value FROM meta WHERE key = ?').all(key) as
      { value: string }[];
    return rows[0]?.value ?? null;
  } catch {
    return null;
  }
}

/**
 * Compare a live database against what this app needs.
 *
 * The split between fatal and warning is the whole design. Structure is fatal:
 * every query below names these columns, so the alternative to failing at boot
 * is the same failure on the first request with no instruction attached. Being
 * merely *old* is a warning: an old database is usually fine, and an app that
 * refuses to start because its data is a version behind is worse than the
 * problem it is reporting.
 */
export function checkDatabase(db: MinimalDb): DatabaseReport {
  const fatal:    string[] = [];
  const warnings: string[] = [];

  const tables = new Set(
    (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as
      { name: string }[]).map(r => r.name)
  );

  for (const table of REQUIRED_TABLES) {
    if (!tables.has(table)) fatal.push(`missing table '${table}'`);
  }

  if (tables.has('words')) {
    const columns = new Set(
      (db.prepare('PRAGMA table_info(words)').all() as { name: string }[])
        .map(r => r.name)
    );
    const absent = REQUIRED_WORD_COLUMNS.filter(c => !columns.has(c));
    if (absent.length) {
      fatal.push(`words is missing ${absent.length === 1 ? 'column' : 'columns'} ` +
                 absent.map(c => `'${c}'`).join(', '));
    }
  }

  const rawSchema   = metaValue(db, 'schema_version');
  const rawPipeline = metaValue(db, 'pipeline_version');
  const builtAt     = metaValue(db, 'built_at');

  const schemaVersion   = rawSchema   === null ? null : Number(rawSchema);
  const pipelineVersion = rawPipeline === null ? null : Number(rawPipeline);

  if (schemaVersion === null) {
    warnings.push(
      'this database carries no version stamp, so it was built before the ' +
      'pipeline started recording one'
    );
  } else if (schemaVersion < MINIMUM_SCHEMA_VERSION) {
    // Older than the app can read, but the columns are evidently there or the
    // check above would have fired. Say so and carry on rather than refusing
    // over a number when the actual data looks usable.
    warnings.push(
      `built against schema v${schemaVersion}; this app expects at least ` +
      `v${MINIMUM_SCHEMA_VERSION}`
    );
  }

  return { fatal, warnings, schemaVersion, pipelineVersion, builtAt };
}
