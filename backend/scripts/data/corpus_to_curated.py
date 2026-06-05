#!/usr/bin/env python3
"""
corpus_to_curated.py
====================
Extracts new words from the OpenSubtitles frequency corpus that aren't already
in the curated file, fetches English glosses, then appends them to
spanish_curated.jsonl with needs_review: true.

Run in batches (Wiktionary/Google Translate are rate-limited):
    python backend/scripts/data/corpus_to_curated.py --batch 100
    python backend/scripts/data/corpus_to_curated.py --batch 100   # run again for more

Glosses are cached to disk so re-runs skip already-fetched words.

Options:
    --batch N        Max new entries to append per run (default: 100)
    --min-count N    Min OS corpus occurrences to consider a word (default: 100)
    --top N          Read top-N from corpus (default: 10000)
    --no-translate   Use Wiktionary only, skip Google Translate fallback
    --dry-run        Show candidates without writing anything
"""

import argparse
import json
import sys
import time
import warnings
from pathlib import Path
from typing import Dict, List, Optional, Tuple

warnings.filterwarnings("ignore")

SCRIPT_DIR   = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent.parent
CURATED_PATH = PROJECT_ROOT / 'data' / 'curated' / 'spanish_curated.jsonl'
OS_DIR       = PROJECT_ROOT / 'data' / 'opensubtitles_freq_corpora'
CACHE_DIR    = PROJECT_ROOT / 'data' / 'gloss_cache'

if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from lang_config import rank_to_difficulty

LANG      = 'spa'
LANG_NAME = 'spanish'
SPACY_MODEL = 'es_core_news_sm'


# ── Gloss cache ────────────────────────────────────────────────────────────────

def _cache_path() -> Path:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    return CACHE_DIR / f'gloss_cache_{LANG}.jsonl'


