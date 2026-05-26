#!/usr/bin/env python3
"""
sync_db.py
==========
Single command to take curated JSONL → fixed up → live in the DB.

What it does:
  1. Loads {lang}_curated.jsonl
  2. Fills any null preterite/imperfect conjugations (via mlconjug3)
  3. Fixes cognate display fields (promotes second gloss when display == word)
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
import tempfile
import warnings
from pathlib import Path
from typing import Dict, List, Optional

warnings.filterwarnings("ignore")

SCRIPT_DIR   = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent.parent
CURATED_DIR  = PROJECT_ROOT / 'data' / 'curated'
DB_PATH      = PROJECT_ROOT / 'data' / 'vocabulary.db'

LANGS = {
    'spa': 'spanish',
    'fra': 'french',
    'ita': 'italian',
    'por': 'portuguese',
}


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

def fill_conjugations(entries: List[dict], lang: str) -> int:
    """Fill null preterite/imperfect for verbs. Returns count filled."""
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


# ── Step 3: fix cognate display ────────────────────────────────────────────────

def fix_display(entries: List[dict]) -> int:
    """Promote second gloss to display when display == word. Returns count fixed."""
    fixed = 0
    for entry in entries:
        word    = entry.get('word', '')
        display = entry.get('display', '')
        glosses = entry.get('glosses') or []

        if display.lower() != word.lower() and display:
            continue  # already has a distinct English display

        better = next(
            (g for g in glosses if g and g.lower() != word.lower()), None
        )
        if better:
            entry['display'] = better
            fixed += 1

    return fixed


# ── Step 4: import to DB ───────────────────────────────────────────────────────

UPSERT = """
    INSERT INTO words
        (language, word, display, pos, difficulty, notes,
         gender, register, infinitive, rank, ipa, syllables, conjugations, domains, emoji,
         past_participle, gerund)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(language, word) DO UPDATE SET
        display         = excluded.display,
        pos             = COALESCE(excluded.pos,             pos),
        difficulty      = COALESCE(excluded.difficulty,      difficulty),
        notes           = COALESCE(excluded.notes,           notes),
        gender          = COALESCE(excluded.gender,          gender),
        register        = COALESCE(excluded.register,        register),
        infinitive      = COALESCE(excluded.infinitive,      infinitive),
        rank            = excluded.rank,
        ipa             = COALESCE(excluded.ipa,             ipa),
        syllables       = COALESCE(excluded.syllables,       syllables),
        conjugations    = COALESCE(excluded.conjugations,    conjugations),
        domains         = COALESCE(excluded.domains,         domains),
        emoji           = COALESCE(excluded.emoji,           emoji),
        past_participle = COALESCE(excluded.past_participle, past_participle),
        gerund          = COALESCE(excluded.gerund,          gerund),
        updated_at      = CURRENT_TIMESTAMP
"""


def rank_to_difficulty(rank: int) -> int:
    if rank <= 200:  return 1
    if rank <= 500:  return 2
    if rank <= 1000: return 3
    if rank <= 2000: return 4
    return 5


def import_to_db(entries: List[dict], lang: str, conn: sqlite3.Connection) -> None:
    lang_name = LANGS[lang]
    cursor    = conn.cursor()

    # Ensure optional columns exist
    existing = {r[1] for r in conn.execute('PRAGMA table_info(words)').fetchall()}
    for col, ctype in [('domains', 'TEXT'), ('emoji', 'TEXT'),
                       ('past_participle', 'TEXT'), ('gerund', 'TEXT')]:
        if col not in existing:
            conn.execute(f'ALTER TABLE words ADD COLUMN {col} {ctype}')

    # Preserve the curated rank order from the JSONL
    entries.sort(key=lambda e: e.get('rank') or 9999)

    for w in entries:
        rank = w.get('rank') or 9999
        ling = w.get('linguistic') or {}
        conj = ling.get('conjugations')
        doms = w.get('domains') or ['general']
        syl  = ling.get('syllables')
        if isinstance(syl, list):
            syl = '-'.join(s for s in syl if s) or None

        # past_participle / gerund now live inside conjugations
        pp  = (conj.get('past_participle') if isinstance(conj, dict) else None) or ling.get('past_participle') or None
        ger = (conj.get('gerund')          if isinstance(conj, dict) else None) or ling.get('gerund')          or None

        cursor.execute(UPSERT, (
            lang_name,
            w['word'],
            w.get('display') or w['word'],
            w.get('pos'),
            rank_to_difficulty(rank),
            w.get('notes') or None,
            ling.get('gender'),
            w.get('register') or ling.get('register'),
            ling.get('infinitive'),
            rank,
            ling.get('ipa') or None,
            syl,
            json.dumps(conj, ensure_ascii=False) if conj else None,
            json.dumps(doms, ensure_ascii=False),
            w.get('emoji') or None,
            pp,
            ger,
        ))

        row = cursor.execute(
            'SELECT id FROM words WHERE language=? AND word=?', (lang_name, w['word'])
        ).fetchone()
        if not row:
            continue
        word_id = row[0]

        cursor.execute('DELETE FROM word_glosses WHERE word_id=?', (word_id,))
        for i, gloss in enumerate(w.get('glosses') or []):
            if gloss:
                cursor.execute(
                    'INSERT INTO word_glosses (word_id, gloss, position) VALUES (?,?,?)',
                    (word_id, gloss, i)
                )

        for tag in w.get('tags') or []:
            if tag:
                cursor.execute(
                    'INSERT OR IGNORE INTO word_tags (word_id, tag) VALUES (?,?)',
                    (word_id, tag)
                )

    conn.commit()


# ── Main ───────────────────────────────────────────────────────────────────────

def sync(lang: str, dry_run: bool) -> None:
    print(f'\n── {LANGS[lang].upper()} ({lang}) ──')

    entries = load_curated(lang)
    if not entries:
        return
    print(f'  Loaded       : {len(entries)} entries')

    conj_filled   = fill_conjugations(entries, lang)
    display_fixed = fix_display(entries)

    if conj_filled:
        print(f'  Conjugations : filled {conj_filled} verbs')
    if display_fixed:
        print(f'  Display      : fixed {display_fixed} cognates')

    if (conj_filled or display_fixed) and not dry_run:
        save_curated(entries, lang)
        print(f'  JSONL        : saved')

    if dry_run:
        print(f'  DB           : skipped (--dry-run)')
        return

    if not DB_PATH.exists():
        print(f'  DB           : not found at {DB_PATH}')
        return

    # Copy DB to /tmp — SQLite has I/O issues on Windows-mounted paths from Linux
    with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as tmp:
        tmp_path = Path(tmp.name)
    shutil.copy2(str(DB_PATH), str(tmp_path))

    conn = sqlite3.connect(str(tmp_path))
    conn.execute('PRAGMA foreign_keys = ON')
    import_to_db(entries, lang, conn)
    conn.close()

    shutil.copy2(str(tmp_path), str(DB_PATH))
    tmp_path.unlink(missing_ok=True)
    print(f'  DB           : {len(entries)} words written')


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
        sys.exit(1)

    for lang in args.langs:
        sync(lang, args.dry_run)

    print('\nDone.')


if __name__ == '__main__':
    main()
