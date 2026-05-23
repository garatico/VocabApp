#!/usr/bin/env python3
"""
run_pipeline.py  --  VocabApp data pipeline
===========================================
Edit the CONFIG block to set persistent defaults, or pass CLI flags to
override for a one-off run without touching the file.

Steps
-----
1. clean_wikicorpora  -- frequency corpus -> preseed JSONL
2. enrich_preseed     -- IPA / relations / register tags
3. seed_languages     -- preseed JSONL -> vocabulary.db
4. review_glosses     -- flag suspect glosses (optional)

Corpus sources
--------------
  'wikipedia'     -> data/preseed/{lang}_preseed.jsonl       (default)
  'opensubtitles' -> data/preseed/{lang}_preseed_os.jsonl

Examples
--------
  # Run everything with defaults
  python run_pipeline.py

  # OpenSubtitles, Spanish only, skip DB seed
  python run_pipeline.py --corpus opensubtitles --langs spa --no-seed

  # Quick test: hardcoded entries only, no translation
  python run_pipeline.py --n 0 --no-translate --no-enrich --no-seed

  # Rebuild glosses from scratch (ignore cache), 100 at a time
  python run_pipeline.py --fresh --batch 100

  # Wikipedia, top 5000 words, verbose
  python run_pipeline.py --corpus wikipedia --wiki-n 5000 --verbose
"""

import argparse
import sys
from pathlib import Path

# ======================================================================
# CONFIG  --  edit these as your persistent defaults
# ======================================================================

LANGS        = ['spa']  # 3-letter codes; any subset
# LANGS        = ['spa', 'fra', 'ita', 'por']  # 3-letter codes; any subset
CORPUS       = 'opensubtitles'               # 'wikipedia' or 'opensubtitles'
WIKI_N       = 10_000   # wikipedia: top-N words per language (0 = hardcoded only)
OS_N         = 10_000   # opensubtitles: top-N words per language (0 = hardcoded only)
OS_MIN_COUNT = 500      # opensubtitles: skip words below this occurrence count
NO_TRANSLATE = False    # skip Wiktionary / Google Translate
FRESH        = False    # ignore gloss cache and re-fetch everything
BATCH        = None     # max new translations per run (None = unlimited)
VERBOSE      = False    # extra logging from corpus / conjugation steps

RUN_CLEAN   = True   # Step 1 -- build preseed JSONL from corpus
RUN_ENRICH  = True   # Step 2 -- apply IPA / relations / register
RUN_SEED    = True   # Step 3 -- load preseed into vocabulary.db
RUN_REVIEW  = False  # Step 4 -- write review_{lang}.jsonl for suspect glosses

# ======================================================================
# IMPORTS
# ======================================================================

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

import clean_wikicorpora  # noqa: E402
import enrich_preseed     # noqa: E402
import seed_languages     # noqa: E402
import review_glosses     # noqa: E402

_SEED_LANG_NAMES = {
    'spa': 'spanish', 'fra': 'french',
    'ita': 'italian', 'por': 'portuguese',
}

CORPUS_SOURCES = ('wikipedia', 'opensubtitles')

# ======================================================================
# RUNNER
# ======================================================================

def run(
    langs        = LANGS,
    corpus       = CORPUS,
    wiki_n       = WIKI_N,
    os_n         = OS_N,
    os_min_count = OS_MIN_COUNT,
    no_translate = NO_TRANSLATE,
    fresh        = FRESH,
    batch        = BATCH,
    verbose      = VERBOSE,
    run_clean    = RUN_CLEAN,
    run_enrich   = RUN_ENRICH,
    run_seed     = RUN_SEED,
    run_review   = RUN_REVIEW,
):
    print("=" * 60)
    print("VocabApp pipeline")
    print(f"  langs        : {', '.join(langs)}")
    print(f"  corpus       : {corpus}")
    if corpus == 'wikipedia':
        print(f"  wiki-n       : {wiki_n:,}")
    else:
        print(f"  os-n         : {os_n:,}")
        print(f"  os-min-count : {os_min_count:,}")
    if no_translate:
        print("  translate    : disabled")
    if fresh:
        print("  fresh        : yes (cache ignored)")
    if batch:
        print(f"  batch        : {batch}")
    if verbose:
        print("  verbose      : on")
    steps = []
    if run_clean:  steps.append('1-clean')
    if run_enrich: steps.append('2-enrich')
    if run_seed:   steps.append('3-seed')
    if run_review: steps.append('4-review')
    print(f"  steps        : {', '.join(steps) or '(none)'}")
    print("=" * 60)
    print()

    # -- Step 1 ---------------------------------------------------------
    if run_clean:
        print("=" * 60)
        print(f"STEP 1  clean_wikicorpora -- {corpus} corpus -> preseed JSONL")
        print("=" * 60)
        clean_wikicorpora.main(
            langs=langs,
            corpus=corpus,
            wiki_n=wiki_n,
            os_n=os_n,
            os_min_count=os_min_count,
            no_translate=no_translate,
            fresh=fresh,
            batch=batch,
            verbose=verbose,
        )
        print()
    else:
        print("STEP 1  clean_wikicorpora -- SKIPPED\n")

    # -- Step 2 ---------------------------------------------------------
    if run_enrich:
        print("=" * 60)
        print("STEP 2  enrich_preseed -- IPA / relations / register")
        print("=" * 60)
        enrich_preseed.run(langs=langs)
        print()
    else:
        print("STEP 2  enrich_preseed -- SKIPPED\n")

    # -- Step 3 ---------------------------------------------------------
    if run_seed:
        print("=" * 60)
        print("STEP 3  seed_languages -- preseed JSONL -> vocabulary.db")
        print("=" * 60)
        seed_lang_names = [_SEED_LANG_NAMES[l] for l in langs if l in _SEED_LANG_NAMES]
        seed_languages.main(langs=seed_lang_names)
        print()
    else:
        print("STEP 3  seed_languages -- SKIPPED\n")

    # -- Step 4 ---------------------------------------------------------
    if run_review:
        print("=" * 60)
        print("STEP 4  review_glosses -- flagging suspect entries")
        print("=" * 60)
        for lang in langs:
            print(f"\n-- {lang} --")
            review_glosses.run(lang, source_filter=['google', 'empty'])
        print()
    else:
        print("STEP 4  review_glosses -- SKIPPED\n")

    print("Pipeline complete.")


