#!/usr/bin/env python3
"""
clean_wikicorpora.py  —  VocabApp data pipeline entry point
============================================================
Produces one JSONL file per language containing:

  1. HARDCODED entries (always included, regardless of --n)
       • Function words  — see hardcoded_data.py
       • Irregular verbs — conjugations generated here via mlconjug3

  2. CORPUS entries (top --n open-class words from Wikipedia frequency data)
       • Only nouns, verbs and adjectives are extracted.
       • Verbs receive conjugation tables via mlconjug3.
       • Closed-class words are covered by the hardcoded list above.

Output  →  data/wikicorpus_{lang}.jsonl

Usage:
    python backend/scripts/data/clean_wikicorpora.py
    python backend/scripts/data/clean_wikicorpora.py --langs spa --n 5000
    python backend/scripts/data/clean_wikicorpora.py --langs spa fra ita por --n 0

    # Diagnose conjugation key structure first:
    python backend/scripts/data/debug_conjugations.py

Dependencies:
    pip install spacy mlconjug3
    python -m spacy download es_core_news_sm  # (and fr / it / pt equivalents)
    mlconjug3 is optional — irregular verbs are written without conjugation
    tables and can be enriched later.
"""

import argparse
import copy
import re
import subprocess
import sys
import warnings
from pathlib import Path
from typing import Dict, List, Optional, Tuple

# Suppress sklearn pickle-version noise from mlconjug3's bundled models.
# These are warnings, not errors — they don't affect conjugation correctness
# for the known-verb lookups we use here.
warnings.filterwarnings('ignore', message='.*InconsistentVersionWarning.*')
warnings.filterwarnings('ignore', message='.*Trying to unpickle estimator.*')

# All function words and irregular verb lists live in hardcoded_data.py.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from hardcoded_data import LANGUAGE_DATA   # noqa: E402

try:
    import spacy
    SPACY_AVAILABLE = True
except ImportError:
    print("Warning: spaCy not installed — corpus extraction will be skipped.")
    print("  pip install spacy")
    SPACY_AVAILABLE = False

try:
    import mlconjug3
    MLCONJUG3_VERSION = getattr(mlconjug3, '__version__', 'unknown')
    MLCONJUG3_AVAILABLE = True
except ImportError:
    MLCONJUG3_VERSION = None
    print("Warning: mlconjug3 not installed — irregular verbs will have no conjugations.")
    print("  pip install mlconjug3")
    MLCONJUG3_AVAILABLE = False


# ══════════════════════════════════════════════════════════════════════════════
# PATHS
# ══════════════════════════════════════════════════════════════════════════════

SCRIPT_DIR   = Path(__file__).resolve().parent          # backend/scripts/data/
PROJECT_ROOT = SCRIPT_DIR.parent.parent.parent          # VocabApp/
CORPUS_DIR   = PROJECT_ROOT / 'data' / 'wikipedia_freq_corpora' / 'raw'
OUTPUT_DIR   = PROJECT_ROOT / 'data'


# ══════════════════════════════════════════════════════════════════════════════
# LANGUAGE CONFIG
# ══════════════════════════════════════════════════════════════════════════════

SPACY_MODELS: Dict[str, str] = {
    'deu': 'de_core_news_sm',
    'fra': 'fr_core_news_sm',
    'ita': 'it_core_news_sm',
    'jpn': 'ja_core_news_sm',
    'por': 'pt_core_news_sm',
    'rus': 'ru_core_news_sm',
    'spa': 'es_core_news_sm',
    'zho': 'zh_core_news_sm',
}

LANG_NAMES: Dict[str, str] = {
    'spa': 'spanish',
    'fra': 'french',
    'ita': 'italian',
    'por': 'portuguese',
    'deu': 'german',
    'rus': 'russian',
    'jpn': 'japanese',
    'zho': 'chinese',
}

MLCONJUG3_LANG: Dict[str, str] = {
    'spa': 'es',
    'fra': 'fr',
    'ita': 'it',
    'por': 'pt',
}

