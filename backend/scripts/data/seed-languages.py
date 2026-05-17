#!/usr/bin/env python3
"""
seed-languages.py  —  Load preseed JSONL files into vocabulary.db.

Populates: words, word_glosses, word_tags
Uses UPSERT — safe to re-run; existing rows are updated, not duplicated.

Emoji are applied from emoji_data.EMOJI_DATA (no JSONL regeneration needed).
Each emoji category ('animals', 'food', ...) is also set as the word's domain
when the word currently has only the default ['general'] domain.

Usage:
    python backend/scripts/data/seed-languages.py

Stop the server before running (DB must not be locked).
"""

import json
import sys
import shutil
import tempfile
import datetime
import sqlite3
from pathlib import Path

BASE_DIR     = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parent.parent.parent
DB_PATH      = PROJECT_ROOT / 'data' / 'vocabulary.db'

sys.path.insert(0, str(BASE_DIR))
from emoji_data import EMOJI_DATA  # type: ignore

SOURCES = {
    'spanish':    PROJECT_ROOT / 'data' / 'spanish_preseed.jsonl',
    'french':     PROJECT_ROOT / 'data' / 'french_preseed.jsonl',
    'italian':    PROJECT_ROOT / 'data' / 'italian_preseed.jsonl',
    'portuguese': PROJECT_ROOT / 'data' / 'portuguese_preseed.jsonl',
}

LANGUAGES = ['spanish', 'french', 'italian', 'portuguese']

LANG_CODE = {
    'spanish':    'spa',
    'french':     'fra',
    'italian':    'ita',
    'portuguese': 'por',
}

# Domains that count as "unset" — safe to overwrite with the emoji category
DEFAULT_DOMAINS = {'["general"]', None, '', '[]'}

# -- SQL -----------------------------------------------------------------------

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

# -- Helpers -------------------------------------------------------------------

def read_jsonl(path):
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


def syllables_to_str(syllables):
    if not syllables:
        return None
    if isinstance(syllables, list):
        return '-'.join(s for s in syllables if s)
    return str(syllables) or None


def extract_word_row(w, lang):
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


def cleanup_wal(db_path):
    """Remove WAL/SHM sidecar files. Warns but continues if locked by server."""
    for suffix in ('-wal', '-shm'):
        ghost = db_path.parent / (db_path.name + suffix)
        try:
            ghost.unlink()
        except FileNotFoundError:
            pass
        except PermissionError:
            print(f'  Warning: could not remove {ghost.name} — is the server still running?')


def check_not_locked(db_path):
    """Exit early with a clear message if the DB is locked."""
    try:
        conn = sqlite3.connect(str(db_path), timeout=2)
        conn.execute('BEGIN EXCLUSIVE')
        conn.rollback()
        conn.close()
    except sqlite3.OperationalError:
        print('X  vocabulary.db is locked — stop the server first, then re-run.')
        raise SystemExit(1)


# -- Core seeding --------------------------------------------------------------

def seed_language(lang, conn):
    cursor = conn.cursor()
    source = SOURCES[lang]

    if not source.exists():
        print(f'\n  {lang.capitalize()}  X  file not found: {source.name}')
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

    # -- Emoji + domain pass ---------------------------------------------------
    lang_code   = LANG_CODE.get(lang, lang[:3])
    lang_emojis = EMOJI_DATA.get(lang_code, {})
    emoji_n = domain_n = 0

    for category, word_map in lang_emojis.items():
        cat_domain = json.dumps([category])   # e.g. '["animals"]'

        for word, emoji in word_map.items():
            row = cursor.execute(
                'SELECT emoji, domains FROM words WHERE language = ? AND word = ?',
                (lang, word)
            ).fetchone()
            if not row:
                continue   # word not in DB (corpus not seeded for this lang)

            cur_emoji, cur_domains = row

            if not cur_emoji:
                cursor.execute(
                    'UPDATE words SET emoji = ?, updated_at = CURRENT_TIMESTAMP '
                    'WHERE language = ? AND word = ?',
                    (emoji, lang, word)
                )
                emoji_n += 1

            # Only promote to category domain if still on the default 'general'
            if cur_domains in DEFAULT_DOMAINS:
                cursor.execute(
                    'UPDATE words SET domains = ?, updated_at = CURRENT_TIMESTAMP '
                    'WHERE language = ? AND word = ?',
                    (cat_domain, lang, word)
                )
                domain_n += 1

    conn.commit()

    cursor.execute(
        '''SELECT
             COUNT(*) total,
             SUM(CASE WHEN pos IS NOT NULL THEN 1 ELSE 0 END) has_pos,
             SUM(CASE WHEN conjugations IS NOT NULL THEN 1 ELSE 0 END) has_conj,
             SUM(CASE WHEN rank IS NOT NULL THEN 1 ELSE 0 END) has_rank,
             SUM(CASE WHEN emoji IS NOT NULL THEN 1 ELSE 0 END) has_emoji
           FROM words WHERE language = ?''',
        (lang,)
    )
    stats = cursor.fetchone()
    print(f'  words        : {stats[0]} total  '
          f'(pos: {stats[1]}, conj: {stats[2]}, rank: {stats[3]})')
    print(f'  word_glosses : {glosses_n} rows')
    print(f'  word_tags    : {tags_n} rows')
    print(f'  emoji        : {stats[4]} words tagged  ({emoji_n} newly applied)')
    print(f'  domain fixed : {domain_n} words updated to category domain')


# -- Entry point ---------------------------------------------------------------

def main():
    if not DB_PATH.exists():
        print(f'X  DB not found: {DB_PATH}')
        raise SystemExit(1)

    check_not_locked(DB_PATH)
    cleanup_wal(DB_PATH)

    backup = DB_PATH.parent / f"vocabulary_pre_seed_{int(datetime.datetime.now().timestamp())}.db"
    shutil.copy2(str(DB_PATH), str(backup))
    print(f'Backup  : {backup.name}')

    tmp_dir  = tempfile.mkdtemp()
    local_db = Path(tmp_dir) / 'vocabulary.db'
    shutil.copy2(str(DB_PATH), str(local_db))

    conn = sqlite3.connect(str(local_db))
    conn.execute('PRAGMA foreign_keys = ON')
    conn.execute('PRAGMA journal_mode = DELETE')

    existing_cols = {r[1] for r in conn.execute("PRAGMA table_info(words)").fetchall()}
    for col, col_type in [('domains', 'TEXT'), ('emoji', 'TEXT')]:
        if col not in existing_cols:
            conn.execute(f'ALTER TABLE words ADD COLUMN {col} {col_type}')
            conn.commit()
            print(f'Migrated: added {col} column to words')

    for lang in LANGUAGES:
        seed_language(lang, conn)

    conn.close()

    print('\nWriting to vocabulary.db ...')
    cleanup_wal(DB_PATH)
    shutil.copy2(str(local_db), str(DB_PATH))
    cleanup_wal(DB_PATH)

    print(f'Done -- {DB_PATH.name}')


if __name__ == '__main__':
    main()