# ======================================================================
# CLI
# ======================================================================

def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description='VocabApp data pipeline -- frequency corpus -> vocabulary.db',
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )

    # -- Languages ------------------------------------------------------
    p.add_argument(
        '--langs', nargs='+', default=LANGS,
        metavar='LANG',
        help=f'3-letter language codes to process (default: {" ".join(LANGS)})',
    )

    # -- Corpus ---------------------------------------------------------
    p.add_argument(
        '--corpus', choices=CORPUS_SOURCES, default=CORPUS,
        help=f'Frequency corpus source (default: {CORPUS})',
    )
    p.add_argument(
        '--wiki-n', type=int, default=WIKI_N,
        metavar='N',
        help=f'Wikipedia: top-N words per language (default: {WIKI_N}; 0 = hardcoded only)',
    )
    p.add_argument(
        '--os-n', type=int, default=OS_N,
        metavar='N',
        help=f'OpenSubtitles: top-N words per language (default: {OS_N}; 0 = hardcoded only)',
    )
    p.add_argument(
        '--n', type=int, default=None,
        metavar='N',
        help='Shorthand: sets both --wiki-n and --os-n to the same value',
    )
    p.add_argument(
        '--min-count', type=int, default=OS_MIN_COUNT,
        metavar='N',
        dest='os_min_count',
        help=f'OpenSubtitles: skip words with fewer occurrences (default: {OS_MIN_COUNT})',
    )

    # -- Translation / cache --------------------------------------------
    p.add_argument(
        '--no-translate', action='store_true', default=NO_TRANSLATE,
        help='Skip Wiktionary / Google Translate (use cache only)',
    )
    p.add_argument(
        '--fresh', action='store_true', default=FRESH,
        help='Ignore the gloss cache and re-fetch all glosses',
    )
    p.add_argument(
        '--batch', type=int, default=BATCH,
        metavar='N',
        help='Max new translations per run (default: unlimited)',
    )

    # -- Logging --------------------------------------------------------
    p.add_argument(
        '--verbose', action='store_true', default=VERBOSE,
        help='Extra logging from corpus extraction and conjugation steps',
    )

    # -- Step flags -----------------------------------------------------
    step = p.add_argument_group('step control (all on by default except --review)')
    step.add_argument(
        '--no-clean', action='store_true',
        help='Skip Step 1: corpus -> preseed JSONL',
    )
    step.add_argument(
        '--no-enrich', action='store_true',
        help='Skip Step 2: IPA / relations / register enrichment',
    )
    step.add_argument(
        '--no-seed', action='store_true',
        help='Skip Step 3: load preseed into vocabulary.db',
    )
    step.add_argument(
        '--review', action='store_true', default=RUN_REVIEW,
        help='Run Step 4: write review_{lang}.jsonl for suspect glosses',
    )

    # -- Convenience shortcuts ------------------------------------------
    shortcut = p.add_argument_group('convenience shortcuts')
    shortcut.add_argument(
        '--clean-only', action='store_true',
        help='Run Step 1 only (equivalent to --no-enrich --no-seed)',
    )
    shortcut.add_argument(
        '--seed-only', action='store_true',
        help='Run Step 3 only (equivalent to --no-clean --no-enrich)',
    )

    return p


if __name__ == '__main__':
    parser = _build_parser()
    args   = parser.parse_args()

    # --n shorthand overrides both --wiki-n and --os-n
    wiki_n = args.n if args.n is not None else args.wiki_n
    os_n   = args.n if args.n is not None else args.os_n

    # Resolve step flags
    run_clean  = RUN_CLEAN
    run_enrich = RUN_ENRICH
    run_seed   = RUN_SEED
    run_review = args.review

    if args.clean_only:
        run_clean, run_enrich, run_seed = True, False, False
    elif args.seed_only:
        run_clean, run_enrich, run_seed = False, False, True
    else:
        if args.no_clean:  run_clean  = False
        if args.no_enrich: run_enrich = False
        if args.no_seed:   run_seed   = False

    run(
        langs        = args.langs,
        corpus       = args.corpus,
        wiki_n       = wiki_n,
        os_n         = os_n,
        os_min_count = args.os_min_count,
        no_translate = args.no_translate,
        fresh        = args.fresh,
        batch        = args.batch,
        verbose      = args.verbose,
        run_clean    = run_clean,
        run_enrich   = run_enrich,
        run_seed     = run_seed,
        run_review   = run_review,
    )
