#!/usr/bin/env python3
"""
infer_gender.py
===============
Rule-based gender inference for Spanish nouns that are missing gender data.
Updates the JSONL in place and patches the DB directly.

Usage:
    python scripts/data/infer_gender.py [--dry-run]
"""

import argparse
import json
import sqlite3
import sys
from pathlib import Path

SCRIPT_DIR   = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent
JSONL_PATH   = PROJECT_ROOT / 'data' / 'curated' / 'spanish_curated.jsonl'
DB_PATH      = PROJECT_ROOT / 'data' / 'vocabulary.db'

# ── Exception lists ────────────────────────────────────────────────────────────

# Masculine words that end in -a (Greek -ma words + common exceptions)
MASC_EXCEPTIONS_A = {
    'día', 'mapa', 'problema', 'programa', 'sistema', 'tema', 'clima',
    'idioma', 'diploma', 'fantasma', 'panorama', 'poema', 'dilema',
    'esquema', 'drama', 'trauma', 'coma', 'telegrama', 'enigma',
    'aroma', 'síntoma', 'lema', 'emblema', 'teorema', 'fonema',
    'pijama', 'sofá', 'papá', 'mamá', 'planeta', 'cometa', 'profeta',
}

# Feminine words that end in -o
FEM_EXCEPTIONS_O = {'mano', 'foto', 'moto', 'radio', 'nao'}

# Strong feminine suffixes (very reliable)
FEMININE_SUFFIXES = [
    'ción', 'sión', 'tión', 'xión',   # nación, misión, cuestión
    'dad', 'tad', 'tud',               # ciudad, libertad, virtud
    'eza',                             # belleza, riqueza
    'ncia',                            # distancia, infancia
    'ura',                             # cultura, temperatura
    'umbre',                           # costumbre, cumbre
    'triz',                            # actriz, directriz
]

# Strong masculine suffixes
MASCULINE_SUFFIXES = [
    'aje',   # viaje, mensaje
    'ismo',  # turismo, optimismo
]


def infer_gender(word: str) -> str | None:
    """
    Return 'masculine', 'feminine', or None (uncertain).
    Conservative — only returns a value when highly confident.
    """
    w = word.lower()

    # Check exception lists first
    if w in MASC_EXCEPTIONS_A:
        return 'masculine'
    if w in FEM_EXCEPTIONS_O:
        return 'feminine'

    # Strong feminine suffixes
    for suf in FEMININE_SUFFIXES:
        if w.endswith(suf):
            return 'feminine'

    # Strong masculine suffixes
    for suf in MASCULINE_SUFFIXES:
        if w.endswith(suf):
            return 'masculine'

    # Final vowel rules (high confidence)
    if w.endswith('o'):
        return 'masculine'
    if w.endswith('a'):
        return 'feminine'

    # Everything else (-e, -or, -al, -il, -ón, -és, etc.) — too ambiguous
    return None


def run(dry_run: bool = False) -> None:
    entries = []
    with open(JSONL_PATH, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line:
                entries.append(json.loads(line))

    nouns = [e for e in entries if e.get('pos') == 'noun']
    print(f'Spanish nouns: {len(nouns)}')

    inferred_count = 0
    already_set    = 0
    uncertain      = 0
    changes: list[tuple[str, str]] = []  # (word, gender)

    for e in nouns:
        ling = e.setdefault('linguistic', {})
        if ling.get('gender'):
            already_set += 1
            continue
        g = infer_gender(e['word'])
        if g:
            if not dry_run:
                ling['gender'] = g
            changes.append((e['word'], g))
            inferred_count += 1
        else:
            uncertain += 1

    print(f'Already set:   {already_set}')
    print(f'Inferred:      {inferred_count}')
    print(f'Uncertain:     {uncertain}')

    # Gender distribution of inferred
    from collections import Counter
    dist = Counter(g for _, g in changes)
    print(f'  → masculine: {dist["masculine"]}, feminine: {dist["feminine"]}')

    # Sample
    print('\nSample inferences:')
    for word, g in list(changes)[:10]:
        print(f'  {word} → {g}')

    if dry_run:
        print('\n[DRY RUN — no changes written]')
        return

    # Write updated JSONL
    with open(JSONL_PATH, 'w', encoding='utf-8') as f:
        for e in entries:
            f.write(json.dumps(e, ensure_ascii=False) + '\n')
    print(f'\nJSONL updated: {JSONL_PATH.name}')

    # Patch DB directly
    change_map = {word: g for word, g in changes}
    conn = sqlite3.connect(str(DB_PATH))
    with conn:
        updated = 0
        for word, gender in change_map.items():
            rows = conn.execute(
                "UPDATE words SET gender=?, updated_at=CURRENT_TIMESTAMP "
                "WHERE word=? AND language='spanish' AND (gender IS NULL OR gender='')",
                (gender, word)
            ).rowcount
            updated += rows
    conn.close()
    print(f'DB rows updated: {updated}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()
    run(args.dry_run)
