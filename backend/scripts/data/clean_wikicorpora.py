#!/usr/bin/env python3
"""
clean_wikicorpora.py  -  Frequency corpus -> preseed JSONL
==========================================================
Orchestrates the pipeline for one or more languages:

  1. Load hardcoded entries (function words + irregular verbs) from hardcoded_data.py
  2. Conjugate irregular verbs via corpus_builder.build_conjugations()
  3. Extract top-N open-class words from a frequency corpus via corpus_builder
  4. Merge, rank, and deduplicate all entries
  5. Fetch English glosses and classify domains via gloss_fetcher.enrich_entries()
  6. Write per-language preseed JSONL to data/preseed/

Corpus sources
--------------
  wikipedia     (default) data/wikipedia_freq_corpora/
                Output: {lang}_preseed.jsonl

  opensubtitles            data/opensubtitles_freq_corpora/
                Output: {lang}_preseed_os.jsonl

Usage:
    python backend/scripts/data/clean_wikicorpora.py
    python backend/scripts/data/clean_wikicorpora.py --corpus opensubtitles
    python backend/scripts/data/clean_wikicorpora.py --langs spa --n 5000
    python backend/scripts/data/clean_wikicorpora.py --langs spa fra ita por --n 0
    python backend/scripts/data/clean_wikicorpora.py --no-translate
    python backend/scripts/data/clean_wikicorpora.py --batch 100
    python backend/scripts/data/clean_wikicorpora.py --fresh

Dependencies:
    pip install spacy mlconjug3 deep_translator wiktionaryparser
    python -m spacy download es_core_news_sm fr_core_news_sm it_core_news_sm pt_core_news_sm
"""

import argparse
import copy
import json
import sys
import warnings
from pathlib import Path
from typing import Dict, List, Optional

warnings.filterwarnings("ignore", message=".*InconsistentVersionWarning.*")
warnings.filterwarnings("ignore", message=".*Trying to unpickle estimator.*")

sys.path.insert(0, str(Path(__file__).resolve().parent))

from lang_config      import LANG_NAMES, SPACY_MODELS              # noqa: E402
from hardcoded_data   import LANGUAGE_DATA, EMOJI_DATA              # noqa: E402
from corpus_builder   import (                                       # noqa: E402
    MLCONJUG3_AVAILABLE, MLCONJUG3_VERSION, SPACY_AVAILABLE,
    rank_to_band, rank_to_difficulty,
    build_conjugations, load_corpus_ranks,
    ensure_spacy_model, find_corpus_dir, find_words_file,
    read_top_n, build_corpus_entries,
    find_os_corpus_file, read_top_n_os, load_os_ranks,
    load_english_blocklist,
)
from gloss_fetcher    import enrich_entries                          # noqa: E402

# ==============================================================================
# PATHS
# ==============================================================================

SCRIPT_DIR          = Path(__file__).resolve().parent
PROJECT_ROOT        = SCRIPT_DIR.parent.parent.parent
WIKIPEDIA_DIR       = PROJECT_ROOT / "data" / "wikipedia_freq_corpora"
OPENSUBTITLES_DIR   = PROJECT_ROOT / "data" / "opensubtitles_freq_corpora"
OUTPUT_DIR          = PROJECT_ROOT / "data"
CACHE_DIR           = OUTPUT_DIR / "gloss_cache"
PRESEED_DIR         = OUTPUT_DIR / "preseed"
CURATED_DIR         = OUTPUT_DIR / "curated"

CORPUS_SOURCES = ("wikipedia", "opensubtitles")

# Sources that came from automated corpus extraction (as opposed to hardcoded
# function words, irregular verbs, or manually curated entries).
_CORPUS_SOURCES = {"os_corpus", "wikicorpus"}


# ==============================================================================
# HELPERS
# ==============================================================================

