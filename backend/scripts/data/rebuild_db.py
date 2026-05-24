#!/usr/bin/env python3
"""
rebuild_db.py — One-step VocabApp database builder
====================================================
Replaces the 4-script pipeline (clean_wikicorpora → enrich_preseed →
seed_languages) with a single command. No intermediate preseed files —
sources flow directly into vocabulary.db.

Priority order (curated always wins on word collision):
  1. data/curated/{lang}_curated.jsonl   — hand-curated entries
  2. hardcoded_data                       — function words + irregular verbs
  3. Frequency corpus (optional)          — fills remaining open-class gaps
     Requires: spaCy + corpus files in data/opensubtitles_freq_corpora/

Usage:
    python backend/scripts/data/rebuild_db.py
    python backend/scripts/data/rebuild_db.py --langs spa
    python backend/scripts/data/rebuild_db.py --no-corpus
    python backend/scripts/data/rebuild_db.py --langs spa --corpus opensubtitles --min-count 100
"""

import argparse
import datetime
import json
import shutil
import sqlite3
import sys
import warnings
from pathlib import Path
from typing import Dict, List, Optional, Set

warnings.filterwarnings("ignore", message=".*InconsistentVersionWarning.*")
warnings.filterwarnings("ignore", message=".*Trying to unpickle estimator.*")

# ── Paths ──────────────────────────────────────────────────────────────────────
SCRIPT_DIR   = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent.parent
CURATED_DIR  = PROJECT_ROOT / 'data' / 'curated'
DB_PATH      = PROJECT_ROOT / 'data' / 'vocabulary.db'
WIKI_DIR     = PROJECT_ROOT / 'data' / 'wikipedia_freq_corpora'
OS_DIR       = PROJECT_ROOT / 'data' / 'opensubtitles_freq_corpora'

sys.path.insert(0, str(SCRIPT_DIR))

from hardcoded_data import LANGUAGE_DATA                # noqa: E402
from emoji_data     import EMOJI_DATA                  # noqa: E402
from ipa_data       import get_ipa                     # noqa: E402
from relations_data import get_relations               # noqa: E402
from register_data  import get_register                # noqa: E402

# ── Language config ────────────────────────────────────────────────────────────
LANG_CONFIG: Dict[str, str] = {
    'spa': 'spanish',
    'fra': 'french',
    'ita': 'italian',
    'por': 'portuguese',
}

SPACY_MODELS: Dict[str, str] = {
    'spa': 'es_core_news_sm',
    'fra': 'fr_core_news_sm',
    'ita': 'it_core_news_sm',
    'por': 'pt_core_news_sm',
}

# ── Ranking helpers ────────────────────────────────────────────────────────────

def rank_to_band(rank: Optional[int]) -> str:
    if not rank:
        return 'C2'
    for threshold, band in [(200, 'A1'), (500, 'A2'), (1000, 'B1'), (2000, 'B2'), (4000, 'C1')]:
        if rank <= threshold:
            return band
    return 'C2'


def rank_to_difficulty(rank: Optional[int]) -> int:
    if not rank:   return 5
    if rank <= 200:  return 1
    if rank <= 500:  return 2
    if rank <= 1000: return 3
    if rank <= 2000: return 4
    return 5


# ── Data loading ───────────────────────────────────────────────────────────────

def load_curated(lang: str) -> List[dict]:
    """Load hand-curated entries. Returns [] if no file found."""
    lang_name = LANG_CONFIG[lang]
    path = CURATED_DIR / f'{lang_name}_curated.jsonl'
    if not path.exists():
        return []
    entries = []
    with open(path, encoding='utf-8') as f:
        for lineno, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
                entry['source'] = 'curated'
                freq = entry.setdefault('frequency', {})
                # Normalise null corpus_frequency and integer band
                if freq.get('corpus_frequency') is None:
                    freq['corpus_frequency'] = 0
                band = freq.get('band', 'C2')
                if not isinstance(band, str):
                    freq['band'] = rank_to_band(freq.get('rank'))
                entries.append(entry)
            except json.JSONDecodeError as e:
                print(f'  Warning: skipping line {lineno} in {path.name}: {e}')
    return entries


def load_hardcoded(lang: str, conjugate: bool = True) -> List[dict]:
    """Load hardcoded function words + irregular verbs. Conjugates if mlconjug3 available."""
    lang_data = LANGUAGE_DATA.get(lang, {})
    fn_words  = [dict(e) for e in lang_data.get('function_words', [])]
    irr_verbs = [dict(e) for e in lang_data.get('irregular_verbs', [])]

    if conjugate and irr_verbs:
        try:
            from corpus_builder import build_conjugations
            irr_verbs = build_conjugations(irr_verbs, lang) or irr_verbs
        except ImportError:
            pass  # mlconjug3 not installed — verbs included without conjugations
        except Exception as e:
            print(f'  Warning: conjugation failed for {lang}: {e}')

    entries = []
    for e in fn_words + irr_verbs:
        e['source'] = 'hardcoded'
        freq = e.setdefault('frequency', {})
        if freq.get('corpus_frequency') is None:
            freq['corpus_frequency'] = 0
        entries.append(e)
    return entries


