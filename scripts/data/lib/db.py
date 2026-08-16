"""
lib/db.py — everything that touches vocabulary.db
=================================================
Two jobs:

  1. Opening the database safely. Every caller gets an integrity check, WAL
     journalling, foreign keys on, and a hot backup before anything
     destructive.
  2. Writing entries into it — the upsert, the child tables, and the small
     targeted patches the enrich step produces.

This module deliberately knows nothing about JSONL files. It takes entries
(plain dicts) and hands back counts, so it can never disagree with
lib/curated.py about what is on disk.
"""

import json
import shutil
import sqlite3
import tempfile
from contextlib import contextmanager
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from .config import (DB_PATH, LANG_NAMES as LANGS,
                     rank_to_band, rank_to_difficulty)

# Canonical schema. Only used when creating a database from scratch; existing
# databases are migrated by the one-off scripts in scripts/migrations/.
SCHEMA = """
CREATE TABLE IF NOT EXISTS words (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    word                  TEXT    NOT NULL,
    translation           TEXT,
    language              TEXT    NOT NULL,
    pos                   TEXT,
    difficulty            TEXT,
    notes                 TEXT,
    infinitive            TEXT,
    reflexive             INTEGER DEFAULT 0,
    gender                TEXT,
    plural                TEXT,
    register              TEXT,
    ipa                   TEXT,
    syllables             TEXT,
    conjugations          TEXT,
    emoji                 TEXT,
    band                  TEXT,
    rank                  INTEGER,
    corpus_frequency      REAL,
    domains               TEXT,
    past_participle       TEXT,
    gerund                TEXT,
    conjugation_class     TEXT,
    future_stem           TEXT,
    conjugation_overrides TEXT,
    updated_at            TEXT    DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(word, language)
);
CREATE TABLE IF NOT EXISTS word_glosses (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    word_id  INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
    gloss    TEXT    NOT NULL,
    position INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS word_examples (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    word_id  INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
    example  TEXT    NOT NULL,
    position INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS word_tags (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    word_id INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
    tag     TEXT    NOT NULL,
    UNIQUE(word_id, tag)
);

-- Indexes. The app's main query pulls every word for a language and attaches
-- its glosses, examples and tags via correlated subqueries. Without these the
-- child tables are fully scanned once per word: 9.3 seconds for 8,775 Spanish
-- rows, versus 27 ms with them.
CREATE INDEX IF NOT EXISTS idx_word_glosses_word_id  ON word_glosses(word_id);
CREATE INDEX IF NOT EXISTS idx_word_examples_word_id ON word_examples(word_id);
CREATE INDEX IF NOT EXISTS idx_word_tags_word_id     ON word_tags(word_id);
CREATE INDEX IF NOT EXISTS idx_words_language        ON words(language);
CREATE INDEX IF NOT EXISTS idx_words_lang_rank       ON words(language, rank);
"""


INDEXES = [ln for ln in SCHEMA.splitlines() if ln.startswith('CREATE INDEX')]


def connect(db_path: Path) -> sqlite3.Connection:
    """Open a connection with the pragmas the app expects."""
    conn = sqlite3.connect(str(db_path))
    conn.execute('PRAGMA foreign_keys = ON')
    conn.execute('PRAGMA journal_mode = WAL')
    return conn