def merge_duplicate_words(entries: List[dict]) -> List[dict]:
    """
    Merge entries sharing the same word (e.g. "si" as pronoun + adverb).
    The DB has a UNIQUE constraint on (language, word); merging here preserves
    all meanings rather than silently overwriting during seeding.
    """
    index:  Dict[str, int] = {}
    result: List[dict]     = []

    for entry in entries:
        word = entry["word"]
        if word not in index:
            index[word] = len(result)
            result.append(entry)
        else:
            base = result[index[word]]
            existing = base.get("glosses") or []
            for g in (entry.get("glosses") or []):
                if g not in existing:
                    existing.append(g)
            base["glosses"] = existing
            for t in (entry.get("tags") or []):
                if t not in (base.get("tags") or []):
                    base.setdefault("tags", []).append(t)
            if not base.get("display") and entry.get("display"):
                base["display"] = entry["display"]

    return result


def write_jsonl(outpath: Path, entries: List[dict]) -> None:
    with open(outpath, "w", encoding="utf-8") as f:
        for entry in entries:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")


def load_curated_entries(lang_code: str, lang_name: str,
                         curated_dir: Path) -> List[dict]:
    """
    Load manually-curated vocabulary entries from data/curated/{lang}_curated.jsonl.

    Each line is a JSON object.  Lines beginning with "#" are treated as comments
    and skipped.  The only required fields are "word", "pos", and "glosses".
    Missing fields are filled with sensible defaults so partial entries are valid.

    Curated entries bypass automated enrichment - their glosses are preserved as-is.
    They are also excluded from corpus extraction (via skip_words) so they cannot
    appear twice in the preseed.
    """
    lang_full_map = {"spa": "spanish", "fra": "french", "ita": "italian", "por": "portuguese"}
    lang_full     = lang_full_map.get(lang_code, lang_code)
    curated_file  = curated_dir / f"{lang_full}_curated.jsonl"
    if not curated_file.exists():
        return []

    entries: List[dict] = []
    for line in curated_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        try:
            entry = json.loads(line)
        except json.JSONDecodeError as exc:
            print(f"  Warning: skipping malformed curated line ({exc}): {line[:60]}")
            continue

        word = entry.get("word", "").strip()
        if not word:
            continue

        glosses = entry.get("glosses") or []
        pos     = entry.get("pos", "unknown")

        # Resolve rank: prefer top-level rank, fall back to frequency.rank.
        raw_freq = entry.get("frequency") or {}
        rank     = entry.get("rank") or raw_freq.get("rank") or raw_freq.get("corpus_rank")

        # Merge partial linguistic dict from curated file with full defaults.
        # setdefault would skip this entirely if a partial dict already exists,
        # so we build defaults first then layer the curated values on top.
        ling_defaults = {
            "infinitive":   word if pos == "verb" else None,
            "reflexive":    None,
            "gender":       None,
            "plural":       None,
            "register":     "neutral",
            "ipa":          "",
            "syllables":    [],
            "conjugations": None,
            "irregular":    False,
        }
        ling_from_entry = entry.get("linguistic") or {}
        ling_defaults.update({k: v for k, v in ling_from_entry.items() if v is not None})
        linguistic = ling_defaults

        # Build a complete frequency sub-dict.
        band = rank_to_band(rank) if rank else raw_freq.get("band", "C2")
        frequency = {
            "band":             band,
            "rank":             rank or raw_freq.get("rank"),
            "corpus_frequency": raw_freq.get("corpus_frequency", 0),
        }

        # Compute difficulty from rank if not manually set.
        difficulty = entry.get("difficulty") or (rank_to_difficulty(rank) if rank else 3)

        # Rebuild in canonical preseed schema order so the output is uniform.
        normalised = {
            "rank":       rank,
            "word":       word,
            "display":    entry.get("display") or (glosses[0] if glosses else word),
            "pos":        pos,
            "difficulty": difficulty,
            "tags":       entry.get("tags") or ["curated"],
            "notes":      entry.get("notes", ""),
            "glosses":    glosses,
            "examples":   entry.get("examples") or [],
            "linguistic": linguistic,
            "relations":  entry.get("relations") or {
                "commonly_confused_with": [], "related": [], "synonyms": [], "antonyms": []
            },
            "frequency":  frequency,
            "domains":    entry.get("domains") or ["general"],
            "register":   entry.get("register", "neutral"),
            "lang":       lang_name,
            "source":     "curated",
            "needs_review": False,
        }
        entries.append(normalised)

    return entries


