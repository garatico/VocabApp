#!/usr/bin/env python3
"""
check_visual_coverage.py
========================
Reports which Spanish words have no visual representation in Picture Quiz mode.

A word is considered "covered" if any of the following is true:
  1. It appears in visual-map.ts CONCEPTS array (has SVG/emoji)
  2. It appears in visual-map.ts IMAGES dict (has a local photo)
  3. It has an emoji field set in the JSONL entry

Run from the project root:
    python scripts/check_visual_coverage.py
    python scripts/check_visual_coverage.py --top 50       # show top 50 gaps
    python scripts/check_visual_coverage.py --domain animals food
    python scripts/check_visual_coverage.py --pos noun verb
    python scripts/check_visual_coverage.py --covered       # show what IS covered
"""

import argparse
import json
import re
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path

SCRIPT_DIR   = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent
VISUAL_MAP   = PROJECT_ROOT / 'src' / 'client' / 'data' / 'visual-map.ts'
CURATED_DIR  = PROJECT_ROOT / 'data' / 'curated'

if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from lang_config import LANG_NAMES as LANGS


def norm(s: str) -> str:
    """Normalise a word the same way visual-map.ts does."""
    return (
        unicodedata.normalize('NFD', s.lower().strip())
        .encode('ascii', 'ignore')
        .decode()
        .replace(' ', ' ')  # collapse internal spaces
    )


def parse_visual_map(lang: str = 'spanish') -> tuple[set, set]:
    """
    Parse visual-map.ts and return:
      (concepts_words, image_words)
    where each is a set of normalised words that have a visual.
    """
    content = VISUAL_MAP.read_text(encoding='utf-8')

    # ── CONCEPTS array: words with SVG or emoji ──────────────────────────────
    concepts_words: set[str] = set()
    for m in re.finditer(
        rf"{lang}:\s*\[([^\]]+)\]",
        content
    ):
        for w in re.findall(r"'([^']+)'", m.group(1)):
            concepts_words.add(norm(w))

    # ── IMAGES dict: words with a local photo ────────────────────────────────
    # Extract section between "const IMAGES" and the closing "};"
    img_match = re.search(r'const IMAGES[^{]*\{(.*?)\};', content, re.DOTALL)
    image_words: set[str] = set()
    if img_match:
        for key in re.findall(r"'([^']+)'\s*:", img_match.group(1)):
            image_words.add(norm(key))

    return concepts_words, image_words


def load_jsonl(lang_code: str) -> list[dict]:
    lang_name = LANGS.get(lang_code, lang_code)
    path = CURATED_DIR / f'{lang_name}_curated.jsonl'
    if not path.exists():
        print(f'  No curated file for {lang_code}: {path}')
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


def check_coverage(
    entries: list[dict],
    concepts_words: set,
    image_words: set,
) -> tuple[list[dict], list[dict]]:
    """Split entries into (covered, uncovered)."""
    covered   = []
    uncovered = []

    for e in entries:
        w = norm(e.get('word', ''))
        has_visual = (
            w in concepts_words
            or w in image_words
            or bool(e.get('emoji'))
        )
        if has_visual:
            covered.append(e)
        else:
            uncovered.append(e)

    return covered, uncovered


def summarise(entries: list[dict], label: str) -> None:
    by_pos    = defaultdict(int)
    by_domain = defaultdict(int)
    by_band   = defaultdict(int)

    for e in entries:
        by_pos[e.get('pos') or 'unknown'] += 1
        for d in (e.get('domains') or ['none']):
            by_domain[d] += 1
        by_band[e.get('difficulty') or e.get('band') or '?'] += 1

    print(f'\n  By POS ({label}):')
    for pos, n in sorted(by_pos.items(), key=lambda x: -x[1])[:8]:
        print(f'    {pos:15s} {n}')

    print(f'\n  By domain ({label}, top 10):')
    for dom, n in sorted(by_domain.items(), key=lambda x: -x[1])[:10]:
        print(f'    {dom:20s} {n}')


