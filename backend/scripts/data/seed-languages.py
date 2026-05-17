#!/usr/bin/env python3
"""
seed-languages.py  —  Load preseed JSONL files into vocabulary.db.

Source files (produced by clean_wikicorpora.py):
    data/spanish_preseed.jsonl
    data/french_preseed.jsonl
    data/italian_preseed.jsonl
    data/portuguese_preseed.jsonl

Populates: words, word_glosses, word_tags
Uses UPSERT — safe to re-run; existing rows are updated, not duplicated.

Usage:
    python backend/scripts/data/seed-languages.py

Stop the server before running (DB must not be locked).
"""

import json
import shutil
import tempfile
import datetime
import sqlite3
from pathlib import Path

# backend/scripts/data/ → backend/scripts/ → backend/ → VocabApp/
BASE_DIR     = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parent.parent.parent
DB_PATH      = PROJECT_ROOT / 'data' / 'vocabulary.db'

SOURCES = {
    'spanish':    PROJECT_ROOT / 'data' / 'spanish_preseed.jsonl',
    'french':     PROJECT_ROOT / 'data' / 'french_preseed.jsonl',
    'italian':    PROJECT_ROOT / 'data' / 'italian_preseed.jsonl',
    'portuguese': PROJECT_ROOT / 'data' / 'portuguese_preseed.jsonl',
}

LANGUAGES = ['spanish', 'french', 'italian', 'portuguese']

# ── SQL ────────────────────────────────────────────────────────────────────────

UPSERT_WORD = """
    INSERT INTO words
        (language, word, display, pos, difficulty, notes,
         gender, register, infinitive, rank, ipa, syllables, conjugations, domains, emoji)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(language, word) DO UPDATE SET
        display      = COALESCE(excluded.display,      display),
        pos          = COALESCE(excluded.pos,          pos),
        difficulty   = COALESCE(excluded.difficulty,   difficulty),
        notes        = COALESCE(excluded.notes,        notes),
        gender       = COALESCE(excluded.gender,       gender),
        register     = COALESCE(excluded.register,     register),
        infinitive   = COALESCE(excluded.infinitive,   infinitive),
        rank         = COALESCE(excluded.rank,         rank),
        ipa          = COALESCE(excluded.ipa,          ipa),
        syllables    = COALESCE(excluded.syllables,    syllables),
        conjugations = COALESCE(excluded.conjugations, conjugations),
        domains      = COALESCE(excluded.domains,      domains),
        emoji        = COALESCE(excluded.emoji,        emoji),
        updated_at   = CURRENT_TIMESTAMP
"""

INSERT_GLOSS = """
    INSERT OR IGNORE INTO word_glosses (word_id, gloss, position)
    VALUES (?, ?, ?)
"""

INSERT_TAG = """
    INSERT OR IGNORE INTO word_tags (word_id, tag)
    VALUES (?, ?)
"""

# ── Helpers ────────────────────────────────────────────────────────────────────

def read_jsonl(path: Path) -> list[dict]:
    entries = []
    with open(path, encoding='utf-8') as f:
        for lineno, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                entries.append(json.loads(line))
            except json.JSONDecodeError as e:
                print(f'  Warning: skipping JSONL line {lineno}: {e}')
    return entries


def syllables_to_str(syllables) -> str | None:
    """Convert ['par', 'ler'] → 'par-ler' for DB storage."""
    if not syllables:
        return None
    if isinstance(syllables, list):
        return '-'.join(s for s in syllables if s)
    return str(syllables) or None


