#!/usr/bin/env python3
"""
run_pipeline.py  —  VocabApp data pipeline
===========================================
Edit the CONFIG block, then run this file.

Steps
-----
1. clean_wikicorpora  — Wikipedia corpus → preseed JSONL
2. enrich_preseed     — IPA / relations / register tags
3. seed_languages     — preseed JSONL → vocabulary.db
4. review_glosses     — flag suspect glosses (optional)
"""

import sys
from pathlib import Path

# ══════════════════════════════════════════════════════════════════════════════
# CONFIG
# ══════════════════════════════════════════════════════════════════════════════

LANGS = ['spa', 'fra', 'ita', 'por']   # 3-letter codes; any subset

N            = 10_000   # corpus words per language (0 = hardcoded only)
NO_TRANSLATE = False    # skip Wiktionary / Google Translate
FRESH        = False    # ignore gloss cache and re-fetch everything
BATCH        = None     # max new translations per run (None = unlimited)
VERBOSE      = False    # extra logging from corpus / conjugation steps

RUN_CLEAN   = True   # Step 1 — build preseed JSONL from corpus
RUN_ENRICH  = True   # Step 2 — apply IPA / relations / register
RUN_SEED    = True   # Step 3 — load preseed into vocabulary.db
RUN_REVIEW  = False  # Step 4 — write review_{lang}.jsonl for suspect glosses

# ══════════════════════════════════════════════════════════════════════════════
# IMPORTS
# ══════════════════════════════════════════════════════════════════════════════

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

import clean_wikicorpora  # noqa: E402
import enrich_preseed     # noqa: E402
import seed_languages     # noqa: E402
import review_glosses     # noqa: E402

_SEED_LANG_NAMES = {'spa': 'spanish', 'fra': 'french', 'ita': 'italian', 'por': 'portuguese'}

# ══════════════════════════════════════════════════════════════════════════════
# RUNNER
# ══════════════════════════════════════════════════════════════════════════════

def run():
    # ── Step 1 ───────────────────────────────────────────────────────────────
    if RUN_CLEAN:
        print("=" * 60)
        print("STEP 1  clean_wikicorpora — corpus → preseed JSONL")
        print("=" * 60)
        clean_wikicorpora.main(
            langs=LANGS, n=N, verbose=VERBOSE,
            no_translate=NO_TRANSLATE, fresh=FRESH, batch=BATCH,
        )
        print()
    else:
        print("STEP 1  clean_wikicorpora — SKIPPED\n")

    # ── Step 2 ───────────────────────────────────────────────────────────────
    if RUN_ENRICH:
        print("=" * 60)
        print("STEP 2  enrich_preseed — IPA / relations / register")
        print("=" * 60)
        enrich_preseed.run(langs=LANGS)
        print()
    else:
        print("STEP 2  enrich_preseed — SKIPPED\n")

    # ── Step 3 ───────────────────────────────────────────────────────────────
    if RUN_SEED:
        print("=" * 60)
        print("STEP 3  seed_languages — preseed JSONL → vocabulary.db")
        print("=" * 60)
        seed_languages.main(langs=[_SEED_LANG_NAMES[l] for l in LANGS if l in _SEED_LANG_NAMES])
        print()
    else:
        print("STEP 3  seed_languages — SKIPPED\n")

    # ── Step 4 ───────────────────────────────────────────────────────────────
    if RUN_REVIEW:
        print("=" * 60)
        print("STEP 4  review_glosses — flagging suspect entries")
        print("=" * 60)
        for lang in LANGS:
            print(f"\n── {lang} ──")
            review_glosses.run(lang, source_filter=['google', 'empty'])
        print()
    else:
        print("STEP 4  review_glosses — SKIPPED\n")

    print("Pipeline complete.")


if __name__ == '__main__':
    run()