def _post_enrichment_cleanup(entries: List[dict], verbose: bool = False) -> List[dict]:
    """
    Remove corpus entries that reveal themselves as noise or misclassified
    verb forms only after English glosses have been fetched.

    Rules applied (hardcoded function words / irregular verbs are always exempt):

    1. Verb-phrase-on-non-verb
       A corpus entry tagged as noun/adjective whose display starts with "I "
       is almost certainly a present-1s verb form that spaCy misclassified.

    2. Short word with no gloss
       A corpus entry of 3 characters or fewer that received no English gloss
       is almost certainly subtitle noise, an abbreviation, or a foreign fragment.

    3. Fake-verb root mismatch
       A corpus entry tagged as verb whose conjugation forms share no characters
       with its own infinitive stem is almost certainly a foreign name or noise word.
    """
    kept = []
    verb_phrase_n = short_no_gloss_n = root_mismatch_n = 0

    for entry in entries:
        src  = entry.get("source", "")
        word = entry.get("word", "")
        pos  = entry.get("pos", "")

        # Hardcoded and curated entries are always kept
        if src not in _CORPUS_SOURCES:
            kept.append(entry)
            continue

        display = entry.get("display", "")
        glosses = entry.get("glosses") or []

        # Rule 1: verb phrase gloss on a non-verb corpus entry
        if pos != "verb" and display.startswith("I "):
            verb_phrase_n += 1
            if verbose:
                print(f"  [drop] verb-phrase-on-{pos}: '{word}' -> '{display}'")
            continue

        # Rule 2: very short word that got no gloss at all
        if len(word) <= 3 and not glosses:
            short_no_gloss_n += 1
            if verbose:
                print(f"  [drop] short-no-gloss: '{word}' ({len(word)} chars)")
            continue

        # Rule 3: verb whose conjugations use a completely different root
        if pos == "verb":
            conjug = entry.get("linguistic", {}).get("conjugations") or {}
            if conjug:
                sample_forms = []
                for tense_forms in conjug.values():
                    if isinstance(tense_forms, list):
                        sample_forms.extend(f for f in tense_forms if f)
                if sample_forms:
                    stem = word[:3].lower()
                    matching = sum(1 for f in sample_forms if f.lower().startswith(stem))
                    if matching == 0:
                        root_mismatch_n += 1
                        if verbose:
                            print(f"  [drop] root-mismatch: '{word}' conjugated as "
                                  f"'{sample_forms[0]}...'")
                        continue

        kept.append(entry)

    if verb_phrase_n:
        print(f"  Post-clean   : {verb_phrase_n} verb-phrase-on-noun entries removed")
    if short_no_gloss_n:
        print(f"  Post-clean   : {short_no_gloss_n} short (<=3 char) no-gloss entries removed")
    if root_mismatch_n:
        print(f"  Post-clean   : {root_mismatch_n} fake-verb root-mismatch entries removed")

    return kept


# ==============================================================================
# MAIN
# ==============================================================================

