#!/usr/bin/env python3
"""
seed-languages.py

Loads Spanish, Portuguese, French, and Italian vocabulary into vocabulary.db.

Source: data/{lang}_preseed.jsonl (single source of truth)
  All languages use preseed JSONL files with the full Spanish schema.
  Populates: words, word_glosses, word_domains, word_tags

Run once after generating or updating the preseed JSONL files:
    python backend/scripts/data/seed-languages.py

Stop the server first (DB must not be locked).
Re-running is safe -- uses UPSERT so existing rows are updated, not duplicated.
"""

import json
import shutil
import tempfile
import datetime
import sqlite3
from pathlib import Path

# Paths
# backend/scripts/data/ → backend/scripts/ → backend/ → VocabApp/
BASE_DIR    = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parent.parent.parent
DB_PATH     = PROJECT_ROOT / 'data' / 'vocabulary.db'
BACKUP_PATH = DB_PATH.with_name(
    f"vocabulary_pre_seed_{int(datetime.datetime.now().timestamp())}.db"
)

SOURCES = {
    'spanish':    PROJECT_ROOT / 'data' / 'spanish_preseed.jsonl',
    'portuguese': PROJECT_ROOT / 'data' / 'portuguese_preseed.jsonl',
    'french':     PROJECT_ROOT / 'data' / 'french_preseed.jsonl',
    'italian':    PROJECT_ROOT / 'data' / 'italian_preseed.jsonl',
}

# Preflight
if not DB_PATH.exists():
    print(f'X DB not found: {DB_PATH}')
    exit(1)

shutil.copy(DB_PATH, BACKUP_PATH)
print(f'Backup: {BACKUP_PATH.name}')

# Copy DB to a local temp file so SQLite WAL/shm files work (CIFS mounts block them)
_tmp_dir  = tempfile.mkdtemp()
LOCAL_DB  = Path(_tmp_dir) / 'vocabulary.db'
shutil.copy(DB_PATH, LOCAL_DB)
print(f'Working copy: {LOCAL_DB}')

conn = sqlite3.connect(str(LOCAL_DB))
conn.execute('PRAGMA foreign_keys = ON')
conn.execute('PRAGMA journal_mode = WAL')
cursor = conn.cursor()

# Add domains column if the schema predates it
existing_cols = {r[1] for r in cursor.execute("PRAGMA table_info(words)").fetchall()}
if "domains" not in existing_cols:
    cursor.execute("ALTER TABLE words ADD COLUMN domains TEXT")
    conn.commit()
    print("Migrated: added domains column to words")

# SQL templates
UPSERT_WORD = """
    INSERT INTO words
        (language, word, display, pos, difficulty, notes,
         gender, register, infinitive, rank, ipa, syllables, conjugations, domains)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        updated_at   = CURRENT_TIMESTAMP
"""

INSERT_GLOSS = """
    INSERT OR IGNORE INTO word_glosses (word_id, gloss, position)
    VALUES (?, ?, ?)
"""

INSERT_DOMAIN = """
    INSERT OR IGNORE INTO word_domains (word_id, domain)
    VALUES (?, ?)
"""

INSERT_TAG = """
    INSERT OR IGNORE INTO word_tags (word_id, tag)
    VALUES (?, ?)
"""

# Helpers
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
                print(f'  Warning: Skipping JSONL line {lineno}: {e}')
    return entries


def load_source(lang: str) -> tuple[list[dict], str]:
    """Return (word_list, format_name) from preseed JSONL."""
    jsonl_path = SOURCES[lang]

    if jsonl_path.exists():
        return read_jsonl(jsonl_path), 'jsonl'

    return [], 'none'


def syllables_to_str(syllables) -> str | None:
    """Convert syllable list ['par','ler'] to 'par-ler' for DB storage."""
    if not syllables:
        return None
    if isinstance(syllables, list):
        return '-'.join(s for s in syllables if s)
    return str(syllables) or None


def extract_word_row(w: dict, lang: str) -> tuple:
    """
    Map one word entry from preseed JSONL to the words table row tuple.

    The preseed JSONL uses the full Spanish schema with nested structures:
      - linguistic: { infinitive, gender, register, ipa, syllables, conjugations, ... }
      - frequency: { rank, corpus_frequency, ... }
    """
    ling  = w.get('linguistic') or {}
    freq  = w.get('frequency')  or {}
    conj  = ling.get('conjugations')
    doms  = w.get('domains') or ['general']

    word         = w['word']
    display      = w.get('display') or word
    pos          = w.get('pos')
    difficulty   = w.get('difficulty')
    notes        = w.get('notes') or None
    gender       = ling.get('gender')
    register     = w.get('register') or ling.get('register')
    infinitive   = ling.get('infinitive')
    rank         = freq.get('rank') or w.get('rank')
    ipa          = ling.get('ipa') or None
    syllables    = syllables_to_str(ling.get('syllables'))
    conjugations = json.dumps(conj, ensure_ascii=False) if conj else None
    domains      = json.dumps(doms, ensure_ascii=False) if doms else None

    return (lang, word, display, pos, difficulty, notes,
            gender, register, infinitive, rank, ipa, syllables, conjugations, domains)


def seed_language(lang: str):
    words, fmt = load_source(lang)

    if not words:
        print(f'  X No source found for {lang}')
        return

    label = lang.capitalize()
    print(f'\n{label}  [{fmt} format]  {len(words)} words')

    inserted = glosses_n = tags_n = 0

    for w in words:
        # 1. Upsert the words row
        row = extract_word_row(w, lang)
        cursor.execute(UPSERT_WORD, row)

        # Fetch the word DB id (needed for child tables)
        cursor.execute(
            'SELECT id FROM words WHERE language = ? AND word = ?',
            (lang, w['word'])
        )
        result = cursor.fetchone()
        if not result:
            continue
        word_id = result[0]

        inserted += 1

        # 2. word_glosses
        for pos_idx, gloss in enumerate(w.get('glosses') or []):
            if gloss:
                cursor.execute(INSERT_GLOSS, (word_id, gloss, pos_idx))
                glosses_n += 1

        # 3. word_tags
        for tag in w.get('tags') or []:
            if tag:
                cursor.execute(INSERT_TAG, (word_id, tag))
                tags_n += 1

    conn.commit()

    # Summary
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
    print(f'  OK words         : {stats[0]} total  '
          f'(pos: {stats[1]}, conjugations: {stats[2]}, IPA: {stats[3]}, rank: {stats[4]})')
    print(f'  OK word_glosses  : {glosses_n} rows inserted/ignored')
    print(f'  OK word_tags     : {tags_n} rows inserted/ignored')
    print(f'  OK domains       : stored as JSON in words table')


# Run
for lang in ['spanish', 'portuguese', 'french', 'italian']:
    seed_language(lang)

conn.close()

# Copy seeded DB back to the original location
shutil.copy(LOCAL_DB, DB_PATH)
print(f'\nOK Seeding complete. DB written back to {DB_PATH.name}')