# Map app tense names to (mlconjug3 mood, mlconjug3 tense label).
#
# If conjugations are wrong, run debug_conjugations.py to see the exact key
# names your installed mlconjug3 version uses, then update here.
#
# Lookup behaviour in build_conjugations():
#   1. mood_data.get(tense_label)              — exact match (French, old v3)
#   2. mood_data.get(f"{mood} {tense_label}")  — mood-prefixed (v4 for spa/ita/por)
#
# mlconjug3 4.x notes:
#   spa/ita  — has BOTH uppercase (broken, 1-form) and lowercase (correct, 6-form)
#              keys; use lowercase tense labels so the prefixed lookup finds the
#              correct lowercase key.
#   por      — lowercase indicativo tenses; conditional key is
#              'Futuro do Pretérito Simples'; subjunctive mood is 'Conjuntivo'
#              with keys like 'Conjuntivo  Subjuntivo Presente' (2 spaces —
#              achieved via a leading space in the tense_label below).
#   fra      — still uses old bare key format (e.g. 'Présent') — exact match works.
TENSE_MAP: Dict[str, Dict[str, Tuple[str, str]]] = {
    'spa': {
        'present':     ('Indicativo',  'presente'),
        'preterite':   ('Indicativo',  'pretérito perfecto simple'),
        'imperfect':   ('Indicativo',  'pretérito imperfecto'),
        'future':      ('Indicativo',  'futuro'),
        'conditional': ('Condicional', 'Condicional'),   # key: 'Condicional Condicional'
        'subjunctive': ('Subjuntivo',  'presente'),
        'imperative':  ('Imperativo',  'Afirmativo'),    # key: 'Imperativo Afirmativo'
    },
    'fra': {
        'present':     ('Indicatif',    'Présent'),
        'preterite':   ('Indicatif',    'Passé simple'),
        'imperfect':   ('Indicatif',    'Imparfait'),
        'future':      ('Indicatif',    'Futur simple'),
        'conditional': ('Conditionnel', 'Présent'),
        'subjunctive': ('Subjonctif',   'Présent'),
        'imperative':  ('Impératif',    'Présent'),
    },
    'ita': {
        # All lowercase in mlconjug3 4.x — prefixed lookup builds correct key.
        'present':     ('Indicativo',   'presente'),
        'preterite':   ('Indicativo',   'passato remoto'),
        'imperfect':   ('Indicativo',   'imperfetto'),
        'future':      ('Indicativo',   'futuro semplice'),
        'conditional': ('Condizionale', 'presente'),
        'subjunctive': ('Congiuntivo',  'presente'),
        'imperative':  ('Imperativo',   'Affermativo'),  # key: 'Imperativo Affermativo'
    },
    'por': {
        # Indicativo tenses are lowercase. Subjunctive mood is 'Conjuntivo';
        # the tense key has a double space: 'Conjuntivo  Subjuntivo Presente',
        # produced by the leading space in the tense_label below.
        'present':     ('Indicativo',  'presente'),
        'preterite':   ('Indicativo',  'pretérito perfeito simples'),
        'imperfect':   ('Indicativo',  'pretérito imperfeito'),
        'future':      ('Indicativo',  'Futuro do Presente Simples'),
        'conditional': ('Condicional', 'Futuro do Pretérito Simples'),
        'subjunctive': ('Conjuntivo',  ' Subjuntivo Presente'),   # leading space intentional
        'imperative':  ('Imperativo',  'Afirmativo'),
    },
}

OPEN_CLASS_POS = {'noun', 'verb', 'adjective'}

POS_GROUPS: Dict[str, str] = {
    'NOUN':  'noun',   'PROPN': 'noun',
    'VERB':  'verb',   'AUX':   'verb',
    'ADJ':   'adjective',
    'ADV':   'adverb',
    'PRON':  'pronoun',
    'ADP':   'preposition',
    'CCONJ': 'conjunction',  'SCONJ': 'conjunction',
    'DET':   'article',
    'NUM':   'other',  'INTJ': 'other',
    'PART':  'other',  'PUNCT':'other',
    'SYM':   'other',  'X':    'other',
}

