#!/usr/bin/env python3
"""
run_pipeline.py  —  Full VocabApp data pipeline runner
=======================================================
Calls the main methods of the other pipeline scripts in the correct order:

    1. clean_wikicorpora.main()  — corpus → preseed JSONL
    2. seed_languages.main()     — preseed JSONL → vocabulary.db
    3. review_glosses.run()      — (optional) flag suspect glosses

Edit the CONFIG block below, then hit Run (▶) in VS Code.
"""

import sys
from pathlib import Path

# ══════════════════════════════════════════════════════════════════════════════
# CONFIG  —  edit these before running
# ══════════════════════════════════════════════════════════════════════════════

# Which languages to process (choose any subset).
LANGS = ['spa', 'fra', 'ita', 'por']

# 3-letter code → full name used by seed_languages.py
LANG_NAMES = {'spa': 'spanish', 'fra': 'french', 'ita': 'italian', 'por': 'portuguese'}

# How many corpus words to pull per language (0 = hardcoded entries only).
N = 10_000

# Set True to skip Wiktionary / Google Translate lookups entirely.
NO_TRANSLATE = False

# Set True to ignore the existing gloss cache and re-fetch everything.
FRESH = False

# Limit translation to this many new words per run (None = unlimited).
BATCH = None

# Extra logging from corpus / conjugation steps.
VERBOSE = False

# ── Step toggles ──────────────────────────────────────────────────────────────

# Run clean_wikicorpora → writes preseed JSONL files.
RUN_CLEAN = True

# Run seed_languages → loads preseed JSONL into vocabulary.db.
RUN_SEED = True

# Run review_glosses after cleaning — writes review_{lang}.jsonl for each lang.
# Only flags 'google' and 'empty' source entries by default.
RUN_REVIEW = False

# ══════════════════════════════════════════════════════════════════════════════
# IMPORTS
# ══════════════════════════════════════════════════════════════════════════════

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

import clean_wikicorpora  # noqa: E402
import seed_languages      # noqa: E402
import review_glosses      # noqa: E402


# ══════════════════════════════════════════════════════════════════════════════
# RUNNER
# ══════════════════════════════════════════════════════════════════════════════

def run():
    # ── Step 1: Generate preseed JSONL ────────────────────────────────────────
    if RUN_CLEAN:
        print("=" * 60)
        print("STEP 1  clean_wikicorpora — building preseed JSONL")
        print("=" * 60)
        clean_wikicorpora.main(
            langs=LANGS,
            n=N,
            verbose=VERBOSE,
            no_translate=NO_TRANSLATE,
            fresh=FRESH,
            batch=BATCH,
        )
        print()
    else:
        print("STEP 1  clean_wikicorpora — SKIPPED\n")

    # ── Step 2: Load preseed into SQLite ──────────────────────────────────────
    if RUN_SEED:
        print("=" * 60)
        print("STEP 2  seed_languages — loading into vocabulary.db")
        print("=" * 60)
        seed_languages.main(langs=[LANG_NAMES[l] for l in LANGS if l in LANG_NAMES])
        print()
    else:
        print("STEP 2  seed_languages — SKIPPED\n")

    # ── Step 3: Flag suspect glosses ─────────────────────────────────────────
    if RUN_REVIEW:
        print("=" * 60)
        print("STEP 3  review_glosses — scanning for suspect entries")
        print("=" * 60)
        for lang in LANGS:
            print(f"\n── {lang} ──")
            review_glosses.run(lang, source_filter=['google', 'empty'])
        print()
    else:
        print("STEP 3  review_glosses — SKIPPED\n")

    print("Pipeline complete.")


if __name__ == '__main__':
    run()
