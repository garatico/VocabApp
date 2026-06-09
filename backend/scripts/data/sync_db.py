#!/usr/bin/env python3
"""
sync_db.py
==========
Single command to take curated JSONL → fixed up → live in the DB.

What it does:
  1. Loads {lang}_curated.jsonl
  2. Fills any null preterite/imperfect conjugations (via mlconjug3)
  3. Fixes cognate translation fields (promotes second gloss when translation == word)
  4. Writes improved JSONL back
  5. Imports to vocabulary.db

Usage:
    python backend/scripts/data/sync_db.py
    python backend/scripts/data/sync_db.py --langs spa
    python backend/scripts/data/sync_db.py --dry-run    # skip DB write
"""

import argparse
import json
import shutil
import sqlite3
import sys
import warnings
from pathlib import Path
from typing import Dict, List, Optional

warnings.filterwarnings("ignore")

SCRIPT_DIR   = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent.parent
CURATED_DIR  = PROJECT_ROOT / 'data' / 'curated'
DB_PATH      = PROJECT_ROOT / 'data' / 'vocabulary.db'

from lang_config import LANG_NAMES as LANGS, rank_to_difficulty

# ── Schema ─────────────────────────────────────────────────────────────────────

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
"""


def open_db(db_path: Path) -> sqlite3.Connection:
    """Open the DB, rebuilding from scratch if it is missing or malformed."""
    def _connect(path: Path) -> sqlite3.Connection:
        conn = sqlite3.connect(str(path))
        conn.execute('PRAGMA foreign_keys = ON')
        conn.execute('PRAGMA journal_mode = WAL')
        return conn

    if db_path.exists():
        try:
            conn = _connect(db_path)
            result = conn.execute('PRAGMA integrity_check').fetchone()
            if result and result[0] == 'ok':
                return conn
            conn.close()
            print(f'  DB integrity check failed ({result[0]}); rebuilding…')
        except Exception as e:
            print(f'  DB could not be opened ({e}); rebuilding…')
        # Rename corrupted file as backup
        backup = db_path.with_suffix('.db.bak')
        shutil.move(str(db_path), str(backup))
        print(f'  Corrupt DB saved as {backup.name}')

    print(f'  Creating fresh DB at {db_path}')
    conn = _connect(db_path)
    conn.executescript(SCHEMA)
    conn.commit()
    return conn

# ── Step 1: load ───────────────────────────────────────────────────────────────

def load_curated(lang: str) -> List[dict]:
    path = CURATED_DIR / f'{LANGS[lang]}_curated.jsonl'
    if not path.exists():
        print(f'  No curated file for {lang}: {path}')
        return []
    entries = []
    with open(path, encoding='utf-8') as f:
        for lineno, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                entries.append(json.loads(line))
            except json.JSONDecodeError as e:
                print(f'  Warning: skipping line {lineno}: {e}')
    return entries


def save_curated(entries: List[dict], lang: str) -> None:
    path = CURATED_DIR / f'{LANGS[lang]}_curated.jsonl'
    with open(path, 'w', encoding='utf-8') as f:
        for e in entries:
            f.write(json.dumps(e, ensure_ascii=False) + '\n')


# ── Step 2: fill conjugations ──────────────────────────────────────────────────
# Spanish verbs now use the rule engine (conjugation_class + overrides) so
# mlconjug3 filling is no longer needed for Spanish.  Other languages that
# still store a full conjugations dict are handled here.

def fill_conjugations(entries: List[dict], lang: str) -> int:
    """Fill null preterite/imperfect for verbs that use the legacy conjugations
    dict (non-Spanish languages).  Spanish is skipped — its verbs use the
    rule engine via conjugation_class + overrides instead."""
    if lang == 'spa':
        return 0  # Spanish uses verb_rules engine, not mlconjug3

    try:
        import mlconjug3
        from lang_config import TENSE_MAP, MLCONJUG3_LANG
    except ImportError:
        print('  Conjugations: skipped (mlconjug3 not installed)')
        return 0

    tense_map     = TENSE_MAP.get(lang, {})
    mlconjug_code = MLCONJUG3_LANG.get(lang)
    if not tense_map or not mlconjug_code:
        return 0

    conjugator = mlconjug3.Conjugator(language=mlconjug_code)
    filled = 0

    for entry in entries:
        if entry.get('pos') != 'verb':
            continue
        conj = entry.get('linguistic', {}).get('conjugations')
        if not conj:
            continue
        needs_pret = conj.get('preterite') is None
        needs_imp  = conj.get('imperfect') is None
        if not needs_pret and not needs_imp:
            continue

        infinitive = entry.get('linguistic', {}).get('infinitive') or entry['word']
        try:
            verb_obj = conjugator.conjugate(infinitive)
            info = getattr(verb_obj, 'conjug_info', None)
            if callable(info):
                info = info()
        except Exception:
            continue

        changed = False
        for tense_key, needs in [('preterite', needs_pret), ('imperfect', needs_imp)]:
            if not needs:
                continue
            mood, label = tense_map.get(tense_key, (None, None))
            if not mood:
                continue
            mood_data  = info.get(mood, {}) if info else {}
            tense_data = mood_data.get(label) or mood_data.get(f'{mood} {label}')
            if not tense_data:
                continue
            forms = [f if f and f not in ('-', '') else None for f in tense_data.values()]
            if any(forms):
                conj[tense_key] = forms
                changed = True

        if changed:
            filled += 1

    return filled


# ── Step 3: fix cognate translation ─────────────────────────────────────────────

def fix_translation(entries: List[dict]) -> int:
    """Promote second gloss to translation when translation == word. Returns count fixed."""
    fixed = 0
    for entry in entries:
        word    = entry.get('word', '')
        translation = entry.get('translation', '')
        glosses = entry.get('glosses') or []

        if translation.lower() != word.lower() and translation:
            continue  # already has a distinct English translation

        better = next(
            (g for g in glosses if g and g.lower() != word.lower()), None
        )
        if better:
            entry['translation'] = better
            fixed += 1

    return fixed


# ── Step 4: import to DB ───────────────────────────────────────────────────────

UPSERT = """
    INSERT INTO words
        (language, word, translation, pos, difficulty, notes,
         gender, register, infinitive, rank, ipa, syllables, conjugations, domains, emoji,
         past_participle, gerund,
         conjugation_class, future_stem, conjugation_overrides)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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

