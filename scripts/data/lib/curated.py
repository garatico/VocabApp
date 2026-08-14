"""
lib/curated.py — everything that reads or writes the curated JSONL
==================================================================
data/curated/{language}_curated.jsonl is the source of truth for the app;
vocabulary.db is a derived artefact rebuilt from it. So every operation on that
file lives here, in one module, with one reader and one writer:

    read(lang)              -> list[dict]
    write(lang, entries)    -> atomic replace, previous version kept as .bak

The pipeline steps below all follow the same shape: they take the entry list,
mutate or filter it, and hand back a report. None of them touch the filesystem
or the database themselves — pipeline.py decides whether to persist the result.
That is what makes `--write` a single, reliable gate rather than a flag each
step has to remember to honour.

    mine_lang        OpenSubtitles corpus -> new entries (fetches glosses)
    dedupe_lang      drop duplicate and junk entries
    backfill_lang    fill pos/glosses so sync stops skipping rows
    enrich_gender    rule-based gender for Spanish nouns
    enrich_domains   keyword-based domain assignment
    canonicalize_domains  merge noisy domains into the canonical set
    fill_conjugations / fix_translation   pre-sync cleanups
"""

import json
import os
import re
import sys
import time
import warnings
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from . import corpus
from .config import (
    CURATED_DIR, PRESEED_DIR, OS_DIR, LANG_NAMES, LANG_SRC, SPACY_MODELS,
    WIKT_LANG, TENSE_MAP, MLCONJUG3_LANG,
    curated_path, gloss_cache_path, rank_to_band, rank_to_difficulty,
)

warnings.filterwarnings("ignore")


# ══════════════════════════════════════════════════════════════════════════════
# JSONL IO — the only reader and the only writer
# ══════════════════════════════════════════════════════════════════════════════

def read(lang: str) -> List[dict]:
    """Load a language's curated entries. Malformed lines are reported and skipped."""
    path = curated_path(lang)
    if not path.exists():
        print(f'  No curated file at {path}')
        return []

    entries: List[dict] = []
    with open(path, encoding='utf-8') as f:
        for lineno, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                entries.append(json.loads(line))
            except json.JSONDecodeError as e:
                print(f'  Warning: skipping {path.name} line {lineno}: {e}')
    return entries


def write(lang: str, entries: List[dict]) -> Path:
    """
    Replace a language's curated file.

    Writes to a temp file and renames it over the original, so an interrupted
    run can never leave a half-written source of truth behind. The previous
    contents are kept as .jsonl.bak.
    """
    path = curated_path(lang)
    tmp  = path.with_suffix('.jsonl.tmp')

    with open(tmp, 'w', encoding='utf-8') as f:
        for entry in entries:
            f.write(json.dumps(entry, ensure_ascii=False) + '\n')
        f.flush()
        os.fsync(f.fileno())

    if path.exists():
        path.replace(path.with_suffix('.jsonl.bak'))
    tmp.replace(path)
    return path


