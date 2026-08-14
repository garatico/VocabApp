"""
lib/corpus.py — frequency-corpus extraction and entry building
==============================================================
Turns a raw frequency list into clean, open-class vocabulary entries:

  * reading OpenSubtitles / Wikipedia frequency files
  * spaCy lemmatisation and POS tagging
  * filtering out proper nouns, numerals, English, and the conjugated verb
    forms spaCy mislabels when handed a bare word with no sentence context
  * mlconjug3 verb conjugation

Pure library — no CLI. Driven by pipeline.py's `mine` step.
"""

import re
import subprocess
import sys
import warnings
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from .config import (
    LANG_NAMES, SPACY_MODELS, MLCONJUG3_LANG, TENSE_MAP,
    POS_GROUPS, WIKT_LANG, OS_LANG,
    rank_to_band, rank_to_difficulty,
)

try:
    import spacy
    SPACY_AVAILABLE = True
except ImportError:
    print("Warning: spaCy not installed - corpus extraction will be skipped.")
    print("  pip install spacy")
    SPACY_AVAILABLE = False

try:
    import mlconjug3
    MLCONJUG3_VERSION = getattr(mlconjug3, '__version__', 'unknown')
    MLCONJUG3_AVAILABLE = True
except ImportError:
    MLCONJUG3_VERSION = None
    print("Warning: mlconjug3 not installed - verbs will have no conjugations.")
    print("  pip install mlconjug3")
    MLCONJUG3_AVAILABLE = False


# ==============================================================================
# CONSTANTS
# ==============================================================================

# Corpus rows below this rank are closed-class (function words).
# They are hardcoded; the corpus only supplies their frequency.
RANK_START = 101

OPEN_CLASS_POS = {'noun', 'verb', 'adjective'}

# Valid infinitive endings per language.
# Verb lemmas that don't end with one of these are conjugated forms that spaCy
# failed to lemmatise correctly. Drop them - the true infinitive will appear
# elsewhere in the corpus with a higher frequency.
VERB_INFINITIVE_ENDINGS: Dict[str, Tuple[str, ...]] = {
    'spa': ('ar', 'er', 'ir', 'ír'),
    'fra': ('er', 'ir', 're', 'oir', 'oire'),
    'ita': ('are', 'ere', 'ire'),
    'por': ('ar', 'er', 'ir'),
}

# Conjugated verb suffixes that are unambiguously verbal - never noun endings.
# spaCy sometimes misclassifies conjugated forms as NOUN/ADJ when given a
# single word with no sentence context.  Any token whose surface form ends
# with one of these suffixes is a conjugated verb form; we skip it so the
# corpus only carries infinitives (which appear elsewhere and get picked up
# correctly).
CONJ_VERB_SUFFIXES: Dict[str, Tuple[str, ...]] = {
    'spa': (
        # Conditional - plural / 2nd-person forms.
        # NOTE: 1s/3s '-ria' is omitted because it collides with
        # real nouns like 'libreria', 'panaderia', 'secretaria'.
        'ríamos', 'ríais', 'rían',
        # Gerunds (no Spanish noun ends in -ando / -iendo / -yendo;
        # rare false positives like 'comando'/'bando' are acceptable)
        'ando', 'iendo', 'yendo',
        # Imperfect -ar verbs: 3rd-person plural and both plural persons.
        # (1s/2s '-aba'/'-abas' omitted - they match some noun stems.)
        'aban', 'ábamos', 'abais',
        # Imperfect -er/-ir verbs, plural and 2nd-person forms.
        # NOTE: 1s/3s '-ia' is omitted because it collides with
        # nouns like 'energia', 'alegria', 'policia', 'guia'.
        'íamos', 'íais', 'ían',
        # Preterite plurals
        'aron', 'ieron',
    ),
    'fra': (
        # Conditional plurals / 3rd-person forms
        'rait', 'rais', 'rions', 'riez', 'raient',
        # Imperfect plurals
        'aient', 'ions', 'iez',
        # Gerund (present participle)
        'ant',
    ),
    'ita': (
        # Conditional
        'rebbe', 'rebbero', 'remmo',
        # Gerunds
        'ando', 'endo',
        # Imperfect plurals
        'avano', 'evano', 'ivano',
    ),
    'por': (
        # Conditional plurals
        'ríamos', 'ríeis', 'riam',
        # Gerunds
        'ando', 'endo',
        # Imperfect -ar plurals
        'avam', 'áveis',
        # Imperfect -er/-ir plurals
        'íamos', 'íeis', 'iam',
        # Preterite plurals
        'aram', 'eram',
    ),
}