RANK_START = 101
NUMERIC_RE = re.compile(r'^\d+[%]?$')


# ══════════════════════════════════════════════════════════════════════════════
# RANK -> METADATA HELPERS
# ══════════════════════════════════════════════════════════════════════════════

def rank_to_band(rank: int) -> str:
    if rank <= 100:  return 'A1'
    if rank <= 500:  return 'A2'
    if rank <= 1500: return 'B1'
    if rank <= 3000: return 'B2'
    if rank <= 6000: return 'C1'
    return 'C2'

def rank_to_difficulty(rank: int) -> int:
    if rank <= 100:  return 1
    if rank <= 500:  return 2
    if rank <= 2000: return 3
    if rank <= 5000: return 4
    return 5


# ══════════════════════════════════════════════════════════════════════════════
# CORPUS ENTRY FACTORY
# ══════════════════════════════════════════════════════════════════════════════

def corpus_entry(word: str, pos_group: str, rank_clean: int,
                 corpus_count: int, lang_code: str) -> dict:
    """Build a corpus-sourced entry for an open-class word."""
    is_verb    = pos_group == 'verb'
    band       = rank_to_band(rank_clean)
    difficulty = rank_to_difficulty(rank_clean)
    tags       = ['corpus']
    if rank_clean <= 1000:
        tags.append('frequent')

    return {
        'rank':       rank_clean,
        'word':       word,
        'display':    '',
        'pos':        pos_group,
        'difficulty': difficulty,
        'tags':       tags,
        'notes':      '',
        'glosses':    [],
        'examples':   [],
        'linguistic': {
            'infinitive':   word if is_verb else None,
            'reflexive':    None,
            'gender':       None,
            'plural':       None,
            'register':     'neutral',
            'ipa':          '',
            'syllables':    [],
            'conjugations': None,
            'irregular':    False,
        },
        'relations':  {'commonly_confused_with': [], 'related': [], 'synonyms': [], 'antonyms': []},
        'frequency':  {'band': band, 'rank': rank_clean, 'corpus_frequency': corpus_count},
        'domains':    [],
        'register':   'neutral',
        'lang':       LANG_NAMES.get(lang_code, lang_code),
        'source':     'wikicorpus',
        'needs_review': True,
    }


# ══════════════════════════════════════════════════════════════════════════════
# MLCONJUG3 — CONJUGATION GENERATION
# ══════════════════════════════════════════════════════════════════════════════

_conjugators: Dict[str, object] = {}


def get_conjugator(lang_code: str):
    if not MLCONJUG3_AVAILABLE:
        return None
    ml_lang = MLCONJUG3_LANG.get(lang_code)
    if not ml_lang:
        return None
    if ml_lang not in _conjugators:
        try:
            with warnings.catch_warnings():
                warnings.simplefilter('ignore')
                _conjugators[ml_lang] = mlconjug3.Conjugator(language=ml_lang)
        except Exception as e:
            print(f"  Warning: could not create Conjugator for '{ml_lang}': {e}")
            _conjugators[ml_lang] = None
    return _conjugators[ml_lang]


def _extract_conjug_info(verb) -> Optional[dict]:
    """
    Pull the mood->tense->forms dict out of a mlconjug3 Verb object.
    Handles API differences across mlconjug3 versions.
    Returns None if nothing usable is found.
    """
    info = getattr(verb, 'conjug_info', None)
    if isinstance(info, dict) and info:
        return info

    iterate_fn = getattr(verb, 'iterate', None)
    if callable(iterate_fn):
        try:
            info = {}
            for item in iterate_fn():
                if hasattr(item, '_asdict'):
                    d = item._asdict()
                    mood, tense, person, form = (
                        d.get('mood', d.get('Mood', '')),
                        d.get('tense', d.get('Tense', '')),
                        d.get('person', d.get('Person', '')),
                        d.get('form', d.get('Form', '')),
                    )
                else:
                    mood, tense, person, form = item[0], item[1], item[2], item[3]
                info.setdefault(mood, {}).setdefault(tense, {})[person] = form
            if info:
                return info
        except Exception:
            pass

    return None