def read_jsonl(path: Path) -> List[dict]:
    """Read an arbitrary JSONL file (preseed files, caches)."""
    rows: List[dict] = []
    if not path.exists():
        return rows
    with open(path, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    rows.append(json.loads(line))
                except json.JSONDecodeError:
                    pass
    return rows



# ══════════════════════════════════════════════════════════════════════════════
# MINE — OpenSubtitles corpus -> new curated entries
# ══════════════════════════════════════════════════════════════════════════════

@dataclass(frozen=True)
class Lang:
    """The per-language names the mining step needs, gathered in one place.

    Each third-party library wants a different code for the same language, so
    this bundles them: spaCy wants 'es_core_news_sm', wiktionaryparser wants
    'spanish', deep_translator wants 'es'.
    """
    code:        str    # 'fra'
    name:        str    # 'french'
    spacy_model: str    # 'fr_core_news_sm'
    wikt:        str    # 'french'      — wiktionaryparser's language name
    src:         str    # 'fr'          — deep_translator source code

    @property
    def curated_path(self) -> Path:
        return curated_path(self.code)

    @property
    def cache_path(self) -> Path:
        return gloss_cache_path(self.code)


def make_lang(code: str) -> Lang:
    if code not in LANG_NAMES:
        raise SystemExit(f'Unknown language code {code!r} (expected one of {list(LANG_NAMES)})')
    return Lang(
        code=code,
        name=LANG_NAMES[code],
        spacy_model=SPACY_MODELS.get(code, ''),
        wikt=WIKT_LANG.get(code, LANG_NAMES[code]),
        src=LANG_SRC.get(code, code[:2]),
    )


def load_cache(lang: Lang) -> Dict[str, dict]:
    path = lang.cache_path
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


def save_to_cache(lang: Lang, word: str, glosses: List[str], source: str,
                  cache: Dict[str, dict]) -> None:
    entry = {'word': word, 'glosses': glosses, 'source': source}
    cache[word] = entry
    with open(lang.cache_path, 'a', encoding='utf-8') as f:
        f.write(json.dumps(entry, ensure_ascii=False) + '\n')


# ── Gloss fetching ─────────────────────────────────────────────────────────────

_WIKT_FAILED = False


def fetch_wiktionary(lang: Lang, word: str) -> Optional[List[str]]:
    """Try to get English definitions from Wiktionary."""
    try:
        from wiktionaryparser import WiktionaryParser
        parser = WiktionaryParser()
        parser.set_default_language(lang.wikt)
        result = parser.fetch(word, lang.wikt)
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
    except Exception as exc:
        # This used to swallow everything silently, which is why the gloss
        # cache shows 26,010 lookups and zero Wiktionary hits with no trace of
        # why. Report the first failure per run so a broken parser, a blocked
        # network or an API change is visible rather than degrading quietly
        # into Google-Translate-only mining.
        global _WIKT_FAILED
        if not _WIKT_FAILED:
            _WIKT_FAILED = True
            print(f'  Wiktionary lookups are failing ({type(exc).__name__}: {exc}).')
            print('  Falling back to Google Translate for every word, which does not')
            print('  reject non-words — expect corpus fragments in the results.')
        return None


def fetch_google(lang: Lang, word: str) -> Optional[List[str]]:
    """Translate word using Google Translate as fallback."""
    try:
        from deep_translator import GoogleTranslator
        result = GoogleTranslator(source=lang.src, target='en').translate(word)
        if result and result.lower() != word.lower():
            return [result]
        return None
    except Exception:
        return None


def get_glosses(
    lang: Lang,
    word: str,
    cache: Dict[str, dict],
    no_translate: bool = False,
) -> Tuple[List[str], str]:
    """
    Return (glosses, source) for a word.
    Tries cache → Wiktionary → Google Translate.
    Returns ([], 'empty') if nothing found.
    """
    if word in cache:
        c = cache[word]
        return c.get('glosses', []), c.get('source', 'cache')

    time.sleep(0.3)  # polite rate limiting

    glosses = fetch_wiktionary(lang, word)
    if glosses:
        save_to_cache(lang, word, glosses, 'wiktionary', cache)
        return glosses, 'wiktionary'

    if not no_translate:
        time.sleep(0.5)
        glosses = fetch_google(lang, word)
        if glosses:
            save_to_cache(lang, word, glosses, 'google', cache)
            return glosses, 'google'

    save_to_cache(lang, word, [], 'empty', cache)
    return [], 'empty'


def infer_conjugation_class(lang: Lang, infinitive: str) -> Optional[str]:
    """
    Only Spanish carries a conjugation_class — its verbs are generated by the
    rules engine in src/server/lib/verb-rules.ts. For the other languages
    the sync step fills a full conjugation table via mlconjug3 instead, so leaving
    this null is correct rather than a gap.
    """
    if lang.code != 'spa':
        return None
    if infinitive.endswith('ar'):
        return 'regular-ar'
    if infinitive.endswith('er'):
        return 'regular-er'
    if infinitive.endswith('ir') or infinitive.endswith('ír'):
        return 'regular-ir'
    return None


def build_curated_entry(
    lang: Lang,
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

    conj_class = infer_conjugation_class(lang, infinitive or word) if pos == 'verb' else None

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
        'lang':         lang.name,
        'source':       'corpus',
        'needs_review': True,
    }


def extract_candidates(
    lang: Lang,
    skip_words: set,
    top_n: int,
    min_count: int,
    verbose: bool,
    corpus_file: str = '50k',
) -> List[dict]:
    """
    Run corpus extraction via lib/corpus.py + spaCy.
    Returns list of candidate dicts with word/pos/corpus_rank/corpus_count.
    """
    try:
        import spacy
        from .corpus import (
            build_corpus_entries, find_os_corpus_file,
            read_top_n_os, load_os_ranks,
        )
    except ImportError as e:
        # 'pip install spacy' can succeed and this can still fail, because pip
        # and python are often different installs on Windows. Say which
        # interpreter is actually running so the mismatch is visible.
        print(f'  spaCy is not importable from this interpreter: {e}')
        print(f'    interpreter : {sys.executable}')
        print(f'    version     : {sys.version.split()[0]}')
        print(f'  Install into THIS interpreter with:')
        print(f'    "{sys.executable}" -m pip install spacy')
        print(f'    "{sys.executable}" -m spacy download {lang.spacy_model}')
        print(f'  Then re-check with:  python scripts/data/pipeline.py env')
        return []

    if not lang.spacy_model:
        print(f'  No spaCy model configured for {lang.code}')
        return []

    try:
        nlp = spacy.load(lang.spacy_model)
    except OSError:
        print(f'  spaCy {spacy.__version__} is installed, but the '
              f'{lang.spacy_model} model is missing.')
        print(f'    interpreter : {sys.executable}')
        print(f'  Download it with:')
        print(f'    "{sys.executable}" -m spacy download {lang.spacy_model}')
        print(f'  Then re-check with:  python scripts/data/pipeline.py env')
        return []

    filepath = find_os_corpus_file(lang.code, OS_DIR, prefer=corpus_file)
    if not filepath:
        print(f'  No OpenSubtitles file found for {lang.code} in {OS_DIR}')
        return []

    corpus_ranks = load_os_ranks(lang.code, OS_DIR)
    rows = read_top_n_os(filepath, top_n, min_count=min_count)
    print(f'  Corpus     : {len(rows):,} tokens read from {filepath.name} (min_count={min_count})')

    entries, _ = build_corpus_entries(
        rows, lang.code, nlp,
        corpus_ranks=corpus_ranks,
        skip_words=skip_words,
        verbose=verbose,
        source='os_corpus',
    )
    print(f'  Candidates : {len(entries)} new open-class words after filtering')
    return entries


def mine_lang(
    lang: Lang,
    batch: int,
    min_count: int,
    top_n: int,
    no_translate: bool,
    verbose: bool,
    corpus_file: str = '50k',
) -> List[dict]:
    """
    Mine the corpus for words this language doesn't have yet.

    Returns the new entries. Nothing is written here — pipeline.py appends them
    to the curated file only when --write was given.
    """
    print(f'\n── {lang.name.upper()} ({lang.code}) ──')

    curated = read(lang.code)
    if not curated:
        return []

    skip_words = {e['word'].lower() for e in curated if e.get('word')}
    next_rank  = max((e.get('rank') or 0 for e in curated), default=0) + 1
    print(f'  Curated    : {len(curated)} existing entries (next rank: {next_rank})')

    candidates = extract_candidates(lang, skip_words, top_n, min_count, verbose,
                                    corpus_file=corpus_file)
    if not candidates:
        print('  No new candidates found.')
        return []

    cache = load_cache(lang)
    print(f'  Cache      : {len(cache)} previously fetched glosses\n')

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

        # Guard against a candidate that duplicates something already curated
        # (lemmatisation can map two surface forms onto one headword).
        if word.lower() in skip_words:
            continue

        glosses, source = get_glosses(lang, word, cache, no_translate)

        if not glosses:
            skipped_no_gloss += 1
            if verbose:
                print(f'    SKIP (no gloss): {word}')
            continue

        entry = build_curated_entry(
            lang=lang,
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
        skip_words.add(word.lower())
        next_rank += 1

        status = '✓' if source != 'empty' else '?'
        print(f'    {status} [{len(new_entries):3d}/{batch}] {word:22s} → {glosses[0]}  ({source})')

    print(f'\n  New entries  : {len(new_entries)}')
    print(f'  No gloss skip: {skipped_no_gloss}')

    return new_entries


# ══════════════════════════════════════════════════════════════════════════════
# DEDUPE — drop duplicate and junk entries
# ══════════════════════════════════════════════════════════════════════════════

def is_corpus_row(entry: dict) -> bool:
    return entry.get('source') == 'corpus' or 'corpus' in (entry.get('tags') or [])


def richness(entry: dict) -> int:
    """Rough count of how much real content an entry carries."""
    score = 0
    score += len([g for g in (entry.get('glosses') or []) if g])
    score += len(entry.get('examples') or []) * 2
    score += 2 if (entry.get('notes') or '').strip() else 0
    score += len(entry.get('domains') or [])
    ling = entry.get('linguistic') or {}
    if ling.get('conjugations') or ling.get('conjugation_class'):
        score += 3
    if ling.get('gender') or ling.get('plural'):
        score += 1
    if entry.get('pos'):
        score += 1
    return score


def better(a: Tuple[int, dict], b: Tuple[int, dict]) -> Tuple[int, dict]:
    """Pick the entry to keep. Each argument is (original_index, entry)."""
    ai, ae = a
    bi, be = b
    a_corpus, b_corpus = is_corpus_row(ae), is_corpus_row(be)
    if a_corpus != b_corpus:
        return b if a_corpus else a          # hand-curated wins
    ra, rb = richness(ae), richness(be)
    if ra != rb:
        return a if ra > rb else b           # richer wins
    return a if ai <= bi else b              # earlier wins


def looks_like_junk(word: str, drop_words: set) -> bool:
    w = (word or '').strip().lower()
    if not w:
        return True
    if w in drop_words:
        return True
    if len(w) == 1 and w not in {'a', 'y', 'o', 'e', 'à', 'é', 'ó', 'u', 'i'}:
        return True
    return False


def dedupe_lang(lang_code: str, rows: List[dict],
                drop_words: set) -> Tuple[List[dict], int, int]:
    """
    Remove junk and duplicate entries.

    Returns (survivors, junk_dropped, duplicates_removed). Caller persists.
    """
    print(f'  Entries      : {len(rows)}')

    # Drop junk first so it can't win a duplicate contest
    junk = [r for r in rows if looks_like_junk(r.get('word', ''), drop_words)]
    if junk:
        print(f'  Junk dropped : {len(junk)} ({", ".join(repr(r.get("word")) for r in junk[:8])}'
              f'{"…" if len(junk) > 8 else ""})')
    rows = [r for r in rows if not looks_like_junk(r.get('word', ''), drop_words)]

    keep: Dict[str, Tuple[int, dict]] = {}
    for idx, entry in enumerate(rows):
        word = (entry.get('word') or '').strip().lower()
        if word in keep:
            keep[word] = better(keep[word], (idx, entry))
        else:
            keep[word] = (idx, entry)

    removed = len(rows) - len(keep)
    if removed:
        counts: Dict[str, int] = {}
        for entry in rows:
            w = (entry.get('word') or '').strip().lower()
            counts[w] = counts.get(w, 0) + 1
        dupes = [w for w, n in counts.items() if n > 1]
        print(f'  Duplicates   : {removed} extra rows across {len(dupes)} words')
        print(f'                 e.g. {", ".join(dupes[:10])}{"…" if len(dupes) > 10 else ""}')
    else:
        print('  Duplicates   : none')

    # Preserve the original ordering of the entries we kept
    survivors = [entry for _, entry in sorted(keep.values(), key=lambda pair: pair[0])]
    print(f'  Result       : {len(survivors)} entries')

    return (survivors, len(junk), removed)


# ══════════════════════════════════════════════════════════════════════════════
# BACKFILL — fill pos/glosses so the sync step stops skipping rows
# ══════════════════════════════════════════════════════════════════════════════

VALID_POS = {
    'verb', 'noun', 'adjective', 'adverb', 'pronoun',
    'preposition', 'conjunction', 'article', 'interjection', 'numeral',
}

# spaCy's universal tags → the app's vocabulary
SPACY_POS_MAP = {
    'VERB': 'verb',    'AUX':   'verb',        'NOUN': 'noun',   'PROPN': 'noun',
    'ADJ':  'adjective', 'ADV': 'adverb',      'PRON': 'pronoun',
    'ADP':  'preposition', 'CCONJ': 'conjunction', 'SCONJ': 'conjunction',
    'DET':  'article',  'INTJ': 'interjection', 'NUM':  'numeral',
}


# ── Loading ───────────────────────────────────────────────────────────────────


def load_preseed(lang_name: str) -> Dict[str, dict]:
    """word (lowercased) → preseed entry. The curated-style file wins over the
    bulkier OpenSubtitles one, which is noisier."""
    index: Dict[str, dict] = {}
    for fname in (f'{lang_name}_preseed_os.jsonl', f'{lang_name}_preseed.jsonl'):
        for entry in read_jsonl(PRESEED_DIR / fname):
            word = (entry.get('word') or '').strip().lower()
            if word:
                index[word] = entry          # later file overwrites → preferred
    return index


# ── Field completion ──────────────────────────────────────────────────────────

def is_complete(entry: dict) -> bool:
    """The exact test the sync step applies before importing."""
    return bool(
        entry.get('word')
        and entry.get('translation')
        and entry.get('pos')
        and [g for g in (entry.get('glosses') or []) if g]
    )


def glosses_from_translation(translation: str) -> List[str]:
    """"to play / to act, to gamble" → ["to play", "to act", "to gamble"]"""
    parts: List[str] = []
    for chunk in translation.replace(';', ',').replace('/', ',').split(','):
        gloss = chunk.strip()
        if gloss and gloss not in parts:
            parts.append(gloss)
    return parts


def clean_pos(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    pos = str(value).strip().lower()
    return pos if pos in VALID_POS else None


class SpacyTagger:
    """Lazy spaCy loader — absent models simply mean no tagging."""

    def __init__(self, lang_code: str, enabled: bool):
        self.nlp = None
        self.reason = 'disabled (--no-spacy)' if not enabled else None
        if not enabled:
            return
        model = SPACY_MODELS.get(lang_code)
        if not model:
            self.reason = f'no spaCy model configured for {lang_code}'
            return
        try:
            import spacy
        except ImportError:
            self.reason = 'spaCy not installed'
            return
        try:
            self.nlp = spacy.load(model)
        except OSError:
            self.reason = f'model {model} not downloaded (python -m spacy download {model})'

    def pos(self, word: str) -> Optional[str]:
        if self.nlp is None:
            return None
        doc = self.nlp(word)
        if not len(doc):
            return None
        return clean_pos(SPACY_POS_MAP.get(doc[0].pos_))


# ── Backfill ──────────────────────────────────────────────────────────────────

def backfill_lang(lang_code: str, entries: List[dict],
                  use_spacy: bool) -> Tuple[int, int, int]:
    """
    Fill missing pos/glosses in place so the sync step stops skipping rows.

    Returns (filled, still_missing_pos, already_complete). Caller persists.
    """
    lang_name = LANG_NAMES.get(lang_code, lang_code)
    preseed = load_preseed(lang_name)
    tagger  = SpacyTagger(lang_code, use_spacy)

    print(f'  Entries      : {len(entries)}')
    print(f'  Preseed      : {len(preseed)} words available')
    print(f'  spaCy        : {"ready" if tagger.nlp else tagger.reason}')

    complete = sum(1 for e in entries if is_complete(e))
    filled = 0
    no_pos: List[str] = []
    pos_sources = {'preseed': 0, 'spacy': 0}
    gloss_sources = {'preseed': 0, 'translation': 0}

    for entry in entries:
        if is_complete(entry):
            continue

        word        = (entry.get('word') or '').strip()
        translation = (entry.get('translation') or '').strip()
        if not word or not translation:
            no_pos.append(word or '?')
            continue

        source = preseed.get(word.lower(), {})

        # ── Part of speech — never invented ──
        pos = clean_pos(entry.get('pos')) or clean_pos(source.get('pos'))
        if pos:
            if not clean_pos(entry.get('pos')):
                pos_sources['preseed'] += 1
        else:
            pos = tagger.pos(word)
            if pos:
                pos_sources['spacy'] += 1

        if not pos:
            no_pos.append(word)
            continue

        # ── Glosses ──
        glosses = [g for g in (entry.get('glosses') or []) if g]
        if not glosses:
            glosses = [g for g in (source.get('glosses') or []) if g]
            if glosses:
                gloss_sources['preseed'] += 1
        if not glosses:
            glosses = glosses_from_translation(translation)
            if glosses:
                gloss_sources['translation'] += 1
        if not glosses:
            no_pos.append(word)
            continue

        entry['pos']     = pos
        entry['glosses'] = glosses
        if not entry.get('lang'):
            entry['lang'] = lang_name
        # Machine-completed rather than hand-curated — flag for a later pass.
        entry['needs_review'] = True
        tags = entry.setdefault('tags', [])
        if 'backfilled' not in tags:
            tags.append('backfilled')
        filled += 1

    print(f'  Already OK   : {complete}')
    print(f'  Filled       : {filled}   (pos: {pos_sources["preseed"]} preseed, '
          f'{pos_sources["spacy"]} spaCy | glosses: {gloss_sources["preseed"]} preseed, '
          f'{gloss_sources["translation"]} translation)')
    print(f'  Still no POS : {len(no_pos)}')
    if no_pos:
        preview = ', '.join(no_pos[:8])
        print(f'                 e.g. {preview}{"…" if len(no_pos) > 8 else ""}')
        print(f'                 install spaCy + the {lang_code} model and re-run to catch these')
    print(f'  Would import : {complete + filled} of {len(entries)}')

    return (filled, len(no_pos), complete)


# ══════════════════════════════════════════════════════════════════════════════
# ENRICH — gender, domains, canonical domain names
# ══════════════════════════════════════════════════════════════════════════════
# Each of these mutates the entry list in place and returns what changed, so
# pipeline.py can apply the same change to the database and keep the two in
# step. Spanish only for now — the rules are language-specific.

MASC_EXCEPTIONS_A = {
    'día', 'mapa', 'problema', 'programa', 'sistema', 'tema', 'clima',
    'idioma', 'diploma', 'fantasma', 'panorama', 'poema', 'dilema',
    'esquema', 'drama', 'trauma', 'coma', 'telegrama', 'enigma',
    'aroma', 'síntoma', 'lema', 'emblema', 'teorema', 'fonema',
    'pijama', 'sofá', 'papá', 'mamá', 'planeta', 'cometa', 'profeta',
}

# Feminine words that end in -o
FEM_EXCEPTIONS_O = {'mano', 'foto', 'moto', 'radio', 'nao'}

# Strong feminine suffixes (very reliable)
FEMININE_SUFFIXES = [
    'ción', 'sión', 'tión', 'xión',   # nación, misión, cuestión
    'dad', 'tad', 'tud',               # ciudad, libertad, virtud
    'eza',                             # belleza, riqueza
    'ncia',                            # distancia, infancia
    'ura',                             # cultura, temperatura
    'umbre',                           # costumbre, cumbre
    'triz',                            # actriz, directriz
]

# Strong masculine suffixes
MASCULINE_SUFFIXES = [
    'aje',   # viaje, mensaje
    'ismo',  # turismo, optimismo
]


def infer_gender(word: str) -> str | None:
    """
    Return 'masculine', 'feminine', or None (uncertain).
    Conservative — only returns a value when highly confident.
    """
    w = word.lower()

    # Check exception lists first
    if w in MASC_EXCEPTIONS_A:
        return 'masculine'
    if w in FEM_EXCEPTIONS_O:
        return 'feminine'

    # Strong feminine suffixes
    for suf in FEMININE_SUFFIXES:
        if w.endswith(suf):
            return 'feminine'

    # Strong masculine suffixes
    for suf in MASCULINE_SUFFIXES:
        if w.endswith(suf):
            return 'masculine'

    # Final vowel rules (high confidence)
    if w.endswith('o'):
        return 'masculine'
    if w.endswith('a'):
        return 'feminine'

    # Everything else (-e, -or, -al, -il, -ón, -és, etc.) — too ambiguous
    return None


def enrich_gender(entries: List[dict]) -> Dict[str, str]:
    """
    Fill in gender for Spanish nouns that don't have one.

    Returns {word: gender} for the entries that changed.
    """
    nouns = [e for e in entries if e.get('pos') == 'noun']
    changes: Dict[str, str] = {}
    already = uncertain = 0

    for e in nouns:
        ling = e.setdefault('linguistic', {})
        if ling.get('gender'):
            already += 1
            continue
        g = infer_gender(e['word'])
        if g:
            ling['gender'] = g
            changes[e['word']] = g
        else:
            uncertain += 1

    dist = Counter(changes.values())
    print(f'  Nouns        : {len(nouns)}')
    print(f'  Already set  : {already}')
    print(f'  Inferred     : {len(changes)}  '
          f'(masculine {dist["masculine"]}, feminine {dist["feminine"]})')
    print(f'  Uncertain    : {uncertain}')
    return changes

DOMAIN_KEYWORDS: dict[str, set[str]] = {
    'food': {
        'eat','food','cook','meal','fruit','vegetable','meat','fish','bread',
        'cheese','soup','salad','drink','beer','wine','coffee','tea','sugar',
        'salt','rice','potato','chicken','beef','pork','flour','butter','milk',
        'egg','sauce','spice','herb','oil','vinegar','flavor','taste','hungry',
        'thirst','kitchen','restaurant','recipe','ingredient','bake','fry',
        'roast','boil','grill','dessert','cake','pie','pasta','noodle',
        'sandwich','toast','cereal','cream','honey','jam','chocolate','candy',
        'snack','diet','nutrition','calorie','menu','feast','appetite','cuisine',
        'seafood','shrimp','lobster','oyster','clam','avocado','tomato','onion',
        'garlic','pepper','lemon','orange','apple','banana','grape','strawberry',
        'melon','watermelon','pineapple','mango','peach','plum','cherry',
    },
    'animals': {
        'dog','cat','fish','bird','horse','cow','pig','chicken','animal','wolf',
        'lion','tiger','bear','rabbit','snake','insect','bee','ant','butterfly',
        'whale','shark','eagle','owl','duck','sheep','goat','deer','monkey',
        'elephant','frog','turtle','lizard','crocodile','parrot','dove','crow',
        'sparrow','swallow','salmon','trout','cod','tuna','octopus','squid',
        'dolphin','seal','penguin','flamingo','peacock','turkey','hen','rooster',
        'donkey','mule','camel','giraffe','zebra','rhino','hippo','gorilla',
        'chimpanzee','mouse','rat','squirrel','fox','deer','reindeer','moose',
        'bat','beetle','fly','mosquito','spider','worm','snail','crab',
    },
    'body': {
        'head','hand','arm','leg','face','eye','ear','mouth','nose','foot',
        'shoulder','chest','back','throat','skin','heart','brain','blood',
        'bone','muscle','finger','toe','nail','knee','elbow','wrist','ankle',
        'hip','neck','chin','cheek','forehead','tongue','tooth','lip','jaw',
        'skull','spine','rib','lung','liver','kidney','stomach','intestine',
        'vein','artery','nerve','hair','eyebrow','eyelash','beard','mustache',
        'palm','heel','sole','knuckle','temple','brow',
    },
    'family': {
        'mother','father','son','daughter','brother','sister','wife','husband',
        'family','parent','child','grandparent','grandmother','grandfather',
        'aunt','uncle','cousin','nephew','niece','relative','ancestor',
        'sibling','spouse','widow','widower','orphan','twin','baby','infant',
        'toddler','teenager','adult','elderly','senior','generation',
        'stepmother','stepfather','stepson','stepdaughter','godfather',
        'godmother','in-law','fiancé','fiancée','newborn',
    },
    'health': {
        'doctor','hospital','medicine','disease','illness','pain','treatment',
        'surgery','health','sick','fever','wound','pill','drug','nurse',
        'patient','symptom','diagnosis','cure','pharmacy','clinic','injury',
        'accident','emergency','ambulance','therapy','vaccine','virus',
        'bacteria','infection','allergy','cancer','diabetes','depression',
        'anxiety','heart attack','stroke','fracture','blood pressure',
        'prescription','antibiotic','vitamin','mineral','supplement',
        'diet','exercise','wellness','hygiene','dental','optical',
        'headache','nausea','vomit','diarrhea','constipation','rash',
    },
    'education': {
        'school','university','study','student','teacher','class','book',
        'lesson','homework','exam','grade','knowledge','learn','professor',
        'lecture','degree','diploma','course','library','pencil','notebook',
        'dictionary','classroom','campus','faculty','tutor','pupil',
        'kindergarten','primary','secondary','academy','college','institute',
        'scholarship','thesis','research','laboratory','science','history',
        'mathematics','literature','geography','physics','chemistry','biology',
        'philosophy','psychology','sociology','economics','language','grammar',
        'spelling','reading','writing','arithmetic',
    },
    'work': {
        'work','job','office','business','money','company','employee','boss',
        'salary','profession','career','industry','economy','market','trade',
        'finance','bank','invest','profit','budget','accountant','manager',
        'colleague','meeting','project','contract','deadline','client',
        'customer','product','service','department','organization','institution',
        'factory','workshop','labor','union','strike','unemployment','hire',
        'fire','promotion','retire','pension','income','expense','tax',
        'invoice','receipt','salary','wage','bonus','commission','freelance',
    },
    'travel': {
        'travel','trip','hotel','airport','train','bus','road','map','passport',
        'visa','tourism','flight','ticket','luggage','border','destination',
        'tourist','guide','reservation','journey','voyage','cruise','tour',
        'itinerary','accommodation','hostel','motel','resort','check-in',
        'boarding','departure','arrival','delay','transfer','connection',
        'customs','immigration','currency','exchange','souvenir','adventure',
        'backpack','suitcase','camera','guide book',
    },
    'nature': {
        'tree','flower','river','mountain','forest','sea','sky','sun','moon',
        'star','cloud','rain','wind','earth','stone','grass','leaf','root',
        'beach','desert','lake','ocean','island','valley','hill','soil',
        'plant','seed','branch','trunk','bark','moss','fern','bush','shrub',
        'glacier','volcano','earthquake','tsunami','hurricane','tornado',
        'lightning','thunder','snow','ice','frost','fog','mist','dew',
        'waterfall','creek','stream','bay','cape','peninsula','cliff',
        'cave','canyon','plateau','plain','prairie','meadow','swamp',
    },
    'home': {
        'house','home','room','door','window','floor','ceiling','wall','chair',
        'table','bed','sofa','pillow','blanket','carpet','lamp','shelf',
        'closet','wardrobe','drawer','desk','mirror','sink','toilet','shower',
        'bathtub','fridge','oven','microwave','dishwasher','washing machine',
        'vacuum','broom','mop','bucket','furniture','decoration','curtain',
        'blind','tile','brick','paint','wallpaper','roof','chimney','garage',
        'basement','attic','balcony','porch','terrace','garden','fence','gate',
    },
    'clothing': {
        'wear','cloth','shirt','pants','dress','shoe','jacket','coat','hat',
        'sock','underwear','suit','tie','skirt','sweater','belt','scarf',
        'glove','boot','sandal','fabric','fashion','style','outfit','costume',
        'uniform','jersey','shorts','jeans','blouse','cardigan','hoodie',
        'vest','cape','cloak','robe','gown','pajama','swimsuit','bikini',
        'bra','collar','sleeve','hem','pocket','zip','button','thread','needle',
        'tailor','seamstress','textile','linen','cotton','wool','silk','leather',
    },
    'transport': {
        'car','bus','train','plane','ship','bicycle','motorcycle','taxi',
        'subway','drive','fly','sail','transport','vehicle','engine','wheel',
        'fuel','highway','bridge','tunnel','traffic','pedestrian','driver',
        'passenger','pilot','captain','sailor','truck','van','lorry',
        'helicopter','speedboat','ferry','tram','metro','cable car',
        'scooter','skateboard','rollerblades','parking','garage','petrol',
        'diesel','electric','hybrid','speed','brake','steering','license',
    },
    'technology': {
        'computer','phone','internet','software','hardware','digital','screen',
        'keyboard','mouse','data','network','app','website','program','code',
        'machine','robot','electronic','device','smartphone','tablet','laptop',
        'server','database','algorithm','artificial','intelligence','wifi',
        'bluetooth','cable','battery','charger','signal','television','radio',
        'camera','satellite','laser','semiconductor','microchip','processor',
        'memory','storage','download','upload','stream','social media',
    },
    'emotions': {
        'happy','sad','angry','fear','love','hate','joy','grief','hope',
        'despair','emotion','feeling','mood','surprised','worried','calm',
        'excited','bored','lonely','proud','shame','guilt','envy','jealous',
        'nervous','anxious','depressed','content','satisfied','frustrated',
        'disappointed','amused','nostalgic','melancholy','euphoria','panic',
        'rage','fury','sorrow','regret','relief','gratitude','affection',
        'admire','respect','trust','distrust','compassion','empathy',
    },
    'sports': {
        'sport','game','play','team','ball','goal','win','lose','race','match',
        'athlete','football','basketball','tennis','swimming','running',
        'exercise','gym','coach','player','champion','tournament','olympic',
        'medal','trophy','score','referee','stadium','court','field','track',
        'cycling','skiing','boxing','wrestling','martial arts','golf','rugby',
        'volleyball','baseball','softball','cricket','badminton','table tennis',
        'gymnastics','athletics','triathlon','marathon','sprint','relay','jump',
    },
    'politics': {
        'government','president','minister','parliament','election','vote',
        'party','law','constitution','democracy','republic','policy','leader',
        'nation','state','authority','senator','congress','candidate','ballot',
        'campaign','reform','revolution','protest','diplomacy','treaty',
        'ambassador','embassy','sanction','ally','opposition','monarchy',
        'emperor','king','queen','prime minister','governor','mayor',
        'council','committee','legislation','bill','decree','order',
    },
    'military': {
        'soldier','army','war','weapon','gun','bomb','attack','defense',
        'battle','combat','military','officer','rank','command','enemy',
        'troops','navy','air force','marine','infantry','artillery','tank',
        'missile','nuclear','spy','intelligence','strategy','tactic',
        'siege','surrender','victory','defeat','casualty','prisoner',
        'patrol','mission','operation','base','headquarters','uniform',
        'badge','general','colonel','captain','lieutenant','sergeant',
    },
    'religion': {
        'god','prayer','church','temple','faith','belief','soul','spirit',
        'holy','sacred','sin','heaven','hell','angel','devil','religious',
        'worship','ritual','ceremony','blessing','curse','miracle','saint',
        'bible','quran','torah','priest','monk','nun','mosque','synagogue',
        'cathedral','chapel','mass','sermon','baptism','communion','meditation',
        'karma','reincarnation','paradise','pilgrimage','prophet','apostle',
    },
    'geography': {
        'country','city','village','region','province','capital','continent',
        'east','west','north','south','location','place','area','territory',
        'border','coast','latitude','longitude','equator','pole','hemisphere',
        'urban','rural','suburban','metropolitan','district','municipality',
        'prefecture','county','township','neighborhood','avenue','street',
        'square','plaza','harbor','port','canal','dam',
    },
    'art_culture': {
        'art','paint','draw','sculpture','museum','gallery','artist','creative',
        'design','image','photo','film','theater','actor','perform','music',
        'song','sing','instrument','concert','dance','literature','novel',
        'poem','story','myth','legend','tradition','culture','heritage',
        'festival','carnival','exhibition','masterpiece','style','genre',
        'melody','harmony','rhythm','opera','ballet','jazz','folk','classical',
    },
    'law': {
        'law','legal','court','judge','lawyer','attorney','crime','criminal',
        'police','arrest','trial','sentence','prison','jail','fine','penalty',
        'rights','justice','innocent','guilty','verdict','evidence','witness',
        'prosecutor','defendant','appeal','constitution','regulation','rule',
        'contract','agreement','property','ownership','liability','copyright',
        'patent','trademark','treaty','statute','ordinance','ban','prohibition',
    },
    'science': {
        'science','experiment','theory','hypothesis','research','discovery',
        'element','atom','molecule','cell','organism','evolution','gravity',
        'force','energy','matter','mass','velocity','acceleration','frequency',
        'wave','radiation','magnetic','electric','chemical','reaction',
        'equation','formula','variable','laboratory','microscope','telescope',
        'physicist','chemist','biologist','geologist','astronomer',
    },
    'time': {
        'time','hour','minute','second','day','week','month','year',
        'morning','afternoon','evening','night','today','yesterday','tomorrow',
        'century','decade','era','period','moment','instant','duration',
        'schedule','calendar','clock','watch','date','season','spring',
        'summer','autumn','winter','dawn','dusk','midnight','noon',
        'ancient','modern','contemporary','future','past','present',
    },
    'numbers_quantity': {
        'number','count','amount','quantity','total','sum','half','quarter',
        'double','triple','percent','fraction','decimal','zero','hundred',
        'thousand','million','billion','infinity','measure','weight','volume',
        'length','width','height','depth','size','scale','ratio','proportion',
    },
    'communication': {
        'speak','talk','say','tell','ask','answer','question','conversation',
        'language','word','sentence','phrase','meaning','translate','interpret',
        'write','read','letter','message','email','call','text','announce',
        'declare','explain','describe','discuss','argue','debate','negotiate',
        'greet','introduce','apologize','thank','complain','promise','warn',
    },
    'mind_thought': {
        'think','idea','thought','memory','imagine','dream','believe','know',
        'understand','reason','logic','opinion','view','perspective','concept',
        'theory','philosophy','wisdom','intelligence','consciousness','mind',
        'brain','attention','focus','concentration','creativity','intuition',
        'judgment','decision','choice','preference','opinion','doubt',
    },
}


def get_search_text(entry: dict) -> str:
    """Combine translation and all glosses into one lowercase string."""
    parts = []
    if entry.get('translation'):
        parts.append(entry['translation'])
    for g in (entry.get('glosses') or []):
        if g:
            parts.append(g)
    return ' '.join(parts).lower()


def match_domains(text: str) -> list[str]:
    """Return list of matched domain names (may be empty)."""
    words = set(re.findall(r'\b\w+\b', text))
    matched = []
    for domain, keywords in DOMAIN_KEYWORDS.items():
        if keywords & words:
            matched.append(domain)
    return matched


def enrich_domains(entries: List[dict]) -> int:
    """
    Assign specific domains to entries still stuck on general/essential.
    Entries that already carry real domains are left alone.

    Returns the number of entries changed.
    """
    domain_counter: Counter = Counter()
    dropped: Counter = Counter()
    changed = 0

    for e in entries:
        existing = set(e.get('domains') or [])
        if not (existing <= {'general', 'essential', ''}):
            continue

        matched = match_domains(get_search_text(e))
        if not matched:
            continue

        new_domains = list(matched)
        if 'essential' in existing:
            new_domains.insert(0, 'essential')

        # Run the assignment through the canonicaliser before storing it.
        # Without this, enrich can hand out a name canonicalise then deletes
        # ('numbers_quantity'), so the next run re-assigns it and the two steps
        # flip the same entries back and forth forever.
        canonical = canonicalize(new_domains, e.get('word', ''))
        for d in set(new_domains) - set(canonical):
            dropped[d] += 1
        if not canonical or set(canonical) <= {'general', 'essential', ''}:
            continue

        e['domains'] = canonical

        for d in canonical:
            if d != 'essential':
                domain_counter[d] += 1
        changed += 1

    if dropped:
        print(f'  Not canonical: {dict(dropped)} — assigned by the keyword rules '
              f'but absent from CANONICAL, so dropped')
    print(f'  Enriched     : {changed} entries')
    for domain, n in domain_counter.most_common(8):
        print(f'      {domain:18s} {n}')
    if len(domain_counter) > 8:
        print(f'      … and {len(domain_counter) - 8} more domains')
    return changed

MERGE: dict[str, str | None] = {
    # Art / culture cluster
    'art_culture':   'art',
    'culture':       'art',
    'film':          'art',
    'theatre':       'art',
    'entertainment': 'art',
    'history':       'art',
    'architecture':  'art',

    # Music stays but audio folds in
    'audio':         'music',

    # Emotions
    'emotion':       'emotions',

    # Sports
    'sport':         'sports',
    'games':         'sports',

    # Food absorbs drink
    'drink':         'food',

    # Law cluster
    'crime':         'law',
    'legal':         'law',
    'police':        'law',

    # Government / politics
    'government':    'politics',
    'royalty':       'politics',

    # Work / economy cluster
    'business':      'work',
    'commerce':      'work',
    'finance':       'work',
    'administration':'work',
    'industry':      'work',
    'retail':        'work',

    # Home cluster
    'furniture':     'home',
    'housing':       'home',
    'hotel':         'travel',

    # Technology
    'internet':      'technology',
    'media':         'technology',

    # Nature
    'weather':       'nature',
    'fishing':       'nature',
    'space':         'science',

    # Education / mind
    'academic':      'education',
    'language':      'education',
    'physics':       'science',
    'maths':         'science',
    'philosophy':    'mind',
    'ethics':        'mind',
    'mind_thought':  'mind',

    # Clothing
    'fashion':       'clothing',

    # Communication
    'journalism':    'communication',

    # Religion
    'holiday':       'religion',
    'supernatural':  'religion',

    # Geography
    'place':         'geography',
    'city':          'geography',
    'direction':     'geography',

    # Drop — too vague or tiny
    'everyday':      None,
    'colloquial':    None,
    'social':        None,
    'events':        None,
    'logistics':     None,
    'measurement':   None,
    'nightlife':     None,
    'emergency':     'medicine',
    'administration':None,  # overridden below by 'work'
    'location':      None,
    'sport_':        None,
    'finance_':      None,
}

# Fix duplicate key collision (Python dicts keep last value)
MERGE['administration'] = 'work'

# ── Medicine words: Spanish words that should get 'medicine' domain ────────────
# These move OUT of 'health' into 'medicine'
MEDICINE_WORDS = {
    'doctor','médico','médica','hospital','enfermero','enfermera',
    'cirujano','cirujana','farmacia','pastilla','medicina','vacuna',
    'ambulancia','emergencia','operación','paciente','receta',
    'diagnóstico','síntoma','clínica','antibiótico','medicamento',
    'dosis','quirúrgico','anestesia','jeringa','radiografía',
    'especialista','pediatra','psiquiatra','terapeuta','dentista',
    'oculista','óptico','ortopedista','cardiólogo','oncólogo',
    'neurológico','tratamiento','cirugía','biopsia','sutura',
    'intravenoso','transfusión','donante','trasplante','prótesis',
}

# Body-part words that are in 'health' but belong in 'body'
BODY_WORDS_IN_HEALTH = {
    'sangre','cerebro','hueso','músculo','pulmón','riñón','hígado',
    'vejiga','páncreas','apéndice','tráquea','esófago',
}

CANONICAL = {
    'animals','art','body','clothing','communication','education',
    'emotions','family','food','geography','health','home','law',
    'medicine','military','mind','music','nature','politics',
    'religion','science','sports','technology','time','transport',
    'travel','work','essential','grammar',
}


def canonicalize(domains: list[str], word: str) -> list[str]:
    """Map a word's existing domain list to canonical domains."""
    result: set[str] = set()

    for d in domains:
        if d in CANONICAL:
            result.add(d)
        elif d in MERGE:
            target = MERGE[d]
            if target:
                result.add(target)
        # else: unknown domain not in merge table → drop

    # Health → medicine / body split
    if 'health' in result:
        if word in MEDICINE_WORDS:
            result.discard('health')
            result.add('medicine')
        elif word in BODY_WORDS_IN_HEALTH:
            result.discard('health')
            result.add('body')

    # Words that should have medicine regardless of current domains
    if word in MEDICINE_WORDS and 'medicine' not in result:
        result.add('medicine')

    return sorted(result)


def canonicalize_all(entries: List[dict]) -> int:
    """
    Merge noisy/duplicate domain names into the canonical set, in place.
    Returns the number of entries changed.
    """
    before: Counter = Counter()
    after:  Counter = Counter()
    changed = 0

    for e in entries:
        old = e.get('domains') or []
        for d in old:
            before[d] += 1
        new = canonicalize(old, e.get('word', ''))
        for d in new:
            after[d] += 1
        if new != old:
            e['domains'] = new
            changed += 1

    print(f'  Canonicalised: {changed} entries')
    moved = [(d, before.get(d, 0), after.get(d, 0))
             for d in sorted(set(before) | set(after))
             if before.get(d, 0) != after.get(d, 0)]
    for d, b, a in moved[:8]:
        print(f'      {d:18s} {b:5d} → {a:5d}')
    if len(moved) > 8:
        print(f'      … and {len(moved) - 8} more domains')
    return changed



# ══════════════════════════════════════════════════════════════════════════════
# PRE-SYNC CLEANUPS
# ══════════════════════════════════════════════════════════════════════════════

def fill_conjugations(entries: List[dict], lang: str) -> int:
    """Fill null preterite/imperfect for verbs that use the legacy conjugations
    dict (non-Spanish languages).  Spanish is skipped — its verbs use the
    rule engine via conjugation_class + overrides instead."""
    if lang == 'spa':
        return 0  # Spanish uses verb_rules engine, not mlconjug3

    try:
        import mlconjug3
    except ImportError:
        print('  Conjugations: skipped (mlconjug3 not installed)')
        return 0

    tense_map     = TENSE_MAP.get(lang, {})
    mlconjug_code = MLCONJUG3_LANG.get(lang)
    if not tense_map or not mlconjug_code:
        return 0

    conjugator = mlconjug3.Conjugator(language=mlconjug_code)
    filled = 0

    for entry in entries:
        if entry.get('pos') != 'verb':
            continue
        conj = entry.get('linguistic', {}).get('conjugations')
        if not conj:
            continue
        needs_pret = conj.get('preterite') is None
        needs_imp  = conj.get('imperfect') is None
        if not needs_pret and not needs_imp:
            continue

        infinitive = entry.get('linguistic', {}).get('infinitive') or entry['word']
        try:
            verb_obj = conjugator.conjugate(infinitive)
            info = getattr(verb_obj, 'conjug_info', None)
            if callable(info):
                info = info()
        except Exception:
            continue

        changed = False
        for tense_key, needs in [('preterite', needs_pret), ('imperfect', needs_imp)]:
            if not needs:
                continue
            mood, label = tense_map.get(tense_key, (None, None))
            if not mood:
                continue
            mood_data  = info.get(mood, {}) if info else {}
            tense_data = mood_data.get(label) or mood_data.get(f'{mood} {label}')
            if not tense_data:
                continue
            forms = [f if f and f not in ('-', '') else None for f in tense_data.values()]
            if any(forms):
                conj[tense_key] = forms
                changed = True

        if changed:
            filled += 1

    return filled


def fix_translation(entries: List[dict]) -> int:
    """Promote second gloss to translation when translation == word. Returns count fixed."""
    fixed = 0
    for entry in entries:
        word    = entry.get('word', '')
        translation = entry.get('translation', '')
        glosses = entry.get('glosses') or []

        if translation.lower() != word.lower() and translation:
            continue  # already has a distinct English translation

        better = next(
            (g for g in glosses if g and g.lower() != word.lower()), None
        )
        if better:
            entry['translation'] = better
            fixed += 1

    return fixed