def main() -> None:
    parser = argparse.ArgumentParser(
        description='Check visual-map coverage for Picture Quiz mode.'
    )
    parser.add_argument(
        '--lang', default='spa', choices=list(LANGS),
        help='Language code to check (default: spa)'
    )
    parser.add_argument(
        '--top', type=int, default=30,
        help='Number of uncovered words to show, sorted by frequency rank (default: 30)'
    )
    parser.add_argument(
        '--domain', nargs='+', metavar='DOMAIN',
        help='Filter to specific domains (e.g. --domain animals food)'
    )
    parser.add_argument(
        '--pos', nargs='+', metavar='POS',
        help='Filter to specific parts of speech (e.g. --pos noun verb)'
    )
    parser.add_argument(
        '--covered', action='store_true',
        help='Show covered words instead of gaps'
    )
    parser.add_argument(
        '--all', action='store_true',
        help='Show all uncovered words, not just --top N'
    )
    args = parser.parse_args()

    lang_name = LANGS[args.lang]
    print(f'Visual coverage check — {lang_name.upper()}')
    print(f'  visual-map.ts : {VISUAL_MAP}')

    # ── Parse visual-map ─────────────────────────────────────────────────────
    concepts_words, image_words = parse_visual_map(lang_name)
    all_covered_words = concepts_words | image_words
    print(f'  CONCEPTS words: {len(concepts_words)}')
    print(f'  IMAGES words  : {len(image_words)}')
    print(f'  Total mapped  : {len(all_covered_words)} unique words')

    # ── Load JSONL ───────────────────────────────────────────────────────────
    entries = load_jsonl(args.lang)
    if not entries:
        sys.exit(1)
    print(f'  JSONL entries : {len(entries)}')

    # ── Compute coverage ─────────────────────────────────────────────────────
    covered, uncovered = check_coverage(entries, concepts_words, image_words)
    pct = len(covered) / len(entries) * 100 if entries else 0

    print(f'\n  ✓ Covered  : {len(covered):>5}  ({pct:.1f}%)')
    print(f'  ✗ Uncovered: {len(uncovered):>5}  ({100 - pct:.1f}%)')

    # ── Apply filters ────────────────────────────────────────────────────────
    target = covered if args.covered else uncovered
    label  = 'covered' if args.covered else 'uncovered'

    if args.domain:
        target = [
            e for e in target
            if any(d in (e.get('domains') or []) for d in args.domain)
        ]
        print(f'  Filtered to domains {args.domain}: {len(target)} {label}')

    if args.pos:
        target = [e for e in target if e.get('pos') in args.pos]
        print(f'  Filtered to pos {args.pos}: {len(target)} {label}')

    # ── Summary breakdown ─────────────────────────────────────────────────────
    summarise(target, label)

    # ── Word list ─────────────────────────────────────────────────────────────
    # Sort uncovered by frequency rank (most common first = highest priority)
    target_sorted = sorted(target, key=lambda e: e.get('rank') or 9999)
    limit = len(target_sorted) if args.all else args.top

    action = 'covered' if args.covered else f'top {limit} uncovered (by frequency rank)'
    print(f'\n  {action.capitalize()} words:\n')
    print(f'  {"rank":>5}  {"word":25s}  {"translation": 25s}  {"pos":12s}  {"domains"}')
    print(f'  {"-"*5}  {"-"*25}  {"-"*25}  {"-"*12}  {"-"*20}')

    for e in target_sorted[:limit]:
        rank    = e.get('rank') or '–'
        word    = e.get('word', '')[:25]
        display = (e.get('translation') or '')[:25]
        pos     = (e.get('pos') or '')[:12]
        domains = ', '.join((e.get('domains') or []))[:30]
        print(f'  {str(rank):>5}  {word:25s}  {display:25s}  {pos:12s}  {domains}')

    if not args.all and len(target_sorted) > limit:
        print(f'\n  … and {len(target_sorted) - limit} more. Use --all to see everything.')

    # ── Sanity check: visual-map words missing from JSONL ─────────────────────
    jsonl_words = {norm(e['word']) for e in entries}
    phantom = all_covered_words - jsonl_words
    if phantom:
        print(f'\n  ⚠ {len(phantom)} visual-map entries have no matching JSONL word')
        print(f'  (stale mappings or typos):')
        for w in sorted(phantom)[:20]:
            print(f'    {w}')
        if len(phantom) > 20:
            print(f'    … and {len(phantom) - 20} more')
    else:
        print(f'\n  ✓ All visual-map entries match a JSONL word')


if __name__ == '__main__':
    main()