def build_conjugations(infinitive: str, lang_code: str,
                       verbose: bool = False,
                       capture_error: bool = False):
    """
    Return a conjugation dict keyed by app tense name, or None on failure.
    Each value is a list of forms in person order (1s 2s 3s 1p 2p 3p).

    If capture_error=True returns (None, error_string) on failure so the
    caller can surface diagnostic information.
    """
    conjugator = get_conjugator(lang_code)
    if not conjugator:
        err = "no conjugator available"
        return (None, err) if capture_error else None

    err: Optional[str] = None
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('ignore')
            verb = conjugator.conjugate(infinitive)

        if verb is None:
            raise ValueError("conjugate() returned None")

        info = _extract_conjug_info(verb)
        if info is None:
            attrs = [a for a in dir(verb) if not a.startswith('_')]
            raise ValueError(
                f"could not extract conjug_info from {type(verb).__name__}. "
                f"Available attrs: {attrs}"
            )

        tense_map = TENSE_MAP.get(lang_code, {})
        result: Dict[str, Optional[list]] = {}

        for app_tense, (mood, tense_label) in tense_map.items():
            mood_data = info.get(mood)
            if mood_data is None:
                if verbose:
                    print(f"    [{infinitive}] mood '{mood}' not found. "
                          f"Available: {list(info.keys())}")
                result[app_tense] = None
                continue

            # Try bare label first (French / exact match), then mood-prefixed
            # (mlconjug3 >= 4.0 uses keys like 'Indicativo presente').
            tense_data = (
                mood_data.get(tense_label)
                or mood_data.get(f"{mood} {tense_label}")
            )
            if tense_data is None:
                if verbose:
                    print(f"    [{infinitive}] tense '{tense_label}' not in '{mood}'. "
                          f"Available: {list(mood_data.keys())}")
                result[app_tense] = None
                continue

            # Validate the result has meaningful content (not a single-form
            # garbage entry from the broken uppercase keys in mlconjug3 4.x).
            raw = dict(tense_data)
            forms = [v for v in raw.values() if v and v not in ('-', '')]
            if not forms:
                result[app_tense] = None
                continue

            result[app_tense] = list(raw.values())

        return result if any(v is not None for v in result.values()) else None

    except Exception as exc:
        err = f"{type(exc).__name__}: {exc}"
        if verbose:
            print(f"    [{infinitive}] conjugation failed: {err}")
        return (None, err) if capture_error else None


# ══════════════════════════════════════════════════════════════════════════════
# SPACY — CORPUS EXTRACTION
# ══════════════════════════════════════════════════════════════════════════════

def ensure_spacy_model(lang: str) -> bool:
    if not SPACY_AVAILABLE:
        return False
    model = SPACY_MODELS.get(lang)
    if not model:
        return False
    try:
        spacy.load(model)
        return True
    except OSError:
        print(f"  Downloading spaCy model '{model}' ...")
        try:
            subprocess.check_call(
                [sys.executable, '-m', 'spacy', 'download', model],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            )
            return True
        except subprocess.CalledProcessError:
            print(f"  Warning: failed to download '{model}'")
            return False


def analyze_word(nlp, word: str) -> Tuple[Optional[str], Optional[str], Optional[str]]:
    try:
        doc = nlp(word)
        if doc and len(doc) > 0:
            tok = doc[0]
            pos = tok.pos_
            return tok.lemma_.lower(), pos, POS_GROUPS.get(pos, 'other')
    except Exception:
        pass
    return None, None, None


def find_corpus_dir(lang: str) -> Optional[Path]:
    for entry in CORPUS_DIR.iterdir():
        if entry.is_dir() and entry.name.startswith(lang):
            return entry
    return None