def merge_entries(entry_lists: List[List[dict]]) -> List[dict]:
    """Merge lists in priority order; first occurrence of each word wins."""
    seen: Set[str] = set()
    result = []
    for entries in entry_lists:
        for entry in entries:
            word = entry.get('word', '').lower()
            if word and word not in seen:
                seen.add(word)
                result.append(entry)
    return result


# ── Enrichment ─────────────────────────────────────────────────────────────────

def apply_enrichment(entries: List[dict], lang: str) -> None:
    """Apply IPA, relations, register in-place (additive — never overwrites existing values)."""
    for entry in entries:
        word = entry.get('word', '')
        ling = entry.setdefault('linguistic', {})

        if not ling.get('ipa'):
            ipa = get_ipa(word, lang)
            if ipa:
                ling['ipa'] = ipa

        # Normalise relations to dict — corpus entries sometimes store it as a list
        rels = entry.get('relations')
        if not isinstance(rels, dict):
            rels = {'commonly_confused_with': [], 'related': [], 'synonyms': [], 'antonyms': []}
            entry['relations'] = rels
        rel_data = get_relations(word, lang)
        if rel_data:
            for key, values in rel_data.items():
                if not rels.get(key):
                    rels[key] = values

        if ling.get('register', 'neutral') == 'neutral':
            reg = get_register(word, lang)
            if reg:
                ling['register'] = reg
                entry['register'] = reg


_DEFAULT_DOMAINS = {'["general"]', None, '', '[]'}

def apply_emoji(entries: List[dict], lang: str) -> None:
    """Apply emoji and category-based domains in-place.

    EMOJI_DATA structure: { lang: { category: { word: emoji } } }
    Words with a default/unset domain get their domain updated to the emoji
    category (e.g. 'animals', 'food') so the app can use it for picture quiz.
    """
    lang_emojis = EMOJI_DATA.get(lang, {})
    # Build flat word → (emoji, category) map
    word_map: Dict[str, tuple] = {}
    for category, words in lang_emojis.items():
        for word, emoji in words.items():
            if word not in word_map:
                word_map[word] = (emoji, category)

    for entry in entries:
        match = word_map.get(entry.get('word', ''))
        if not match:
            continue
        emoji, category = match
        if not entry.get('emoji'):
            entry['emoji'] = emoji
        # Set domain to emoji category if still at the generic default
        domains = entry.get('domains')
        if json.dumps(domains, ensure_ascii=False) in _DEFAULT_DOMAINS or not domains:
            entry['domains'] = [category]


def assign_ranks(entries: List[dict]) -> None:
    """Sort by corpus_frequency descending, then assign rank/difficulty/band in-place."""
    entries.sort(key=lambda e: -(e.get('frequency', {}).get('corpus_frequency') or 0))
    for pos, entry in enumerate(entries, start=1):
        freq = entry.setdefault('frequency', {})
        entry['rank']       = pos
        entry['difficulty'] = rank_to_difficulty(pos)
        freq['rank']        = pos
        freq['band']        = rank_to_band(pos)


# ── Corpus extraction (optional — needs spaCy) ─────────────────────────────────

def load_corpus_entries(
    lang: str,
    corpus: str,
    n: int,
    min_count: int,
    skip_words: Set[str],
    verbose: bool,
) -> List[dict]:
    """Extract open-class words from frequency corpus. Returns [] if unavailable."""
    try:
        import spacy
        from corpus_builder import (
            build_corpus_entries,
            find_corpus_dir, find_words_file, load_corpus_ranks,
            find_os_corpus_file, read_top_n_os, load_os_ranks,
            read_top_n,
        )
    except ImportError as e:
        print(f'  Corpus: skipped — {e}')
        return []

    model_name = SPACY_MODELS.get(lang)
    if not model_name:
        print(f'  Corpus: no spaCy model configured for {lang}')
        return []
    try:
        nlp = spacy.load(model_name)
    except OSError as e:
        print(f'  Corpus: skipped — {e}')
        return []

    try:
        if corpus == 'opensubtitles':
            filepath = find_os_corpus_file(lang, OS_DIR)
            if not filepath:
                print(f'  Corpus: no OpenSubtitles file for {lang}')
                return []
            corpus_ranks = load_os_ranks(lang, OS_DIR)
            rows = read_top_n_os(filepath, n, min_count=min_count)
            source = 'os_corpus'
        else:
            lang_dir = find_corpus_dir(lang, WIKI_DIR)
            if not lang_dir:
                print(f'  Corpus: no Wikipedia corpus for {lang}')
                return []
            corpus_ranks = load_corpus_ranks(lang, WIKI_DIR)
            words_file = find_words_file(lang_dir, lang)
            rows = read_top_n(words_file, n)
            source = 'wikicorpus'

        print(f'  Corpus: {len(rows):,} tokens from {corpus}')
        entries, _ = build_corpus_entries(
            rows, lang, nlp,
            corpus_ranks=corpus_ranks,
            skip_words=skip_words,
            verbose=verbose,
            source=source,
        )
        return entries
    except Exception as e:
        print(f'  Corpus: error — {e}')
        if verbose:
            import traceback; traceback.print_exc()
        return []