# Explicit per-language blocklist for high-frequency conjugated forms whose
# surface spelling is too short or ambiguous for suffix rules to catch them
# reliably (e.g. 1s/3s imperfect and conditional forms that would also match
# legitimate nouns if we used a bare '-ia' / '-ria' suffix rule).
# These are forms that spaCy consistently misclassifies as NOUN when given
# a single word without sentence context.
KNOWN_CONJUGATED_FORMS: Dict[str, set] = {
    'spa': {
        # Imperfect 1s/3s - common irregular verbs.
        # Suffix rule cannot catch these because '-ia' also ends real nouns
        # (energia, alegria, policia...), so we list them explicitly instead.
        'tenía', 'hacía', 'sabía', 'podía', 'quería', 'veía',
        'venía', 'ponía', 'traía', 'decía', 'vivía', 'seguía',
        'salía', 'moría', 'oía', 'caía', 'creía', 'leía',
        # Conditional 1s/3s - common irregular verbs.
        # '-ria' suffix is omitted from CONJ_VERB_SUFFIXES because it also
        # ends nouns like 'libreria'; these high-frequency forms are listed here instead.
        'podría', 'tendría', 'habría', 'sería', 'haría',
        'diría', 'vendría', 'pondría', 'querría', 'sabría',
        'valdría', 'saldría', 'caería', 'traería', 'daría',
        # Subjunctive present - irregular stems that have no noun meaning
        'sea', 'sepa', 'vaya', 'diga', 'haga', 'ponga', 'tenga',
        'traiga', 'caiga', 'salga', 'valga', 'venga', 'quepa',
        # Present 1s -go forms that spaCy misclassifies as ADJ/NOUN without sentence context.
        # Only forms with NO competing noun meaning are listed (juego=game, pago=payment,
        # riego=irrigation etc. are intentionally omitted since they're real nouns).
        'tengo', 'vengo', 'traigo', 'caigo', 'salgo', 'valgo', 'pongo',
        'apago', 'llego', 'entrego', 'distingo', 'extingo', 'cuelgo',
    },
}

NUMERIC_RE       = re.compile(r'^\d+[%]?$')
NUMERIC_BROAD_RE = re.compile(r'^[\d][,.\d]+[%]?$')
# Periods catch abbreviations (d.c, u.s.a); hyphens catch fragments (mid-word)
_BAD_CHARS_RE    = re.compile(r'[:/\\@#=<>{}|^~`\[\]"' + r"\'*+.]|\d")
_ROMAN_CHARS_RE  = re.compile(r'^[ivxlcdm]+$', re.IGNORECASE)
ROMAN_NUMERAL_RE = re.compile(
    r'^m{0,4}(cm|cd|d?c{0,3})(xc|xl|l?x{0,3})(ix|iv|v?i{0,3})$',
    re.IGNORECASE
)


# ==============================================================================
# LEMMA VALIDATION
# ==============================================================================

def is_valid_corpus_lemma(lemma: str) -> bool:
    """
    Return False for lemmas that should be excluded from the corpus:
      - Multi-word tokens
      - Too short (< 3 chars; real short words are hardcoded)
      - Contains digits or special characters
      - No actual letters
      - Roman numerals (from Wikipedia references)
    """
    if ' ' in lemma:
        return False
    if len(lemma) < 3:
        return False
    if _BAD_CHARS_RE.search(lemma):
        return False
    if not re.search(r'[a-zA-ZÀ-ÿ]', lemma):
        return False
    if _ROMAN_CHARS_RE.match(lemma) and ROMAN_NUMERAL_RE.match(lemma):
        return False
    return True


# ==============================================================================
# CORPUS ENTRY FACTORY
# ==============================================================================

def corpus_entry(word: str, pos_group: str, rank_clean: int,
                 corpus_count: int, lang_code: str,
                 source: str = 'wikicorpus') -> dict:
    is_verb    = pos_group == 'verb'
    band       = rank_to_band(rank_clean)
    difficulty = rank_to_difficulty(rank_clean)
    tags       = ['corpus']
    if rank_clean <= 1000:
        tags.append('frequent')
    return {
        'rank':       rank_clean,
        'word':       word,
        'translation':    '',
        'pos':        pos_group,
        'difficulty': difficulty,
        'tags':       tags,
        'notes':      '',
        'glosses':    [],
        'examples':   [],
        'linguistic': {
            'infinitive':        word if is_verb else None,
            'reflexive':         None,
            'gender':            None,
            'plural':            None,
            'register':          'neutral',
            'ipa':               '',
            'syllables':         [],
            'conjugation_class': None,   # set during review (e.g. 'regular-ar')
            'overrides':         {},
            'irregular':         False,
        },
        'relations':  {'commonly_confused_with': [], 'related': [], 'synonyms': [], 'antonyms': []},
        'frequency':  {'band': band, 'rank': rank_clean, 'corpus_frequency': corpus_count},
        'domains':    ['general'],
        'register':   'neutral',
        'lang':       LANG_NAMES.get(lang_code, lang_code),
        'source':     source,
        'needs_review': True,
    }