def find_words_file(folder: Path, lang: str) -> Path:
    for fname in folder.iterdir():
        if fname.name.startswith(lang) and '-words' in fname.name:
            return fname
    raise FileNotFoundError(f"No '*-words*' file for '{lang}' in '{folder}'")


def parse_corpus_line(line: str) -> Optional[Tuple[int, str, int]]:
    tokens = re.split(r'\s+', line.strip())
    if len(tokens) < 3:
        return None
    try:
        return int(tokens[0]), tokens[1], int(tokens[2])
    except ValueError:
        return None


def read_top_n(filepath: Path, n: int) -> List[Tuple[int, str, int]]:
    results = []
    with open(filepath, encoding='utf-8', errors='replace') as f:
        for raw in f:
            parsed = parse_corpus_line(raw)
            if not parsed:
                continue
            rank, word, count = parsed
            if rank < RANK_START:
                continue
            results.append((rank, word, count))
            if len(results) >= n:
                break
    return results


def build_corpus_entries(rows: List[Tuple[int, str, int]],
                         lang_code: str, nlp,
                         verbose: bool = False) -> List[dict]:
    lemma_map: Dict[str, dict] = {}

    for _, word, count in rows:
        if ' ' in word:
            continue
        lemma, pos, pos_group = analyze_word(nlp, word)
        if not lemma:
            continue
        if pos == 'PROPN':
            continue
        if pos == 'NUM' or NUMERIC_RE.match(lemma):
            continue
        if len(lemma) < 2:
            continue
        if pos_group not in OPEN_CLASS_POS:
            continue
        if lemma not in lemma_map or count > lemma_map[lemma]['_count']:
            lemma_map[lemma] = {'_count': count, '_pos_group': pos_group}

    sorted_items = sorted(lemma_map.items(), key=lambda x: x[1]['_count'], reverse=True)

    entries = [
        corpus_entry(
            word=lemma,
            pos_group=data['_pos_group'],
            rank_clean=rank_clean,
            corpus_count=data['_count'],
            lang_code=lang_code,
        )
        for rank_clean, (lemma, data) in enumerate(sorted_items, start=1)
    ]

    # Add conjugations for corpus verbs.
    if MLCONJUG3_AVAILABLE and lang_code in TENSE_MAP:
        verbs = [e for e in entries if e['pos'] == 'verb']
        conj_ok = conj_fail = 0
        for entry in verbs:
            inf = entry['linguistic']['infinitive']
            conj = build_conjugations(inf, lang_code, verbose=verbose)
            if conj:
                entry['linguistic']['conjugations'] = conj
                conj_ok += 1
            else:
                conj_fail += 1
        print(f"  Corpus verbs : {len(verbs)} total — "
              f"{conj_ok} conjugated, {conj_fail} skipped")

    return entries


# ══════════════════════════════════════════════════════════════════════════════
# OUTPUT
# ══════════════════════════════════════════════════════════════════════════════

def write_jsonl(outpath: Path, entries: List[dict]) -> None:
    import json
    with open(outpath, 'w', encoding='utf-8') as f:
        for entry in entries:
            f.write(json.dumps(entry, ensure_ascii=False) + '\n')


# ══════════════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════════════

