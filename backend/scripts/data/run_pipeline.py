#!/usr/bin/env python3
"""
run_pipeline.py  —  Full VocabApp data pipeline runner
=======================================================
Calls the main methods of the other pipeline scripts in the correct order:

    1. clean_wikicorpora.main()   — corpus → preseed JSONL
    2. seed_languages.main()      — preseed JSONL → vocabulary.db
    3. review_glosses.run()       — (optional) flag suspect glosses

Edit the CONFIG block below, then hit Run (▶) in VS Code.
"""

import importlib.util
import sys
from pathlib import Path

# ══════════════════════════════════════════════════════════════════════════════
# CONFIG  —  edit these before running
# ══════════════════════════════════════════════════════════════════════════════

# Which languages to process (choose any subset).
LANGS = ['spa', 'fra', 'ita', 'por']

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

# ── Step toggles ───────────────────────────────────────────────────────────────

# Run clean_wikicorpora → writes preseed JSONL files.
RUN_CLEAN = True

# Run seed-languages → loads preseed JSONL into vocabulary.db.
RUN_SEED = True

# Run review_glosses after cleaning — writes review_{lang}.jsonl for each lang.
# Only flags 'google' and 'empty' source entries by default.
RUN_REVIEW = False

# ══════════════════════════════════════════════════════════════════════════════
# LOADER  —  import scripts that can't be imported normally (hyphens in names)
# ══════════════════════════════════════════════════════════════════════════════

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))


def _load(filename: str):
    """Load a .py file by path and return its module, even if the name has hyphens."""
    path = SCRIPT_DIR / filename
    spec = importlib.util.spec_from_file_location(filename.replace('-', '_').removesuffix('.py'), path)
    mod  = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# ══════════════════════════════════════════════════════════════════════════════
# RUNNER
# ══════════════════════════════════════════════════════════════════════════════

def run():
    # ── Step 1: Generate preseed JSONL ────────────────────────────────────────
    if RUN_CLEAN:
        print("=" * 60)
        print("STEP 1  clean_wikicorpora — building preseed JSONL")
        print("=" * 60)
        clean = _load('clean_wikicorpora.py')
        clean.main(
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
        print("STEP 2  seed-languages — loading into vocabulary.db")
        print("=" * 60)
        seed = _load('seed-languages.py')
        seed.main()
        print()
    else:
        print("STEP 2  seed-languages — SKIPPED\n")

    # ── Step 3: Flag suspect glosses ─────────────────────────────────────────
    if RUN_REVIEW:
        print("=" * 60)
        print("STEP 3  review_glosses — scanning for suspect entries")
        print("=" * 60)
        review = _load('review_glosses.py')
        for lang in LANGS:
            print(f"\n── {lang} ──")
            review.run(lang, source_filter=['google', 'empty'])
        print()
    else:
        print("STEP 3  review_glosses — SKIPPED\n")

    print("Pipeline complete.")


if __name__ == '__main__':
    run()