def ensure_indexes(conn: sqlite3.Connection) -> int:
    """
    Create any missing index. Cheap to run every time (IF NOT EXISTS), and it
    means a database built before the indexes existed gets them on next sync
    rather than needing a separate migration anyone could forget.
    """
    before = {r[0] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type='index'")}
    for stmt in INDEXES:
        conn.execute(stmt)
    conn.commit()
    after = {r[0] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type='index'")}
    return len(after - before)


def open_db(db_path: Path = DB_PATH, create: bool = True) -> sqlite3.Connection:
    """
    Open the database, verifying its integrity first.

    A corrupt database is moved aside as <name>.db.bak and replaced with a
    fresh one built from SCHEMA.

    create=False is for enrichment scripts that only ever UPDATE existing rows:
    silently creating an empty database would make them report '0 rows updated'
    against the wrong file instead of failing loudly.
    """
    db_path = Path(db_path)

    if db_path.exists():
        try:
            conn = connect(db_path)
            result = conn.execute('PRAGMA integrity_check').fetchone()
            if result and result[0] == 'ok':
                added = ensure_indexes(conn)
                if added:
                    print(f'  Added {added} missing index(es)')
                return conn
            conn.close()
            print(f'  DB integrity check failed ({result[0]}); rebuilding…')
        except sqlite3.OperationalError as e:
            # An operational error is the environment failing, not the file
            # being corrupt: a lock the filesystem can't grant, a disk I/O
            # error on a network share or a mounted drive, the file open in
            # another process. The rebuild path below MOVES THE DATABASE ASIDE
            # and creates an empty one, which for a transient error would
            # silently replace every word in the app with nothing. Refuse
            # instead, and say what to try.
            raise RuntimeError(
                f'Could not open {db_path}: {e}\n'
                f'  This is the filesystem or another process, not a corrupt file — '
                f'a corrupt database fails integrity_check instead.\n'
                f'  Close anything else using the database and try again. If the '
                f'path is a network share or a mounted drive, run the pipeline '
                f'against a local copy.'
            ) from e
        except Exception as e:
            print(f'  DB could not be opened ({e}); rebuilding…')

        if not create:
            raise RuntimeError(f'{db_path} is corrupt and this script will not rebuild it')

        backup = db_path.with_suffix('.db.bak')
        shutil.move(str(db_path), str(backup))
        print(f'  Corrupt DB saved as {backup.name}')

    elif not create:
        raise FileNotFoundError(
            f'{db_path} does not exist. Run `npm run sync -- --write` to build it first.'
        )

    print(f'  Creating fresh DB at {db_path}')
    conn = connect(db_path)
    conn.executescript(SCHEMA)
    conn.commit()
    return conn


def backup_db(db_path: Path = DB_PATH) -> Optional[Path]:
    """
    Copy the database to <name>.db.bak. Returns the backup path, or None if
    there was nothing to back up.

    Prefers SQLite's backup API, which is safe against a live connection. That
    API needs file locks, and some filesystems cannot provide them — a network
    share, or the Linux view of a mounted Windows drive, where it fails with
    "disk I/O error" before the copy starts. Falling back to a plain file copy
    is correct there: the pipeline is the only writer, and it has not opened
    the database yet at this point.

    Raising instead would mean the whole sync step aborts because the *backup*
    failed, which is the one part of it that exists to make failure survivable.
    """
    db_path = Path(db_path)
    if not db_path.exists():
        return None
    backup_path = db_path.with_suffix('.db.bak')

    try:
        src = sqlite3.connect(str(db_path))
        dst = sqlite3.connect(str(backup_path))
        try:
            src.backup(dst)
        finally:
            dst.close()
            src.close()
        return backup_path
    except sqlite3.Error as exc:
        try:
            shutil.copy2(db_path, backup_path)
            print(f'  DB backup    : SQLite backup API unavailable here ({exc}); '
                  f'used a file copy instead')
            return backup_path
        except OSError as copy_exc:
            print(f'  DB backup    : FAILED — {copy_exc}')
            print('                 refusing to continue without a backup')
            raise


@contextmanager
def writable(db_path: Path = DB_PATH):
    """
    Yield a connection to the database that is safe to write through.

    Normally that is just the database. But SQLite needs file locks, and some
    filesystems don't provide them — a network share, or a folder synced by
    OneDrive/Dropbox, or the Linux view of a mounted Windows drive. There the
    open fails with "disk I/O error" no matter how healthy the file is.

    In that case the work happens on a scratch copy on local disk and the
    result is copied back over the original when it succeeds. Copying rather
    than renaming is deliberate: those same filesystems often refuse the
    rename/unlink that shutil.move needs, while an in-place overwrite works.

    It is also the safer order in general, and the one curated.write already
    uses for the JSONL: a crash partway through an import leaves the real
    database untouched instead of half-written.
    """
    db_path = Path(db_path)
    try:
        conn = open_db(db_path)
    except RuntimeError as exc:
        if 'Could not open' not in str(exc):
            raise
        print(f'  DB           : {db_path.name} cannot be locked here; '
              f'working on a local copy')
        with tempfile.TemporaryDirectory() as tmp:
            scratch = Path(tmp) / db_path.name
            shutil.copy2(db_path, scratch)
            conn = open_db(scratch)
            try:
                yield conn
                conn.commit()
            finally:
                conn.close()
            # Only reached when the import didn't raise.
            shutil.copyfile(scratch, db_path)
            print(f'  DB           : copied back to {db_path}')
        return

    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


# NOTE: keep this column list in sync with the table. band, corpus_frequency,
# plural and reflexive were missing from it for a long time, so the data sat in
# the curated JSONL and never reached the app.
UPSERT = """
    INSERT INTO words
        (language, word, translation, pos, difficulty, notes,
         gender, register, infinitive, rank, ipa, syllables, conjugations, domains, emoji,
         past_participle, gerund,
         conjugation_class, future_stem, conjugation_overrides,
         band, corpus_frequency, plural, reflexive)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(language, word) DO UPDATE SET
        translation = excluded.translation,
        pos                    = COALESCE(excluded.pos,             pos),
        difficulty             = COALESCE(excluded.difficulty,      difficulty),
        notes                  = COALESCE(excluded.notes,           notes),
        gender                 = COALESCE(excluded.gender,          gender),
        register               = COALESCE(excluded.register,        register),
        infinitive             = COALESCE(excluded.infinitive,      infinitive),
        rank                   = excluded.rank,
        ipa                    = COALESCE(excluded.ipa,             ipa),
        syllables              = COALESCE(excluded.syllables,       syllables),
        conjugations           = COALESCE(excluded.conjugations,    conjugations),
        domains                = COALESCE(excluded.domains,         domains),
        emoji                  = COALESCE(excluded.emoji,           emoji),
        past_participle        = COALESCE(excluded.past_participle, past_participle),
        gerund                 = COALESCE(excluded.gerund,          gerund),
        conjugation_class      = excluded.conjugation_class,
        future_stem            = excluded.future_stem,
        conjugation_overrides  = excluded.conjugation_overrides,
        band                   = excluded.band,
        corpus_frequency       = COALESCE(excluded.corpus_frequency, corpus_frequency),
        plural                 = COALESCE(excluded.plural,           plural),
        reflexive              = COALESCE(excluded.reflexive,        reflexive),
        updated_at             = CURRENT_TIMESTAMP
"""


def _example_text(ex) -> Optional[str]:
    """Extract a plain string from an example that may be a dict or a string."""
    if isinstance(ex, dict):
        return ex.get('es') or ex.get('en') or None
    return str(ex) if ex else None


def import_to_db(entries: List[dict], lang: str, conn: sqlite3.Connection) -> tuple:
    """Import entries into the DB inside a single transaction.

    Returns (imported, skipped) counts.
    Raises on any DB error — the transaction is rolled back automatically.
    """
    lang_name = LANGS[lang]

    # Preserve the curated rank order from the JSONL
    entries.sort(key=lambda e: e.get('rank') or 9999)

    def missing_fields(w: dict) -> List[str]:
        missing = []
        if not w.get('word'):    missing.append('word')
        if not w.get('translation'): missing.append('translation')
        if not w.get('pos'):     missing.append('pos')
        if not [g for g in (w.get('glosses') or []) if g]:
            missing.append('glosses')
        return missing

    skipped = [(w.get('word', '?'), missing_fields(w)) for w in entries if missing_fields(w)]
    ready   = [w for w in entries if not missing_fields(w)]

    if skipped:
        preview = skipped[:10]
        print(f'  Skipped      : {len(skipped)} incomplete entries (first {len(preview)} shown):')
        for word, fields in preview:
            print(f'    {word!r} — missing: {", ".join(fields)}')
        if len(skipped) > len(preview):
            print(f'    … and {len(skipped) - len(preview)} more')

    # Single transaction — all-or-nothing. On exception, Python's sqlite3
    # context manager issues ROLLBACK automatically.
    with conn:
        cursor = conn.cursor()
        for w in ready:
            rank = w.get('rank') or 9999
            ling = w.get('linguistic') or {}
            conj = ling.get('conjugations')
            doms = w.get('domains') or []
            syl  = ling.get('syllables')
            if isinstance(syl, list):
                syl = '-'.join(s for s in syl if s) or None

            conj_class     = ling.get('conjugation_class') or None
            future_stem    = ling.get('future_stem') or None
            conj_overrides = ling.get('overrides')

            # For rule-based verbs (conjugation_class set), conjugations are computed
            # at runtime by verb-rules.js — nothing to store here beyond class/overrides.
            # For legacy languages (French/Italian/Portuguese) without a rule engine,
            # store the pre-computed conjugations JSON from the JSONL if present.
            stored_conj = None if conj_class else conj

            pp  = (conj.get('past_participle') if isinstance(conj, dict) else None)
            ger = (conj.get('gerund')          if isinstance(conj, dict) else None)

            freq = w.get('frequency') or {}
            # Fall back to computing the band from the rank. Only ~5% of
            # entries carry one explicitly, but every entry has a rank, so
            # this fills the column for all of them from one rule.
            band = freq.get('band') or rank_to_band(rank)
            corpus_frequency = freq.get('corpus_frequency')
            reflexive = ling.get('reflexive')

            cursor.execute(UPSERT, (
                lang_name,
                w['word'],
                w.get('translation') or w['word'],
                w.get('pos'),
                rank_to_difficulty(rank),
                w.get('notes') or None,
                ling.get('gender'),
                w.get('register') or ling.get('register'),
                ling.get('infinitive'),
                rank,
                ling.get('ipa') or None,
                syl,
                json.dumps(stored_conj, ensure_ascii=False) if stored_conj else None,
                json.dumps(doms, ensure_ascii=False),
                w.get('emoji') or None,
                pp,
                ger,
                conj_class,
                future_stem,
                json.dumps(conj_overrides, ensure_ascii=False) if conj_overrides is not None else None,
                band,
                corpus_frequency,
                ling.get('plural') or None,
                1 if reflexive else (0 if reflexive is not None else None),
            ))

            row = cursor.execute(
                'SELECT id FROM words WHERE language=? AND word=?', (lang_name, w['word'])
            ).fetchone()
            if not row:
                continue
            word_id = row[0]

            # Glosses
            cursor.execute('DELETE FROM word_glosses WHERE word_id=?', (word_id,))
            for i, gloss in enumerate(w.get('glosses') or []):
                if gloss:
                    cursor.execute(
                        'INSERT INTO word_glosses (word_id, gloss, position) VALUES (?,?,?)',
                        (word_id, gloss, i)
                    )

            # Examples (previously never imported — fixed)
            cursor.execute('DELETE FROM word_examples WHERE word_id=?', (word_id,))
            for i, ex in enumerate(w.get('examples') or []):
                text = _example_text(ex)
                if text:
                    cursor.execute(
                        'INSERT INTO word_examples (word_id, example, position) VALUES (?,?,?)',
                        (word_id, text, i)
                    )

            # Tags
            for tag in w.get('tags') or []:
                if tag:
                    cursor.execute(
                        'INSERT OR IGNORE INTO word_tags (word_id, tag) VALUES (?,?)',
                        (word_id, tag)
                    )

    return len(ready), len(skipped)


# ── Main ───────────────────────────────────────────────────────────────────────


# ── Targeted patches (used by the enrich step) ────────────────────────────────
# The enrich step computes its changes against the curated JSONL, then applies
# the same change to the DB so the two never drift. These run inside a single
# transaction and only ever UPDATE existing rows.

def patch_gender(conn: sqlite3.Connection,
                 changes: Dict[str, str],
                 language: str = 'spanish') -> int:
    """Set gender on rows that don't have one yet. Returns rows updated."""
    updated = 0
    with conn:
        for word, gender in changes.items():
            updated += conn.execute(
                "UPDATE words SET gender=?, updated_at=CURRENT_TIMESTAMP "
                "WHERE word=? AND language=? AND (gender IS NULL OR gender='')",
                (gender, word, language),
            ).rowcount
    return updated


def patch_domains(conn: sqlite3.Connection,
                  entries: List[dict],
                  language: str = 'spanish') -> int:
    """Write each entry's domains list back to its row. Returns rows updated."""
    updated = 0
    with conn:
        for e in entries:
            domains = e.get('domains')
            if not domains or domains == ['general']:
                continue
            updated += conn.execute(
                "UPDATE words SET domains=?, updated_at=CURRENT_TIMESTAMP "
                "WHERE word=? AND language=?",
                (json.dumps(domains, ensure_ascii=False), e['word'], language),
            ).rowcount
    return updated