def main(langs: List[str], n: int, verbose: bool) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    print(f"Corpus dir  : {CORPUS_DIR}")
    print(f"Output dir  : {OUTPUT_DIR}")
    print(f"Languages   : {', '.join(langs)}")
    print(f"Corpus top  : {n:,} tokens per language")
    print(f"mlconjug3   : {MLCONJUG3_VERSION or 'not installed'}")
    if verbose:
        print("Verbose     : on (conjugation key mismatches will be printed)")
    print()

    for lang in langs:
        data = LANGUAGE_DATA.get(lang)
        if not data:
            print(f"[{lang}] No hardcoded data registered — skipping.\n")
            continue

        print(f"-- {lang} " + "-" * 50)

        fn_words  = copy.deepcopy(data['function_words'])
        irr_verbs = copy.deepcopy(data['irregular_verbs'])

        # Fill conjugations for hardcoded irregular verbs
        if MLCONJUG3_AVAILABLE:
            print(f"  Conjugating {len(irr_verbs)} irregular verbs "
                  f"(mlconjug3 {MLCONJUG3_VERSION}) ...")
            conj_ok = conj_fail = 0
            first_error: Optional[str] = None
            try:
                for entry in irr_verbs:
                    inf  = entry['linguistic']['infinitive']
                    conj = build_conjugations(inf, lang, verbose=verbose,
                                              capture_error=(first_error is None))
                    if isinstance(conj, tuple):
                        conj, first_error = conj
                    if conj:
                        entry['linguistic']['conjugations'] = conj
                        conj_ok += 1
                    else:
                        conj_fail += 1
                        if verbose:
                            print(f"    No conjugations produced for '{inf}'")
            except Exception as exc:
                first_error = f"Unexpected loop error: {type(exc).__name__}: {exc}"
                print(f"  ERROR during conjugation loop: {first_error}")

            msg = f"  Conjugations : {conj_ok} OK, {conj_fail} failed"
            if conj_fail and not verbose:
                if first_error:
                    msg += f"\n  First error  : {first_error}"
                    msg += "\n  Hint: run with --verbose or debug_conjugations.py"
            print(msg)
        else:
            print("  mlconjug3 not available — irregular verbs written without conjugations.")

        hardcoded_entries = fn_words + irr_verbs
        print(f"  Hardcoded  : {len(fn_words)} function words "
              f"+ {len(irr_verbs)} irregular verbs = {len(hardcoded_entries)} total")

        # Corpus entries
        corpus_entries_out: List[dict] = []
        if n == 0:
            print("  Corpus     : skipped (--n 0)")
        elif not SPACY_AVAILABLE:
            print("  Corpus     : skipped (spaCy not installed)")
        elif not ensure_spacy_model(lang):
            print(f"  Corpus     : skipped (spaCy model unavailable for '{lang}')")
        else:
            try:
                nlp = spacy.load(SPACY_MODELS[lang])
            except OSError as e:
                print(f"  Corpus     : skipped ({e})")
                nlp = None

            if nlp:
                corpus_dir = find_corpus_dir(lang)
                if not corpus_dir:
                    print(f"  Corpus     : skipped (no folder for '{lang}' in {CORPUS_DIR})")
                else:
                    try:
                        words_file = find_words_file(corpus_dir, lang)
                        print(f"  Corpus src : {words_file}")
                        rows = read_top_n(words_file, n)
                        print(f"  Tokens read: {len(rows):,}")
                        corpus_entries_out = build_corpus_entries(
                            rows, lang, nlp, verbose=verbose
                        )
                        print(f"  Corpus     : {len(corpus_entries_out):,} entries after filtering")
                    except FileNotFoundError as e:
                        print(f"  Corpus     : skipped ({e})")

        all_entries = hardcoded_entries + corpus_entries_out
        outpath     = OUTPUT_DIR / f'wikicorpus_{lang}.jsonl'
        write_jsonl(outpath, all_entries)
        print(f"  Output     : {len(all_entries)} entries -> {outpath}\n")

    print("Done.")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(
        description='Build VocabApp seed JSONL: hardcoded function words + '
                    'irregular verbs (with mlconjug3 conjugations) + corpus open-class words.'
    )
    parser.add_argument(
        '--langs', nargs='+',
        default=['spa', 'fra', 'ita', 'por'],
        help='Language codes (default: spa fra ita por)',
    )
    parser.add_argument(
        '--n', type=int, default=10_000,
        help='Max corpus tokens per language before filtering (0 = hardcoded only, default: 10000)',
    )
    parser.add_argument(
        '--verbose', action='store_true',
        help='Print conjugation key mismatches -- use when conjugations are missing',
    )
    args = parser.parse_args()
    main(args.langs, args.n, args.verbose)