# ==============================================================================
# CONJUGATION
# ==============================================================================

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
    info = getattr(verb, 'conjug_info', None)
    if isinstance(info, dict) and info:
        return info
    iterate_fn = getattr(verb, 'iterate', None)
    if callable(iterate_fn):
        try:
            info = {}
            for item in iterate_fn():
                if hasattr(item, '_asdict'):
                    d      = item._asdict()
                    mood   = d.get('mood',   d.get('Mood',   ''))
                    tense  = d.get('tense',  d.get('Tense',  ''))
                    person = d.get('person', d.get('Person', ''))
                    form   = d.get('form',   d.get('Form',   ''))
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
    Each value is a list of forms in 1s/2s/3s/1p/2p/3p order.
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
            raise ValueError(f"could not extract conjug_info from {type(verb).__name__}")

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

            raw   = dict(tense_data)
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


# ==============================================================================
# SPACY - CORPUS EXTRACTION
# ==============================================================================

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


def find_corpus_dir(lang: str, corpus_dir: Path) -> Optional[Path]:
    if not corpus_dir.exists():
        return None
    for entry in corpus_dir.iterdir():
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


def load_corpus_ranks(lang: str, corpus_dir: Path) -> Dict[str, dict]:
    """Read corpus frequency file and return {word: {'rank': int, 'count': int}}."""
    try:
        lang_dir = find_corpus_dir(lang, corpus_dir)
        if not lang_dir:
            return {}
        words_file = find_words_file(lang_dir, lang)
        ranks: Dict[str, dict] = {}
        with open(words_file, encoding='utf-8', errors='replace') as f:
            for raw in f:
                parsed = parse_corpus_line(raw)
                if parsed:
                    rank, word, count = parsed
                    key = word.lower()
                    if key not in ranks or count > ranks[key]['count']:
                        ranks[key] = {'rank': rank, 'count': count}
        return ranks
    except Exception:
        return {}


# ==============================================================================
# OPENSUBTITLES CORPUS
# ==============================================================================

def parse_opensubtitles_line(line: str, rank: int) -> Optional[Tuple[int, str, int]]:
    """
    Parse one line from an OpenSubtitles frequency file ('word count' format).
    Rank is supplied by the caller (line position in file).
    """
    parts = line.strip().split()
    if len(parts) < 2:
        return None
    try:
        return rank, parts[0], int(parts[1])
    except ValueError:
        return None


def find_os_corpus_file(lang: str, os_dir: Path,
                        prefer: str = '50k') -> Optional[Path]:
    """
    Locate the OpenSubtitles frequency file for a language.
    Directory structure: os_dir / {iso} / {iso}_50k.txt  and  {iso}_full.txt

    prefer='50k'  the curated 50,000-word list. Sensible words, already
                  filtered by whoever built it. The default.
    prefer='full' the complete corpus — 1.2M lines for Spanish. Everything
                  past the first ~50k is increasingly typos, proper nouns and
                  inflected forms, so raise --min-count when using it.
    """
    iso = OS_LANG.get(lang)
    if not iso:
        return None
    lang_dir = os_dir / iso
    if not lang_dir.exists():
        return None

    order = ((f'{iso}_full.txt', f'{iso}_50k.txt') if prefer == 'full'
             else (f'{iso}_50k.txt', f'{iso}_full.txt'))
    for name in order:
        candidate = lang_dir / name
        if candidate.exists():
            return candidate
    return None


def read_top_n_os(filepath: Path, n: int,
                  min_count: int = 500) -> List[Tuple[int, str, int]]:
    """
    Read up to n entries from an OpenSubtitles frequency file.
    Skips the first RANK_START-1 lines (closed-class function words at the top).
    Stops early if a line count drops below min_count - at that frequency words
    are too rare to be useful and noise starts to dominate.
    Rank equals the line position in the file.
    """
    results = []
    with open(filepath, encoding='utf-8', errors='replace') as f:
        for line_rank, raw in enumerate(f, start=1):
            if line_rank < RANK_START:
                continue
            parsed = parse_opensubtitles_line(raw, line_rank)
            if not parsed:
                continue
            rank, word, count = parsed
            if count < min_count:
                break  # file is sorted descending; no point reading further
            results.append(parsed)
            if n > 0 and len(results) >= n:
                break
    return results