# ── DB writing ─────────────────────────────────────────────────────────────────

UPSERT_WORD = """
    INSERT INTO words
        (language, word, display, pos, difficulty, notes,
         gender, register, infinitive, rank, ipa, syllables, conjugations, domains, emoji)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(language, word) DO UPDATE SET
        display      = excluded.display,
        pos          = COALESCE(excluded.pos,          pos),
        difficulty   = COALESCE(excluded.difficulty,   difficulty),
        notes        = COALESCE(excluded.notes,        notes),
        gender       = COALESCE(excluded.gender,       gender),
        register     = COALESCE(excluded.register,     register),
        infinitive   = COALESCE(excluded.infinitive,   infinitive),
        rank         = excluded.rank,
        ipa          = COALESCE(excluded.ipa,          ipa),
        syllables    = COALESCE(excluded.syllables,    syllables),
        conjugations = COALESCE(excluded.conjugations, conjugations),
        domains      = COALESCE(excluded.domains,      domains),
        emoji        = COALESCE(excluded.emoji,        emoji),
        updated_at   = CURRENT_TIMESTAMP
"""

INSERT_GLOSS = "INSERT INTO word_glosses (word_id, gloss, position) VALUES (?, ?, ?)"
INSERT_TAG   = "INSERT OR IGNORE INTO word_tags (word_id, tag) VALUES (?, ?)"


def syllables_to_str(syllables) -> Optional[str]:
    if not syllables:
        return None
    if isinstance(syllables, list):
        return '-'.join(s for s in syllables if s) or None
    return str(syllables) or None


def write_to_db(entries: List[dict], lang_name: str, conn: sqlite3.Connection) -> None:
    cursor = conn.cursor()
    glosses_n = tags_n = 0

    for w in entries:
        ling = w.get('linguistic') or {}
        freq = w.get('frequency')  or {}
        conj = ling.get('conjugations')
        doms = w.get('domains') or ['general']

        cursor.execute(UPSERT_WORD, (
            lang_name,
            w['word'],
            w.get('display') or w['word'],
            w.get('pos'),
            w.get('difficulty'),
            w.get('notes') or None,
            ling.get('gender'),
            w.get('register') or ling.get('register'),
            ling.get('infinitive'),
            freq.get('rank') or w.get('rank'),
            ling.get('ipa') or None,
            syllables_to_str(ling.get('syllables')),
            json.dumps(conj, ensure_ascii=False) if conj else None,
            json.dumps(doms, ensure_ascii=False),
            w.get('emoji') or None,
        ))

        result = cursor.execute(
            'SELECT id FROM words WHERE language = ? AND word = ?',
            (lang_name, w['word'])
        ).fetchone()
        if not result:
            continue
        word_id = result[0]

        cursor.execute('DELETE FROM word_glosses WHERE word_id = ?', (word_id,))
        for pos_idx, gloss in enumerate(w.get('glosses') or []):
            if gloss:
                cursor.execute(INSERT_GLOSS, (word_id, gloss, pos_idx))
                glosses_n += 1

        for tag in w.get('tags') or []:
            if tag:
                cursor.execute(INSERT_TAG, (word_id, tag))
                tags_n += 1

    conn.commit()
    print(f'  glosses      : {glosses_n}   tags: {tags_n}')


# ── Per-language orchestration ─────────────────────────────────────────────────

