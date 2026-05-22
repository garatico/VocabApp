#!/usr/bin/env python3
"""
enrich_preseed.py  —  Apply curated enrichment to preseed JSONL files
======================================================================
Reads existing preseed JSONL files and applies IPA, relations (synonyms /
antonyms / related words), and register tags using the hand-curated data
modules. All passes are additive — existing values are never overwritten.

Run directly:
    python backend/scripts/data/enrich_preseed.py
    python backend/scripts/data/enrich_preseed.py --langs spa fra

Called by run_pipeline.py as Step 2.
"""

import argparse
import json
import sys
from pathlib import Path
from typing import List

_HERE        = Path(__file__).resolve().parent
PROJECT_ROOT = _HERE.parent.parent.parent
PRESEED_DIR  = PROJECT_ROOT / 'data' / 'preseed'

sys.path.insert(0, str(_HERE))
from ipa_data       import get_ipa        # noqa: E402
from relations_data import get_relations  # noqa: E402
from register_data  import get_register   # noqa: E402

LANG_NAMES = {
    'spa': 'spanish',
    'fra': 'french',
    'ita': 'italian',
    'por': 'portuguese',
}


# ══════════════════════════════════════════════════════════════════════════════
# HELPERS
# ══════════════════════════════════════════════════════════════════════════════

def _read_jsonl(path: Path) -> List[dict]:
    entries = []
    with open(path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line:
                entries.append(json.loads(line))
    return entries


def _write_jsonl(path: Path, entries: List[dict]) -> None:
    with open(path, 'w', encoding='utf-8') as f:
        for entry in entries:
            f.write(json.dumps(entry, ensure_ascii=False) + '\n')


# ══════════════════════════════════════════════════════════════════════════════
# ENRICHMENT PASSES
# ══════════════════════════════════════════════════════════════════════════════

def _apply_ipa(entries: List[dict], lang: str) -> int:
    applied = 0
    for entry in entries:
        ling = entry.setdefault('linguistic', {})
        if not ling.get('ipa'):
            result = get_ipa(entry['word'], lang)
            if result:
                ling['ipa'] = result
                applied += 1
    return applied


def _apply_relations(entries: List[dict], lang: str) -> int:
    applied = 0
    for entry in entries:
        rels = entry.setdefault('relations', {})
        rel_data = get_relations(entry['word'], lang)
        if rel_data:
            changed = False
            for key, values in rel_data.items():
                if not rels.get(key):
                    rels[key] = values
                    changed = True
            if changed:
                applied += 1
    return applied


def _apply_register(entries: List[dict], lang: str) -> int:
    applied = 0
    for entry in entries:
        if entry.get('linguistic', {}).get('register', 'neutral') == 'neutral':
            reg = get_register(entry['word'], lang)
            if reg:
                entry['linguistic']['register'] = reg
                entry['register'] = reg
                applied += 1
    return applied


# ══════════════════════════════════════════════════════════════════════════════
# PUBLIC API
# ══════════════════════════════════════════════════════════════════════════════

def run(langs: List[str]) -> None:
    """
    Apply all enrichment passes to preseed JSONL files for the given languages.
    Skips any language whose preseed file doesn't exist yet.
    """
    for lang in langs:
        lang_name = LANG_NAMES.get(lang, lang)
        outpath   = PRESEED_DIR / f'{lang_name}_preseed.jsonl'

        if not outpath.exists():
            print(f"  [{lang}] preseed not found: {outpath.name} — skipping")
            continue

        print(f"── {lang} ({lang_name}) " + "─" * 44)
        entries = _read_jsonl(outpath)
        print(f"  Loaded    : {len(entries)} entries")

        n = _apply_ipa(entries, lang)
        if n: print(f"  IPA       : {n} entries tagged")

        n = _apply_relations(entries, lang)
        if n: print(f"  Relations : {n} entries tagged")

        n = _apply_register(entries, lang)
        if n: print(f"  Register  : {n} entries tagged")

        _write_jsonl(outpath, entries)
        print(f"  Written   : {outpath.name}\n")


# ══════════════════════════════════════════════════════════════════════════════
# CLI
# ══════════════════════════════════════════════════════════════════════════════

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Enrich preseed JSONL files.')
    parser.add_argument(
        '--langs', nargs='+', default=list(LANG_NAMES),
        metavar='LANG', help='3-letter language codes (default: all)'
    )
    args = parser.parse_args()

    unknown = [l for l in args.langs if l not in LANG_NAMES]
    if unknown:
        print(f'Unknown language(s): {", ".join(unknown)}')
        print(f'Valid choices: {", ".join(LANG_NAMES)}')
        sys.exit(1)

    run(args.langs)
    print("Done.")