def load_os_ranks(lang: str, os_dir: Path) -> Dict[str, dict]:
    """
    Load the full OpenSubtitles frequency table for rank lookup.
    Returns {word_lower: {'rank': int, 'count': int}}.
    """
    try:
        filepath = find_os_corpus_file(lang, os_dir)
        if not filepath:
            return {}
        ranks: Dict[str, dict] = {}
        with open(filepath, encoding='utf-8', errors='replace') as f:
            for line_rank, raw in enumerate(f, start=1):
                parsed = parse_opensubtitles_line(raw, line_rank)
                if parsed:
                    rank, word, count = parsed
                    key = word.lower()
                    if key not in ranks:
                        ranks[key] = {'rank': rank, 'count': count}
        return ranks
    except Exception:
        return {}


def deduplicate_lemma_map(lemma_map: Dict[str, dict],
                          lang_code: str) -> Dict[str, dict]:
    """
    Merge plural/feminine variants into their canonical singular/masculine form.
    """
    to_remove: set = set()

    for lemma, data in list(lemma_map.items()):
        if lemma in to_remove:
            continue

        if lemma.endswith('es') and len(lemma) > 4:
            base = lemma[:-2]
            if base in lemma_map and base not in to_remove:
                lemma_map[base]['_count'] = max(lemma_map[base]['_count'], data['_count'])
                lemma_map[base]['_rank']  = min(lemma_map[base]['_rank'],  data['_rank'])
                to_remove.add(lemma)
                continue
        if lemma.endswith('s') and len(lemma) > 3:
            base = lemma[:-1]
            if base in lemma_map and base not in to_remove:
                lemma_map[base]['_count'] = max(lemma_map[base]['_count'], data['_count'])
                lemma_map[base]['_rank']  = min(lemma_map[base]['_rank'],  data['_rank'])
                to_remove.add(lemma)
                continue

        if (lang_code in ('spa', 'por', 'ita')
                and lemma.endswith('a')
                and len(lemma) > 3
                and data['_pos_group'] == 'adjective'):
            masculine = lemma[:-1] + 'o'
            masc_data = lemma_map.get(masculine)
            if (masc_data and masculine not in to_remove
                    and masc_data['_pos_group'] == 'adjective'):
                lemma_map[masculine]['_count'] = max(lemma_map[masculine]['_count'], data['_count'])
                lemma_map[masculine]['_rank']  = min(lemma_map[masculine]['_rank'],  data['_rank'])
                to_remove.add(lemma)

    return {k: v for k, v in lemma_map.items() if k not in to_remove}


def load_english_blocklist(os_dir: Path,
                           top_n: int = 10_000,
                           spanish_whitelist_n: int = 3_000) -> set:
    """
    Build an English word blocklist from the OpenSubtitles English corpus.

    Words are included if they appear in the top-N English OS words AND are
    NOT in the top spanish_whitelist_n Spanish OS words. The cross-reference
    prevents legitimate Spanish-English shared words (final, control, hotel,
    no) from being incorrectly blocked.

    Words shorter than 3 chars are always excluded.
    """
    en_file = os_dir / 'en' / 'en_50k.txt'
    es_file = os_dir / 'es' / 'es_50k.txt'
    if not en_file.exists():
        print(f"  Warning: English blocklist unavailable - {en_file} not found.")
        print("  English words (met, dino, amir, etc.) will not be filtered from OS corpus.")
        return set()

    spanish_common: set = set()
    if es_file.exists():
        try:
            with open(es_file, encoding='utf-8', errors='replace') as f:
                for line_rank, raw in enumerate(f, start=1):
                    if line_rank > spanish_whitelist_n:
                        break
                    parts = raw.strip().split()
                    if parts:
                        spanish_common.add(parts[0].lower())
        except Exception:
            pass

    blocklist: set = set()
    try:
        with open(en_file, encoding='utf-8', errors='replace') as f:
            for line_rank, raw in enumerate(f, start=1):
                if line_rank > top_n:
                    break
                parts = raw.strip().split()
                if len(parts) >= 2 and len(parts[0]) >= 3:
                    word = parts[0].lower()
                    if word not in spanish_common:
                        blocklist.add(word)
    except Exception:
        pass
    return blocklist