def extract_word_row(w: dict, lang: str) -> tuple:
    """Map one preseed entry to the words table row tuple."""
    ling = w.get('linguistic') or {}
    freq = w.get('frequency')  or {}
    conj = ling.get('conjugations')
    doms = w.get('domains') or ['general']

    return (
        lang,
        w['word'],
        w.get('display') or w['word'],
        w.get('pos'),
        w.get('difficulty'),
        w.get('notes') or None,
        ling.get('gender'),
        w.get('register') or ling.get('register'),
        ling.get('infinitive'),
        freq.get('rank') or w.get('rank'),
        ling.get('ipa') or None,
        syllables_to_str(ling.get('syllables')),
        json.dumps(conj, ensure_ascii=False) if conj else None,
        json.dumps(doms, ensure_ascii=False) if doms else None,
        w.get('emoji') or None,
    )


# ── Core seeding ───────────────────────────────────────────────────────────────

def seed_language(lang: str, conn: sqlite3.Connection) -> None:
    cursor = conn.cursor()
    source = SOURCES[lang]

    if not source.exists():
        print(f'\n  {lang.capitalize()}  ✗  file not found: {source.name}')
        return

    words = read_jsonl(source)
    print(f'\n{lang.capitalize()}  [{len(words)} words]')

    glosses_n = tags_n = 0

    for w in words:
        cursor.execute(UPSERT_WORD, extract_word_row(w, lang))
        cursor.execute(
            'SELECT id FROM words WHERE language = ? AND word = ?',
            (lang, w['word'])
        )
        result = cursor.fetchone()
        if not result:
            continue
        word_id = result[0]

        for pos_idx, gloss in enumerate(w.get('glosses') or []):
            if gloss:
                cursor.execute(INSERT_GLOSS, (word_id, gloss, pos_idx))
                glosses_n += 1

        for tag in w.get('tags') or []:
            if tag:
                cursor.execute(INSERT_TAG, (word_id, tag))
                tags_n += 1

    conn.commit()

    cursor.execute(
        '''SELECT
             COUNT(*) total,
             SUM(CASE WHEN pos IS NOT NULL THEN 1 ELSE 0 END) has_pos,
             SUM(CASE WHEN conjugations IS NOT NULL THEN 1 ELSE 0 END) has_conj,
             SUM(CASE WHEN ipa IS NOT NULL THEN 1 ELSE 0 END) has_ipa,
             SUM(CASE WHEN rank IS NOT NULL THEN 1 ELSE 0 END) has_rank
           FROM words WHERE language = ?''',
        (lang,)
    )
    stats = cursor.fetchone()
    print(f'  words        : {stats[0]} total  '
          f'(pos: {stats[1]}, conj: {stats[2]}, IPA: {stats[3]}, rank: {stats[4]})')
    print(f'  word_glosses : {glosses_n} rows')
    print(f'  word_tags    : {tags_n} rows')


# ── Entry point ────────────────────────────────────────────────────────────────

def main() -> None:
    if not DB_PATH.exists():
        print(f'✗  DB not found: {DB_PATH}')
        raise SystemExit(1)

    # Backup
    backup = DB_PATH.with_name(
        f"vocabulary_pre_seed_{int(datetime.datetime.now().timestamp())}.db"
    )
    shutil.copy(DB_PATH, backup)
    print(f'Backup  : {backup.name}')

    # Work on a local temp copy so SQLite WAL/shm files work on CIFS mounts.
    tmp_dir  = tempfile.mkdtemp()
    local_db = Path(tmp_dir) / 'vocabulary.db'
    shutil.copy(DB_PATH, local_db)

    conn = sqlite3.connect(str(local_db))
    conn.execute('PRAGMA foreign_keys = ON')
    conn.execute('PRAGMA journal_mode = WAL')

    # Schema migration: add domains column if missing.
    existing_cols = {r[1] for r in conn.execute("PRAGMA table_info(words)").fetchall()}
    if 'domains' not in existing_cols:
        conn.execute('ALTER TABLE words ADD COLUMN domains TEXT')
        conn.commit()
        print('Migrated: added domains column to words')

    for lang in LANGUAGES:
        seed_language(lang, conn)

    conn.close()

    shutil.copy(local_db, DB_PATH)
    print(f'\n✓  Seeding complete — {DB_PATH.name}')


if __name__ == '__main__':
    main()