def build_language(
    lang: str,
    corpus: str,
    corpus_n: int,
    min_count: int,
    no_corpus: bool,
    verbose: bool,
) -> List[dict]:
    lang_name = LANG_CONFIG[lang]
    print(f'\n{"─" * 60}')
    print(f'  {lang_name.upper()}  ({lang})')
    print(f'{"─" * 60}')

    curated   = load_curated(lang)
    print(f'  Curated      : {len(curated)}')

    hardcoded = load_hardcoded(lang, conjugate=True)
    print(f'  Hardcoded    : {len(hardcoded)}  (function words + irregular verbs)')

    corpus_entries: List[dict] = []
    if not no_corpus:
        skip_words = {e['word'].lower() for e in curated + hardcoded}
        corpus_entries = load_corpus_entries(lang, corpus, corpus_n, min_count, skip_words, verbose)
        print(f'  Corpus new   : {len(corpus_entries)}')

    all_entries = merge_entries([curated, hardcoded, corpus_entries])
    print(f'  Total        : {len(all_entries)}  (after merge)')

    apply_enrichment(all_entries, lang)
    apply_emoji(all_entries, lang)
    assign_ranks(all_entries)

    return all_entries


# ── Entry point ────────────────────────────────────────────────────────────────

def main(
    langs=None,
    corpus='opensubtitles',
    corpus_n=10_000,
    min_count=100,
    no_corpus=False,
    verbose=False,
):
    langs = langs or list(LANG_CONFIG.keys())
    unknown = [l for l in langs if l not in LANG_CONFIG]
    if unknown:
        print(f'Unknown language code(s): {", ".join(unknown)}')
        print(f'Valid choices: {", ".join(LANG_CONFIG)}')
        sys.exit(1)

    if not DB_PATH.exists():
        print(f'DB not found: {DB_PATH}')
        sys.exit(1)

    # Check DB not locked
    try:
        conn_test = sqlite3.connect(str(DB_PATH), timeout=2)
        conn_test.execute('BEGIN EXCLUSIVE')
        conn_test.rollback()
        conn_test.close()
    except sqlite3.OperationalError:
        print('vocabulary.db is locked — stop the server first, then re-run.')
        sys.exit(1)

    backup = DB_PATH.parent / f"vocabulary_pre_rebuild_{int(datetime.datetime.now().timestamp())}.db"
    shutil.copy2(str(DB_PATH), str(backup))
    print(f'Backup   : {backup.name}')
    print(f'Corpus   : {"none (--no-corpus)" if no_corpus else corpus}')

    conn = sqlite3.connect(str(DB_PATH))
    conn.execute('PRAGMA foreign_keys = ON')
    conn.execute('PRAGMA journal_mode = DELETE')

    existing_cols = {r[1] for r in conn.execute('PRAGMA table_info(words)').fetchall()}
    for col, col_type in [('domains', 'TEXT'), ('emoji', 'TEXT')]:
        if col not in existing_cols:
            conn.execute(f'ALTER TABLE words ADD COLUMN {col} {col_type}')
            conn.commit()
            print(f'Migrated : added {col} column')

    for lang in langs:
        entries   = build_language(lang, corpus, corpus_n, min_count, no_corpus, verbose)
        lang_name = LANG_CONFIG[lang]
        write_to_db(entries, lang_name, conn)
        stats = conn.execute(
            'SELECT COUNT(*), SUM(CASE WHEN conjugations IS NOT NULL THEN 1 ELSE 0 END) '
            'FROM words WHERE language = ?', (lang_name,)
        ).fetchone()
        print(f'  DB total     : {stats[0]} words  ({stats[1]} with conjugations)')

    conn.close()
    print('\nDone.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(
        description='Rebuild vocabulary.db directly from curated + hardcoded + corpus.',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python rebuild_db.py                          # all languages, OS corpus
  python rebuild_db.py --langs spa              # Spanish only
  python rebuild_db.py --langs spa --no-corpus  # curated + hardcoded only (fast, no spaCy)
  python rebuild_db.py --langs spa fra --min-count 50
        """,
    )
    parser.add_argument('--langs', nargs='+', default=None, metavar='LANG',
                        help=f'3-letter codes (default: all). Choices: {", ".join(LANG_CONFIG)}')
    parser.add_argument('--corpus', choices=['wikipedia', 'opensubtitles'],
                        default='opensubtitles',
                        help='Corpus source for open-class gap-filling (default: opensubtitles)')
    parser.add_argument('--corpus-n', type=int, default=10_000, metavar='N',
                        help='Top-N corpus tokens to process (default: 10000)')
    parser.add_argument('--min-count', type=int, default=100, metavar='N',
                        help='Min corpus occurrences to include a word (default: 100)')
    parser.add_argument('--no-corpus', action='store_true',
                        help='Skip corpus step entirely — curated + hardcoded only. Fast, no spaCy needed.')
    parser.add_argument('--verbose', action='store_true', help='Extra logging')

    args = parser.parse_args()
    main(
        langs=args.langs,
        corpus=args.corpus,
        corpus_n=args.corpus_n,
        min_count=args.min_count,
        no_corpus=args.no_corpus,
        verbose=args.verbose,
    )