def build_corpus_entries(rows: List[Tuple[int, str, int]],
                         lang_code: str, nlp,
                         corpus_ranks: Optional[Dict[str, dict]] = None,
                         verbose: bool = False,
                         source: str = 'wikicorpus',
                         strict_vocab: Optional[set] = None,
                         skip_words: Optional[set] = None,
                         curated_map: Optional[Dict[str, dict]] = None) -> Tuple[List[dict], Dict[str, dict]]:
    """
    Process corpus rows into open-class vocabulary entries.

    Also collects closed-class (function word) frequency data from the rows so
    hardcoded entries can be updated with their real corpus counts in main().

    Args:
        strict_vocab:  English blocklist - words in this set are dropped.
        skip_words:    Words already covered by hardcoded or curated entries.
                       Skipped early so they don't appear twice in the preseed.
        curated_map:   {word_lower: entry} for curated entries.  When a corpus
                       row matches a curated word, its frequency is applied
                       directly to the curated entry rather than discarded.

    Returns:
        (entries, closed_class_freq)
    """
    lemma_map:         Dict[str, dict] = {}
    closed_class_freq: Dict[str, dict] = {}
    total_rows = len(rows)

    for row_idx, (corpus_rank, word, count) in enumerate(rows):
        print(f"\r  [{row_idx + 1:,}/{total_rows:,}]  {word:<30}", end='', flush=True)
        if ' ' in word:
            continue
        lemma, pos, pos_group = analyze_word(nlp, word)
        if not lemma:
            continue

        w_lower = word.lower()

        # If the word is already covered by a curated entry, pull the corpus
        # frequency directly into that entry and skip creating a new one.
        if skip_words and w_lower in skip_words:
            if curated_map and w_lower in curated_map:
                curated_entry = curated_map[w_lower]
                freq = curated_entry.setdefault('frequency', {})
                # Only update if this corpus row has a higher count than any
                # previously recorded value (same word may appear multiple times).
                if count > (freq.get('corpus_frequency') or 0):
                    freq['corpus_frequency'] = count
                    freq['corpus_rank']      = corpus_rank
            continue

        # Skip words that appear in the English blocklist.
        if strict_vocab and w_lower in strict_vocab:
            continue

        # Drop conjugated verb forms that spaCy misclassifies as NOUN/ADJ
        # when given a single word without sentence context.  Infinitives
        # appear elsewhere in the corpus and are handled correctly.
        # Two complementary checks:
        #   1. Suffix filter - catches regular plural / gerund forms in bulk.
        #   2. Explicit blocklist - catches 1s/3s forms whose suffixes also
        #      appear in real nouns (conditional -ria, imperfect -ia).
        conj_suffixes = CONJ_VERB_SUFFIXES.get(lang_code, ())
        if conj_suffixes and any(w_lower.endswith(s) for s in conj_suffixes):
            continue
        known_forms = KNOWN_CONJUGATED_FORMS.get(lang_code, set())
        if known_forms and w_lower in known_forms:
            continue

        if pos == 'PROPN':
            continue
        if pos == 'NUM' or NUMERIC_RE.match(lemma) or NUMERIC_BROAD_RE.match(lemma):
            continue

        if pos_group not in OPEN_CLASS_POS:
            if lemma not in closed_class_freq or count > closed_class_freq[lemma]['count']:
                closed_class_freq[lemma] = {'rank': corpus_rank, 'count': count}
            continue

        if not is_valid_corpus_lemma(lemma):
            continue

        if pos_group == 'verb':
            endings = VERB_INFINITIVE_ENDINGS.get(lang_code, ())
            if endings and not any(lemma.endswith(e) for e in endings):
                continue
            if len(lemma) < 4:
                continue
            if corpus_ranks and lemma not in corpus_ranks:
                continue

        if lemma not in lemma_map or count > lemma_map[lemma]['_count']:
            prev_rank = lemma_map[lemma]['_rank'] if lemma in lemma_map else corpus_rank
            lemma_map[lemma] = {
                '_count':     count,
                '_pos_group': pos_group,
                '_rank':      min(corpus_rank, prev_rank),
            }

    print()  # end the progress line

    lemma_map    = deduplicate_lemma_map(lemma_map, lang_code)
    sorted_items = sorted(lemma_map.items(), key=lambda x: x[1]['_count'], reverse=True)
    entries = [
        corpus_entry(
            word=lemma,
            pos_group=data['_pos_group'],
            rank_clean=data['_rank'],
            corpus_count=data['_count'],
            lang_code=lang_code,
            source=source,
        )
        for lemma, data in sorted_items
    ]

    return entries, closed_class_freq
