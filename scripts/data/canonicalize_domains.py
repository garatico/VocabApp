#!/usr/bin/env python3
"""
canonicalize_domains.py
=======================
Merges noisy/duplicate domains into the canonical set.
Also splits 'health' into 'health' + 'medicine'.

Canonical domains:
  animals, art, body, clothing, communication, education, emotions,
  family, food, geography, health, home, law, medicine, military, mind,
  music, nature, politics, religion, science, sports, technology, time,
  transport, travel, work

Usage:
    python scripts/data/canonicalize_domains.py [--dry-run]
"""

import argparse, json, sqlite3
from pathlib import Path
from collections import Counter

SCRIPT_DIR   = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent
JSONL_PATH   = PROJECT_ROOT / 'data' / 'curated' / 'spanish_curated.jsonl'
DB_PATH      = PROJECT_ROOT / 'data' / 'vocabulary.db'

# ── Merge table: old domain → canonical domain (None = drop) ──────────────────
MERGE: dict[str, str | None] = {
    # Art / culture cluster
    'art_culture':   'art',
    'culture':       'art',
    'film':          'art',
    'theatre':       'art',
    'entertainment': 'art',
    'history':       'art',
    'architecture':  'art',

    # Music stays but audio folds in
    'audio':         'music',

    # Emotions
    'emotion':       'emotions',

    # Sports
    'sport':         'sports',
    'games':         'sports',

    # Food absorbs drink
    'drink':         'food',

    # Law cluster
    'crime':         'law',
    'legal':         'law',
    'police':        'law',

    # Government / politics
    'government':    'politics',
    'royalty':       'politics',

    # Work / economy cluster
    'business':      'work',
    'commerce':      'work',
    'finance':       'work',
    'administration':'work',
    'industry':      'work',
    'retail':        'work',

    # Home cluster
    'furniture':     'home',
    'housing':       'home',
    'hotel':         'travel',

    # Technology
    'internet':      'technology',
    'media':         'technology',

    # Nature
    'weather':       'nature',
    'fishing':       'nature',
    'space':         'science',

    # Education / mind
    'academic':      'education',
    'language':      'education',
    'physics':       'science',
    'maths':         'science',
    'philosophy':    'mind',
    'ethics':        'mind',
    'mind_thought':  'mind',

    # Clothing
    'fashion':       'clothing',

    # Communication
    'journalism':    'communication',

    # Religion
    'holiday':       'religion',
    'supernatural':  'religion',

    # Geography
    'place':         'geography',
    'city':          'geography',
    'direction':     'geography',

    # Drop — too vague or tiny
    'everyday':      None,
    'colloquial':    None,
    'social':        None,
    'events':        None,
    'logistics':     None,
    'measurement':   None,
    'nightlife':     None,
    'emergency':     'medicine',
    'administration':None,  # overridden below by 'work'
    'location':      None,
    'sport_':        None,
    'finance_':      None,
}

# Fix duplicate key collision (Python dicts keep last value)
MERGE['administration'] = 'work'

# ── Medicine words: Spanish words that should get 'medicine' domain ────────────
# These move OUT of 'health' into 'medicine'
MEDICINE_WORDS = {
    'doctor','médico','médica','hospital','enfermero','enfermera',
    'cirujano','cirujana','farmacia','pastilla','medicina','vacuna',
    'ambulancia','emergencia','operación','paciente','receta',
    'diagnóstico','síntoma','clínica','antibiótico','medicamento',
    'dosis','quirúrgico','anestesia','jeringa','radiografía',
    'especialista','pediatra','psiquiatra','terapeuta','dentista',
    'oculista','óptico','ortopedista','cardiólogo','oncólogo',
    'neurológico','tratamiento','cirugía','biopsia','sutura',
    'intravenoso','transfusión','donante','trasplante','prótesis',
}

# Body-part words that are in 'health' but belong in 'body'
BODY_WORDS_IN_HEALTH = {
    'sangre','cerebro','hueso','músculo','pulmón','riñón','hígado',
    'vejiga','páncreas','apéndice','tráquea','esófago',
}

CANONICAL = {
    'animals','art','body','clothing','communication','education',
    'emotions','family','food','geography','health','home','law',
    'medicine','military','mind','music','nature','politics',
    'religion','science','sports','technology','time','transport',
    'travel','work','essential','grammar',
}


def canonicalize(domains: list[str], word: str) -> list[str]:
    """Map a word's existing domain list to canonical domains."""
    result: set[str] = set()

    for d in domains:
        if d in CANONICAL:
            result.add(d)
        elif d in MERGE:
            target = MERGE[d]
            if target:
                result.add(target)
        # else: unknown domain not in merge table → drop

    # Health → medicine / body split
    if 'health' in result:
        if word in MEDICINE_WORDS:
            result.discard('health')
            result.add('medicine')
        elif word in BODY_WORDS_IN_HEALTH:
            result.discard('health')
            result.add('body')

    # Words that should have medicine regardless of current domains
    if word in MEDICINE_WORDS and 'medicine' not in result:
        result.add('medicine')

    return sorted(result)


def run(dry_run: bool = False) -> None:
    entries = [json.loads(l) for l in open(JSONL_PATH, encoding='utf-8') if l.strip()]

    changed = 0
    domain_counts_before = Counter()
    domain_counts_after  = Counter()

    for e in entries:
        old = e.get('domains') or []
        for d in old: domain_counts_before[d] += 1

        new = canonicalize(old, e.get('word', ''))
        for d in new: domain_counts_after[d] += 1

        if new != old:
            if not dry_run:
                e['domains'] = new
            changed += 1

    print(f'Entries changed: {changed}/{len(entries)}')

    # Diff
    all_domains = set(domain_counts_before) | set(domain_counts_after)
    print('\nDomain changes:')
    for d in sorted(all_domains):
        b = domain_counts_before.get(d, 0)
        a = domain_counts_after.get(d, 0)
        if b != a:
            arrow = '+' if a > b else '-' if a < b else '='
            print(f'  {arrow} {d:20s}: {b:5d} → {a:5d}')

    if dry_run:
        print('\n[DRY RUN]'); return

    with open(JSONL_PATH, 'w', encoding='utf-8') as f:
        for e in entries:
            f.write(json.dumps(e, ensure_ascii=False) + '\n')
    print('JSONL updated')

    conn = sqlite3.connect(str(DB_PATH))
    db_updated = 0
    with conn:
        for e in entries:
            r = conn.execute(
                "UPDATE words SET domains=?, updated_at=CURRENT_TIMESTAMP "
                "WHERE word=? AND language='spanish'",
                (json.dumps(e['domains'], ensure_ascii=False), e['word'])
            ).rowcount
            db_updated += r
    conn.close()
    print(f'DB rows updated: {db_updated}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true')
    run(parser.parse_args().dry_run)
