#!/usr/bin/env python3
"""
review_glosses.py - Gloss review helper
========================================
Scans the gloss cache for suspect entries and writes them to a JSONL report
so they can be reviewed and corrected manually.

Usage:
    python backend/scripts/data/review_glosses.py --lang spa
    python backend/scripts/data/review_glosses.py --lang spa --source google empty
    python backend/scripts/data/review_glosses.py --lang spa --apply corrections.jsonl
"""

import argparse
import json
import re
import sys
from pathlib import Path

SCRIPT_DIR   = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent.parent
CACHE_DIR    = PROJECT_ROOT / 'data' / 'gloss_cache'
PRESEED_DIR  = PROJECT_ROOT / 'data' / 'preseed'

LANG_NAMES = {'spa': 'Spanish', 'fra': 'French', 'ita': 'Italian', 'por': 'Portuguese'}
LANG_FULL  = {'spa': 'spanish', 'fra': 'french', 'ita': 'italian', 'por': 'portuguese'}

_KNOWN_PROPER_TARGETS = {
    'enero','febrero','marzo','abril','mayo','junio','julio','agosto',
    'septiembre','octubre','noviembre','diciembre',
    'lunes','martes','miercoles','jueves','viernes','sabado','domingo',
    'ingles','espanol','frances','aleman','italiano','portugues',
    'europeo','americano','estadounidense',
}


def load_cache(lang):
    path = CACHE_DIR / f'gloss_cache_{lang}.jsonl'
    if not path.exists():
        print(f"No cache found: {path}"); sys.exit(1)
    cache = {}
    for line in path.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if not line: continue
        row  = json.loads(line)
        word = row.pop('word', None)
        if word: cache[word] = row
    return cache


def save_cache(lang, cache):
    path = CACHE_DIR / f'gloss_cache_{lang}.jsonl'
    with path.open('w', encoding='utf-8') as f:
        for word, entry in cache.items():
            f.write(json.dumps({'word': word, **entry}, ensure_ascii=False) + '\n')


def load_preseed_glosses(lang):
    path = PRESEED_DIR / f'{LANG_FULL[lang]}_preseed.jsonl'
    if not path.exists(): return {}
    result = {}
    for line in path.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if not line: continue
        try:
            entry = json.loads(line)
            word  = entry.get('word', '')
            if word: result[word] = entry.get('glosses', [])
        except json.JSONDecodeError:
            continue
    return result


def is_suspect(word, entry):
    glosses = entry.get('glosses', [])
    source  = entry.get('source', 'unknown')
    if entry.get('reviewed'): return False, ''
    if not glosses: return True, f'empty ({source})'
    gloss_text = ' '.join(glosses)
    if any(g == g.upper() and g.isalpha() and len(g) > 1 for g in glosses):
        return True, f'all-caps: {glosses}'
    if source == 'google' and len(glosses) == 1 and glosses[0].lower() == word.lower():
        return True, f'google echo: {glosses}'
    if source == 'google' and len(glosses) == 1 and len(glosses[0].split()) > 3:
        return True, f'google phrase: {glosses}'
    if re.search(r'[aeiouaeiouaeioucaeos]', gloss_text, re.IGNORECASE):
        pass  # skip non-English char check to avoid false positives with loanwords
    if len(glosses) == 1 and len(glosses[0]) == 1:
        return True, f'single-char gloss: {glosses}'
    if (glosses and glosses[0][0].isupper() and not word[0].isupper()
            and source == 'google' and word not in _KNOWN_PROPER_TARGETS):
        return True, f'unexpected caps: {glosses}'
    return False, ''


def run(lang, source_filter=None, limit=None):
    lang_name       = LANG_NAMES[lang]
    cache           = load_cache(lang)
    preseed_glosses = load_preseed_glosses(lang)

    suspects = []
    for word, entry in cache.items():
        flagged, reason = is_suspect(word, entry)
        if not flagged: continue
        src = entry.get('source', 'unknown')
        if source_filter and src not in source_filter: continue
        suspects.append({'id': 0, 'word': word, 'cache': entry.get('glosses', []),
                         'preseed': preseed_glosses.get(word, []), 'source': src,
                         'reason': reason, 'fix': []})

    if limit: suspects = suspects[:limit]
    for i, s in enumerate(suspects, start=1): s['id'] = i

    print(f"Lang     : {lang_name}")
    print(f"Cache    : {len(cache):,} entries")
    print(f"Preseed  : {len(preseed_glosses):,} entries loaded")
    print(f"Suspect  : {len(suspects):,} entries\n")
    if not suspects: print("Nothing flagged."); return

    by_reason = {}
    for s in suspects:
        key = s['reason'].split(':')[0].strip()
        by_reason[key] = by_reason.get(key, 0) + 1
    for reason, count in sorted(by_reason.items(), key=lambda x: -x[1]):
        print(f"  {count:>5}  {reason}")

    report_path = CACHE_DIR / f'review_{lang}.jsonl'
    with report_path.open('w', encoding='utf-8') as f:
        for s in suspects:
            f.write(json.dumps(s, ensure_ascii=False) + '\n')

    print(f"\nReport   : {report_path}  ({len(suspects)} entries)")
    print( "Next     : paste into Claude, fill in 'fix', then run --apply")


def apply_corrections(lang, corrections_path):
    cache = load_cache(lang)
    corrections = []
    for line in Path(corrections_path).read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if line: corrections.append(json.loads(line))

    updated = skipped = 0
    for item in corrections:
        word = item.get('word')
        fix  = item.get('fix')
        if not word or word not in cache: continue
        if fix:
            cache[word]['glosses']  = fix
            cache[word]['source']   = 'reviewed'
            cache[word]['reviewed'] = True
            updated += 1
        else:
            cache[word]['reviewed'] = True
            skipped += 1

    save_cache(lang, cache)
    print(f"Applied  : {updated} corrected, {skipped} marked OK")
    print(f"Next     : re-run clean_wikicorpora.py to rebuild the preseed")


def main():
    parser = argparse.ArgumentParser(description='Gloss cache review helper.')
    parser.add_argument('--lang', required=True, choices=list(LANG_NAMES))
    parser.add_argument('--source', nargs='+',
                        choices=['wiktionary', 'google', 'empty', 'unknown'])
    parser.add_argument('--limit', type=int, default=None)
    parser.add_argument('--apply', metavar='FILE')
    args = parser.parse_args()
    if args.apply:
        apply_corrections(args.lang, args.apply)
    else:
        run(args.lang, source_filter=args.source, limit=args.limit)


if __name__ == '__main__':
    main()