def main(langs: List[str], verbose: bool,
         no_translate: bool, fresh: bool, batch: Optional[int],
         corpus: str = "wikipedia",
         wiki_n: int = 10_000, os_n: int = 10_000,
         os_min_count: int = 500) -> None:

    if corpus not in CORPUS_SOURCES:
        print(f"Unknown corpus source '{corpus}'. Choose from: {', '.join(CORPUS_SOURCES)}")
        sys.exit(1)

    is_os       = corpus == "opensubtitles"
    corpus_dir  = OPENSUBTITLES_DIR if is_os else WIKIPEDIA_DIR
    suffix      = "_os" if is_os else ""
    n           = os_n if is_os else wiki_n

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Load English blocklist once for the whole run (OS only).
    english_blocklist = None
    if is_os:
        english_blocklist = load_english_blocklist(OPENSUBTITLES_DIR)
        if english_blocklist:
            print(f"EN blocklist : {len(english_blocklist):,} words "
                  f"(top-10k English minus top-3k Spanish)")
        else:
            print("EN blocklist : UNAVAILABLE -- English corpus file not found at "
                  f"{OPENSUBTITLES_DIR / 'en' / 'en_50k.txt'}")
            print("               English words (met, dino, amir...) will NOT be filtered.")
            print("               Post-enrichment cleanup will catch some as a fallback.")

    print(f"Corpus      : {corpus}")
    print(f"Corpus dir  : {corpus_dir}")
    print(f"Output dir  : {OUTPUT_DIR}")
    print(f"Languages   : {', '.join(langs)}")
    print(f"Corpus top  : {n:,} tokens per language")
    if is_os:
        print(f"Min count   : {os_min_count:,} (OS noise filter)")
    print(f"mlconjug3   : {MLCONJUG3_VERSION or 'not installed'}")
    if no_translate:
        print("Translation : disabled (--no-translate)")
    elif batch:
        print(f"Translation : batch of {batch} words per language")
    if verbose:
        print("Verbose     : on")
    print()

    for lang in langs:
        data = LANGUAGE_DATA.get(lang)
        if not data:
            print(f"[{lang}] No hardcoded data registered - skipping.\n")
            continue

        lang_name = LANG_NAMES.get(lang, lang)
        print(f"-- {lang} ({lang_name}) " + "-" * 44)

        fn_words  = copy.deepcopy(data["function_words"])
        irr_verbs = copy.deepcopy(data["irregular_verbs"])

        # Load manually-curated entries (bypass corpus + enrichment)
        curated_entries = load_curated_entries(lang, lang_name, CURATED_DIR)
        if curated_entries:
            print(f"  Curated      : {len(curated_entries)} entries from {lang_name}_curated.jsonl")

        # Conjugate irregular verbs
        if MLCONJUG3_AVAILABLE:
            print(f"  Conjugating {len(irr_verbs)} irregular verbs "
                  f"(mlconjug3 {MLCONJUG3_VERSION}) ...")
            conj_ok = conj_fail = 0
            first_error: Optional[str] = None
            try:
                for entry in irr_verbs:
                    inf  = entry["linguistic"]["infinitive"]
                    conj = build_conjugations(inf, lang, verbose=verbose,
                                              capture_error=(first_error is None))
                    if isinstance(conj, tuple):
                        conj, first_error = conj
                    if conj:
                        entry["linguistic"]["conjugations"] = conj
                        conj_ok += 1
                    else:
                        conj_fail += 1
                        if verbose:
                            print(f"    No conjugations for '{inf}'")
            except Exception as exc:
                first_error = f"Unexpected loop error: {type(exc).__name__}: {exc}"
                print(f"  ERROR during conjugation loop: {first_error}")

            msg = f"  Conjugations : {conj_ok} OK, {conj_fail} failed"
            if conj_fail and not verbose and first_error:
                msg += f"\n  First error  : {first_error}"
                msg += "\n  Hint: run with --verbose or debug_conjugations.py"
            print(msg)
        else:
            print("  mlconjug3 not available - verbs written without conjugations.")

        hardcoded_entries = fn_words + irr_verbs
        print(f"  Hardcoded    : {len(fn_words)} function words "
              f"+ {len(irr_verbs)} irregular verbs = {len(hardcoded_entries)} total")

        # Build a skip set so corpus extraction does not duplicate words already
        # covered by hardcoded entries or curated entries.
        skip_words  = {e["word"].lower() for e in hardcoded_entries + curated_entries}
        curated_map = {e["word"].lower(): e for e in curated_entries}

        # Load corpus frequency table
        if is_os:
            corpus_ranks = load_os_ranks(lang, corpus_dir)
        else:
            corpus_ranks = load_corpus_ranks(lang, corpus_dir)
        if corpus_ranks:
            print(f"  Rank lookup  : {len(corpus_ranks):,} corpus words loaded")

        # Build corpus entries
        corpus_entries_out: List[dict] = []
        closed_class_freq:  Dict[str, dict] = {}

        if n == 0:
            print("  Corpus       : skipped (--n 0)")
        elif not SPACY_AVAILABLE:
            print("  Corpus       : skipped (spaCy not installed)")
        elif not ensure_spacy_model(lang):
            print(f"  Corpus       : skipped (spaCy model unavailable for '{lang}')")
        else:
            try:
                import spacy
                nlp = spacy.load(SPACY_MODELS[lang])
            except OSError as e:
                print(f"  Corpus       : skipped ({e})")
                nlp = None

            if nlp:
                if is_os:
                    words_file = find_os_corpus_file(lang, corpus_dir)
                    if not words_file:
                        print(f"  Corpus       : skipped (no OpenSubtitles file for '{lang}' in {corpus_dir})")
                    else:
                        try:
                            print(f"  Corpus src   : {words_file.name}")
                            rows = read_top_n_os(words_file, n, min_count=os_min_count)
                            print(f"  Tokens read  : {len(rows):,}")
                            corpus_entries_out, closed_class_freq = build_corpus_entries(
                                rows, lang, nlp, corpus_ranks=corpus_ranks,
                                verbose=verbose, source="os_corpus",
                                strict_vocab=english_blocklist,
                                skip_words=skip_words,
                                curated_map=curated_map,
                            )
                            print(f"  Corpus       : {len(corpus_entries_out):,} entries after filtering")
                            if closed_class_freq:
                                print(f"  Closed-class : {len(closed_class_freq):,} function word(s) "
                                      f"found in corpus rows (ranks 101+)")
                        except Exception as e:
                            print(f"  Corpus       : skipped ({e})")
                else:
                    lang_dir = find_corpus_dir(lang, corpus_dir)
                    if not lang_dir:
                        print(f"  Corpus       : skipped (no folder for '{lang}' in {corpus_dir})")
                    else:
                        try:
                            words_file = find_words_file(lang_dir, lang)
                            print(f"  Corpus src   : {words_file.name}")
                            rows = read_top_n(words_file, n)
                            print(f"  Tokens read  : {len(rows):,}")
                            corpus_entries_out, closed_class_freq = build_corpus_entries(
                                rows, lang, nlp, corpus_ranks=corpus_ranks, verbose=verbose,
                                skip_words=skip_words,
                                curated_map=curated_map,
                            )
                            print(f"  Corpus       : {len(corpus_entries_out):,} entries after filtering")
                            if closed_class_freq:
                                print(f"  Closed-class : {len(closed_class_freq):,} function word(s) "
                                      f"found in corpus rows (ranks 101+)")
                        except FileNotFoundError as e:
                            print(f"  Corpus       : skipped ({e})")

        # Merge, rank, dedup
        # Curated entries sit between hardcoded and corpus so they receive
        # proper rank/frequency values from the sorting step below.
        all_entries = hardcoded_entries + curated_entries + corpus_entries_out

        if corpus_ranks:
            for entry in all_entries:
                word = entry.get("word", "").lower()
                freq_data = corpus_ranks.get(word)
                if freq_data:
                    entry.setdefault("frequency", {})["corpus_frequency"] = freq_data["count"]

        all_entries.sort(key=lambda e: (
            e.get("frequency", {}).get("corpus_frequency") is None,
            -(e.get("frequency", {}).get("corpus_frequency") or 0),
        ))

        for pos, entry in enumerate(all_entries, start=1):
            entry["rank"]       = pos
            entry["difficulty"] = rank_to_difficulty(pos)
            freq = entry.setdefault("frequency", {})
            freq["rank"] = pos
            freq["band"] = rank_to_band(pos)

        before      = len(all_entries)
        all_entries = merge_duplicate_words(all_entries)
        merged      = before - len(all_entries)
        if merged:
            print(f"  Deduped      : {merged} duplicate word(s) merged")

        # Emoji
        lang_emojis   = EMOJI_DATA.get(lang, {})
        emoji_applied = 0
        for entry in all_entries:
            if not entry.get("emoji") and entry["word"] in lang_emojis:
                entry["emoji"] = lang_emojis[entry["word"]]
                emoji_applied += 1
        if emoji_applied:
            print(f"  Emoji        : {emoji_applied} entries tagged")

        # Write snapshot before the slow translation step
        PRESEED_DIR.mkdir(parents=True, exist_ok=True)
        outpath = PRESEED_DIR / f"{lang_name}_preseed{suffix}.jsonl"
        write_jsonl(outpath, all_entries)
        print(f"  Output       : {len(all_entries)} entries -> {outpath.name} (pre-enrichment)")

        # Glosses, display, domains
        # Curated entries already have manually-set glosses - skip enrichment for
        # them so automated translation cannot overwrite hand-picked values.
        to_enrich     = [e for e in all_entries if e.get("source") != "curated"]
        curated_final = [e for e in all_entries if e.get("source") == "curated"]

        try:
            enriched = enrich_entries(
                to_enrich, lang,
                cache_dir=CACHE_DIR,
                fresh=fresh,
                batch=batch,
                no_translate=no_translate,
                verbose=verbose,
            )

            # Re-combine, preserving rank order.
            all_entries = sorted(
                enriched + curated_final,
                key=lambda e: e.get("rank", 99_999),
            )

            # Post-enrichment cleanup (verb-phrase-on-noun, short-no-gloss, root-mismatch)
            all_entries = _post_enrichment_cleanup(all_entries, verbose=verbose)

            write_jsonl(outpath, all_entries)
            print(f"  Output       : {len(all_entries)} entries -> {outpath.name} (enriched)\n")
        except KeyboardInterrupt:
            write_jsonl(outpath, all_entries)
            print(f"  Output       : {len(all_entries)} entries -> {outpath.name} (partial)\n")
            print("Interrupted - partial file written. Re-run to continue.")
            sys.exit(0)

    print("Done.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Build preseed JSONL files from a frequency corpus."
    )
    parser.add_argument(
        "--langs", nargs="+", default=list(LANGUAGE_DATA.keys()),
        metavar="LANG", help="3-letter language codes (default: all registered)"
    )
    parser.add_argument(
        "--wiki-n", type=int, default=10_000,
        help="Wikipedia: top-N words per language (default: 10000; 0 = hardcoded only)"
    )
    parser.add_argument(
        "--os-n", type=int, default=10_000,
        help="OpenSubtitles: top-N words per language (default: 10000; 0 = hardcoded only)"
    )
    parser.add_argument(
        "--n", type=int, default=None,
        help="Shorthand: sets both --wiki-n and --os-n to the same value"
    )
    parser.add_argument(
        "--corpus", choices=CORPUS_SOURCES, default="wikipedia",
        help="Frequency corpus source (default: wikipedia)"
    )
    parser.add_argument("--verbose",      action="store_true", help="Extra logging")
    parser.add_argument("--no-translate", action="store_true", help="Skip Wiktionary / Google Translate")
    parser.add_argument("--fresh",        action="store_true", help="Ignore gloss cache")
    parser.add_argument("--batch",     type=int, default=None, help="Max new translations per run")
    parser.add_argument("--min-count", type=int, default=500,
                        help="OpenSubtitles only: skip words with fewer occurrences (default: 500)")
    args = parser.parse_args()

    wiki_n = args.n if args.n is not None else args.wiki_n
    os_n   = args.n if args.n is not None else args.os_n

    main(
        langs=args.langs,
        wiki_n=wiki_n,
        os_n=os_n,
        verbose=args.verbose,
        no_translate=args.no_translate,
        fresh=args.fresh,
        batch=args.batch,
        corpus=args.corpus,
        os_min_count=args.min_count,
    )