def backup_db(db_path: Path) -> Optional[Path]:
    """Hot-copy the DB to a .bak file using SQLite's backup API.
    Returns the backup path, or None if the DB doesn't exist yet."""
    if not db_path.exists():
        return None
    backup_path = db_path.with_suffix('.db.bak')
    src = sqlite3.connect(str(db_path))
    dst = sqlite3.connect(str(backup_path))
    try:
        src.backup(dst)
    finally:
        dst.close()
        src.close()
    return backup_path


def sync(lang: str, dry_run: bool) -> None:
    print(f'\n── {LANGS[lang].upper()} ({lang}) ──')

    entries = load_curated(lang)
    if not entries:
        return
    print(f'  Loaded       : {len(entries)} entries')

    conj_filled   = fill_conjugations(entries, lang)
    translation_fixed = fix_translation(entries)

    if conj_filled:
        print(f'  Conjugations : filled {conj_filled} verbs')
    if translation_fixed:
        print(f'  Translation  : fixed {translation_fixed} cognates')

    if dry_run:
        print(f'  DB           : skipped (--dry-run)')
        return

    # Back up the DB before touching it — restore manually if needed
    bak = backup_db(DB_PATH)
    if bak:
        print(f'  Backup       : {bak.name}')

    # Import to DB first (in a single transaction).
    # Only write the JSONL changes if the DB write succeeds — keeps them in sync.
    conn = open_db(DB_PATH)
    try:
        imported, skipped = import_to_db(entries, lang, conn)
    except Exception as e:
        print(f'  DB FAILED    : {e}')
        print(f'  DB unchanged — restore from {bak.name if bak else "backup"} if needed')
        conn.close()
        return
    conn.close()
    print(f'  DB           : {imported} imported, {skipped} skipped')

    # JSONL saved only after DB write confirmed — keeps source and DB in sync
    if (conj_filled or translation_fixed):
        save_curated(entries, lang)
        print(f'  JSONL        : saved')


def main():
    parser = argparse.ArgumentParser(description='Sync curated JSONL → vocabulary.db')
    parser.add_argument('--langs', nargs='+', default=list(LANGS.keys()),
                        metavar='LANG', help=f'Language codes: {" ".join(LANGS)}')
    parser.add_argument('--dry-run', action='store_true',
                        help='Show what would change without writing anything')
    args = parser.parse_args()

    unknown = [l for l in args.langs if l not in LANGS]
    if unknown:
        print(f'Unknown language(s): {", ".join(unknown)}')
        print(f'Valid: {", ".join(LANGS)}')
        import sys; sys.exit(1)

    for lang in args.langs:
        sync(lang, args.dry_run)

    print('\nDone.')


if __name__ == '__main__':
    main()