def load_cache() -> Dict[str, dict]:
    path = _cache_path()
    cache: Dict[str, dict] = {}
    if not path.exists():
        return cache
    with open(path, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    entry = json.loads(line)
                    cache[entry['word']] = entry
                except Exception:
                    pass
    return cache


def save_to_cache(word: str, glosses: List[str], source: str, cache: Dict[str, dict]) -> None:
    entry = {'word': word, 'glosses': glosses, 'source': source}
    cache[word] = entry
    with open(_cache_path(), 'a', encoding='utf-8') as f:
        f.write(json.dumps(entry, ensure_ascii=False) + '\n')


# ── Gloss fetching ─────────────────────────────────────────────────────────────

def fetch_wiktionary(word: str) -> Optional[List[str]]:
    """Try to get English definitions from Wiktionary."""
    try:
        from wiktionaryparser import WiktionaryParser
        parser = WiktionaryParser()
        parser.set_default_language('spanish')
        result = parser.fetch(word, 'spanish')
        glosses = []
        for entry in result:
            for definition in entry.get('definitions', []):
                for text in definition.get('text', []):
                    text = text.strip()
                    if text and len(text) > 1 and not text.startswith('('):
                        # Clean up common Wiktionary noise
                        text = text.split('(')[0].strip().rstrip('.')
                        if text and 2 < len(text) < 60:
                            glosses.append(text)
        return glosses[:4] if glosses else None
    except Exception:
        return None


def fetch_google(word: str) -> Optional[List[str]]:
    """Translate word using Google Translate as fallback."""
    try:
        from deep_translator import GoogleTranslator
        result = GoogleTranslator(source='es', target='en').translate(word)
        if result and result.lower() != word.lower():
            return [result]
        return None
    except Exception:
        return None


def get_glosses(
    word: str,
    cache: Dict[str, dict],
    no_translate: bool = False,
) -> Tuple[List[str], str]:
    """
    Return (glosses, source) for a word.
    Tries cache → Wiktionary → Google Translate.
    Returns ([''], 'empty') if nothing found.
    """
    if word in cache:
        c = cache[word]
        return c.get('glosses', []), c.get('source', 'cache')

    time.sleep(0.3)  # polite rate limiting

    glosses = fetch_wiktionary(word)
    if glosses:
        save_to_cache(word, glosses, 'wiktionary', cache)
        return glosses, 'wiktionary'

    if not no_translate:
        time.sleep(0.5)
        glosses = fetch_google(word)
        if glosses:
            save_to_cache(word, glosses, 'google', cache)
            return glosses, 'google'

    save_to_cache(word, [], 'empty', cache)
    return [], 'empty'


# ── Curated entry builder ──────────────────────────────────────────────────────

def rank_to_band(rank: Optional[int]) -> str:
    if not rank:
        return 'C2'
    for threshold, band in [(200, 'A1'), (500, 'A2'), (1000, 'B1'), (2000, 'B2'), (4000, 'C1')]:
        if rank <= threshold:
            return band
    return 'C2'


def build_curated_entry(
    word: str,
    pos: str,
    corpus_rank: int,
    corpus_count: int,
    glosses: List[str],
    curated_rank: int,
    infinitive: Optional[str] = None,
    gender: Optional[str] = None,
) -> dict:
    display  = glosses[0] if glosses else word
    band     = rank_to_band(curated_rank)
    diff     = rank_to_difficulty(curated_rank)

    # Infer a default conjugation class from the infinitive ending.
    # Spanish verbs will be flagged needs_review=True so a human can correct it.
    conj_class = None
    if pos == 'verb':
        inf = infinitive or word
        if inf.endswith('ar'):
            conj_class = 'regular-ar'
        elif inf.endswith('er'):
            conj_class = 'regular-er'
        elif inf.endswith('ir') or inf.endswith('ír'):
            conj_class = 'regular-ir'

    return {
        'rank':       curated_rank,
        'word':       word,
        'translation':    display,
        'pos':        pos,
        'difficulty': diff,
        'tags':       ['corpus'],
        'notes':      '',
        'glosses':    glosses,
        'examples':   [],
        'linguistic': {
            'infinitive':        infinitive or (word if pos == 'verb' else None),
            'reflexive':         None,
            'gender':            gender,
            'plural':            None,
            'register':          'neutral',
            'ipa':               '',
            'syllables':         [],
            'conjugation_class': conj_class,
            'overrides':         {},
            'irregular':         False,
        },
        'relations': {
            'commonly_confused_with': [],
            'related':   [],
            'synonyms':  [],
            'antonyms':  [],
        },
        'frequency': {
            'band':            band,
            'rank':            curated_rank,
            'corpus_frequency': corpus_count,
        },
        'domains':      ['general'],
        'register':     'neutral',
        'lang':         LANG_NAME,
        'source':       'corpus',
        'needs_review': True,
    }


# ── Corpus extraction ──────────────────────────────────────────────────────────

def extract_candidates(
    skip_words: set,
    top_n: int,
    min_count: int,
    verbose: bool,
) -> List[dict]:
    """
    Run corpus extraction via corpus_builder + spaCy.
    Returns list of candidate dicts with word/pos/corpus_rank/corpus_count.
    """
    try:
        import spacy
        from corpus_builder import (
            build_corpus_entries, find_os_corpus_file,
            read_top_n_os, load_os_ranks,
        )
    except ImportError as e:
        print(f'Missing dependency: {e}')
        print('Install: pip install spacy && python -m spacy download es_core_news_sm')
        sys.exit(1)

    try:
        nlp = spacy.load(SPACY_MODEL)
    except OSError:
        print(f'spaCy model not found. Run: python -m spacy download {SPACY_MODEL}')
        sys.exit(1)

    filepath = find_os_corpus_file(LANG, OS_DIR)
    if not filepath:
        print(f'No OpenSubtitles file found for {LANG} in {OS_DIR}')
        sys.exit(1)

    corpus_ranks = load_os_ranks(LANG, OS_DIR)
    rows = read_top_n_os(filepath, top_n, min_count=min_count)
    print(f'Corpus   : {len(rows):,} tokens read (min_count={min_count})')

    entries, _ = build_corpus_entries(
        rows, LANG, nlp,
        corpus_ranks=corpus_ranks,
        skip_words=skip_words,
        verbose=verbose,
        source='os_corpus',
    )
    print(f'Candidates: {len(entries)} new open-class words after filtering')
    return entries


# ── Main ───────────────────────────────────────────────────────────────────────

def main(
    batch: int = 100,
    min_count: int = 100,
    top_n: int = 10_000,
    no_translate: bool = False,
    dry_run: bool = False,
    verbose: bool = False,
) -> None:
    # ── Load existing curated ──────────────────────────────────────────────
    curated: List[dict] = []
    with open(CURATED_PATH, encoding='utf-8') as f:
        for lineno, line in enumerate(f, 1):
            line = line.strip()
            if line:
                try:
                    curated.append(json.loads(line))
                except json.JSONDecodeError as e:
                    print(f'  Warning: skipping line {lineno}: {e}')

    skip_words  = {e['word'].lower() for e in curated}
    next_rank   = max((e.get('rank') or 0 for e in curated), default=0) + 1
    print(f'Curated  : {len(curated)} existing entries (next rank: {next_rank})')

    if dry_run:
        print('(dry-run — no files will be written)\n')

    # ── Extract corpus candidates ──────────────────────────────────────────
    candidates = extract_candidates(skip_words, top_n, min_count, verbose)

    if not candidates:
        print('No new candidates found.')
        return

    # ── Load gloss cache ───────────────────────────────────────────────────
    cache = load_cache()
    print(f'Cache    : {len(cache)} previously fetched glosses\n')

    # ── Process in batch ───────────────────────────────────────────────────
    new_entries: List[dict] = []
    skipped_no_gloss = 0

    for i, candidate in enumerate(candidates):
        if len(new_entries) >= batch:
            break

        word       = candidate.get('word', '')
        pos        = candidate.get('pos', 'other')
        freq       = candidate.get('frequency', {})
        corp_rank  = freq.get('corpus_rank') or freq.get('rank') or i + 1
        corp_count = freq.get('corpus_frequency') or 0
        ling       = candidate.get('linguistic') or {}
        infinitive = ling.get('infinitive')
        gender     = ling.get('gender')

        # Skip if pos is unhelpful
        if pos not in ('noun', 'verb', 'adjective', 'adverb'):
            continue

        glosses, source = get_glosses(word, cache, no_translate)

        if not glosses:
            skipped_no_gloss += 1
            if verbose:
                print(f'  SKIP (no gloss): {word}')
            continue

        entry = build_curated_entry(
            word=word,
            pos=pos,
            corpus_rank=corp_rank,
            corpus_count=corp_count,
            glosses=glosses,
            curated_rank=next_rank,
            infinitive=infinitive,
            gender=gender,
        )
        new_entries.append(entry)
        next_rank += 1

        status = '✓' if source != 'empty' else '?'
        print(f'  {status} [{len(new_entries):3d}/{batch}] {word:22s} → {glosses[0]}  ({source})')

    print(f'\nNew entries  : {len(new_entries)}')
    print(f'No gloss skip: {skipped_no_gloss}')

    if not new_entries or dry_run:
        return

    # ── Append to curated JSONL ────────────────────────────────────────────
    with open(CURATED_PATH, 'a', encoding='utf-8') as f:
        for entry in new_entries:
            f.write(json.dumps(entry, ensure_ascii=False) + '\n')

    print(f'Appended : {len(new_entries)} entries to {CURATED_PATH.name}')
    print(f'\nNext steps:')
    print(f'  1. python backend/scripts/data/sync_db.py --langs spa')
    print(f'  2. Review entries flagged needs_review: true in the admin panel')
    print(f'  3. Run this script again to add another batch')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(
        description='Extract corpus words → fetch glosses → append to spanish_curated.jsonl',
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument('--batch', type=int, default=100, metavar='N',
                        help='Max new entries to append per run (default: 100)')
    parser.add_argument('--min-count', type=int, default=100, metavar='N',
                        help='Min OS corpus occurrences (default: 100)')
    parser.add_argument('--top', type=int, default=10_000, metavar='N',
                        help='Read top-N tokens from corpus (default: 10000)')
    parser.add_argument('--no-translate', action='store_true',
                        help='Wiktionary only, skip Google Translate fallback')
    parser.add_argument('--dry-run', action='store_true',
                        help='Show candidates without writing anything')
    parser.add_argument('--verbose', action='store_true',
                        help='Extra logging')
    args = parser.parse_args()

    main(
        batch=args.batch,
        min_count=args.min_count,
        top_n=args.top,
        no_translate=args.no_translate,
        dry_run=args.dry_run,
        verbose=args.verbose,
    )
