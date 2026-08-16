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
    # German infinitives all end in -n: -en for almost everything, plus -ern
    # (ändern), -eln (lächeln) and the two bare-'n' irregulars sein and tun.
    # 'n' subsumes 'en', so one entry covers the lot — and unlike the Romance
    # endings it is not a useful *filter*, since plenty of German nouns end in
    # -en too (Wagen, Garten, Leben). It only rejects a spaCy verb lemma that
    # is obviously not an infinitive.
    'deu': ('en', 'n'),
    # Dutch is the same shape: -en for almost every verb, with zijn, gaan,
    # staan, doen, slaan and zien ending in a bare -n. Same caveat too —
    # Dutch nouns end in -en as well (regen, morgen, wagen).
    'nld': ('en', 'n'),
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
        # Future indicative — '-ré -rás -rá -remos -réis -rán'. Unambiguously
        # verbal: no Spanish noun ends this way.
        'aré', 'eré', 'iré', 'arás', 'erás', 'irás', 'ará', 'erá', 'irá',
        'aremos', 'eremos', 'iremos', 'aréis', 'eréis', 'iréis',
        'arán', 'erán', 'irán',
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
    # 'deu' is deliberately empty on the first pass.
    #
    # Every German verb ending is also a noun ending. '-te' is the whole weak
    # preterite (sagte) and also Tüte, Miete, Seite, Ente. '-t' is 3rd-person
    # singular and also Stadt, Welt, Blatt, Wort, Nacht. '-en' is the plural,
    # the infinitive, and half the nouns in the language. Past participles look
    # like ge-...-t, but Gerät, Geschäft, Gesicht, Gewicht, Gebiet and Geschenk
    # match that shape exactly and are ordinary nouns.
    #
    # The record on this is not good: four suffix heuristics were written for
    # Spanish and all four had to be reverted after they ate real headwords
    # (-arte took arte/parte/suerte; a short-word-with-accent rule took
    # día/más/así). German is worse, not better. The entries here get filled in
    # from a real mining run — enumerating observed junk — rather than guessed
    # at in advance. Until then spaCy's POS tag and the lemma do the work, which
    # is what the Romance filters are patching around rather than replacing.
    'deu': (),
    # Dutch, empty for the same reason and then some. '-t' is 2nd/3rd person
    # singular and also nacht, licht, recht, gezicht. '-de'/'-te' is the weak
    # past and also vriende-, einde, gebeurte-. '-en' is the infinitive, the
    # plural, and a large share of the nouns. Fill from observed output.
    'nld': (),
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
        # Present subjunctive / 3s forms of very common verbs that spaCy tags
        # as NOUN in isolation. Listed rather than pattern-matched because the
        # endings (-a, -e) are the commonest noun endings in the language.
        'pueda', 'puedas', 'pueden', 'quiera', 'quieras', 'quieren',
        'lleva', 'llevan', 'deja', 'dejan', 'pasan',
        'quedan', 'llaman', 'esperan',
        # NOTE: espera (a wait), llama (flame/llama), queda (curfew) and pasa
        # (raisin) are omitted — each is a noun as well as a verb form, and a
        # false positive costs a real headword.
        'verá', 'verás', 'verán', 'dirá', 'dirás', 'dirán',
    },
}

# Past participles double as adjectives ('cansado', 'abierto'), so -ado/-ido
# cannot simply be banned. These are the ones whose English gloss is plainly a
# participle rather than a describable state, i.e. the ones that arrived as
# verb forms rather than words in their own right.
PARTICIPLE_BLOCKLIST: Dict[str, set] = {
    'spa': {
        # ONLY participles with no competing noun or adjective sense. This list
        # was originally much longer and had to be cut back: hecho (fact),
        # pasado (the past), sentido (meaning), partido (match), perdido,
        # querido, estado (state), puesto (post), dicho (saying) and visto are
        # all ordinary words. Form alone cannot separate a participle from a
        # noun in Spanish, so when in doubt the word is kept — letting a verb
        # form through is cheaper than deleting a real headword.
        'matado', 'hablado', 'podido', 'tenido', 'sido', 'habido',
        'venido', 'salido', 'traído', 'sabido', 'creído', 'leído',
        'comido', 'bebido', 'vivido', 'llamado', 'llegado', 'dejado',
        'quedado', 'tomado', 'pensado', 'mirado', 'cambiado',
    },
}

ENCLITICS = ('me', 'te', 'lo', 'la', 'le', 'nos', 'los', 'las', 'les')


def is_enclitic_form(word: str, lang_code: str,
                     known_infinitives: Optional[set] = None) -> bool:
    """
    True for an infinitive carrying an attached object pronoun (hacerte,
    decirle) — a duplicate of a headword already in the corpus.

    The stem left after stripping the pronoun must be a verb we have actually
    seen. Checking only that it *looks* like an infinitive is not enough:
    estandarte minus 'te' is 'estandar', desarme minus 'me' is 'desar' and
    gendarme minus 'me' is 'gendar' — all of which end in a valid infinitive
    ending, and all three are real hand-curated nouns.

    With no vocabulary to check against, this returns False. A filter that
    cannot verify its guess should not be deleting words.

    '-se' is deliberately not treated as an enclitic: reflexive infinitives
    (divertirse, levantarse) are legitimate dictionary headwords.
    """
    if lang_code != 'spa' or not known_infinitives:
        return False
    endings = VERB_INFINITIVE_ENDINGS.get(lang_code, ())
    for clitic in ENCLITICS:
        if not word.endswith(clitic):
            continue
        stem = word[:-len(clitic)]
        if (len(stem) >= 4
                and any(stem.endswith(e) for e in endings)
                and stem in known_infinitives):
            return True
    return False


# Corpus fragments: subtitle truncations and OCR noise that are not words in
# any language. Google Translate will happily "translate" all of these, which
# is why they survived to reach the curated file.
FRAGMENT_BLOCKLIST: Dict[str, set] = {
    'spa': {
        'dej', 'sigu', 'vién', 'irno', 'nén', 'qu', 'aqu', 'entend',
        # Misspellings and mis-accentuations common in subtitle text.
        'órden', 'porqué', 'exámen', 'jóven', 'imágen', 'contáctenos',
        'tambi', 'despu', 'alg', 'porqu', 'hab', 'deb', 'ning', 'alguu',
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


# Languages that capitalise every noun. The OpenSubtitles frequency lists are
# lowercased, so for these the case has to be put back — see display_lemma().
NOUN_CAPITALISING_LANGS = {'deu'}


def _tag_once(nlp, word: str) -> Tuple[Optional[str], Optional[str]]:
    """(lemma, pos) for one surface form, or (None, None) on any failure."""
    try:
        doc = nlp(word)
        if doc and len(doc) > 0:
            return doc[0].lemma_, doc[0].pos_
    except Exception:
        pass
    return None, None


def analyze_word(nlp, word: str,
                 lang_code: str = '') -> Tuple[Optional[str], Optional[str], Optional[str]]:
    """
    Tag one corpus word. Returns (lemma_lowercased, pos, pos_group).

    The lemma comes back lowercased because it is used as a dictionary key for
    deduplication and blocklist lookups throughout. display_lemma() puts the
    case back for storage.

    German gets tagged twice. The corpus is entirely lowercase ("mann", "essen")
    but de_core_news_sm is trained on properly-cased text, where capitalisation
    is the single strongest signal that a token is a noun. Handed "mann" the
    model has had that signal removed; handed "Mann" it has it back. So both are
    tried, and a NOUN reading wins over a non-NOUN one — a false negative here
    costs a noun its capital letter *and* mislabels its part of speech.
    """
    lemma, pos = _tag_once(nlp, word)

    if lang_code in NOUN_CAPITALISING_LANGS and word[:1].islower():
        titled_lemma, titled_pos = _tag_once(nlp, word.capitalize())
        # Prefer whichever reading says NOUN. If they agree, or neither says
        # NOUN, the lowercase reading stands.
        if titled_pos in ('NOUN', 'PROPN') and pos not in ('NOUN', 'PROPN'):
            lemma, pos = titled_lemma, titled_pos

    if not lemma or not pos:
        return None, None, None
    return lemma.lower(), pos, POS_GROUPS.get(pos, 'other')


def display_lemma(lemma: str, pos_group: str, lang_code: str) -> str:
    """
    How the word should actually be written.

    Everywhere else the lemma is handled lowercased, because it is a lookup key.
    This is the one point where it becomes text a learner reads, and for German
    that means every noun takes a capital: das Essen (the meal) against essen
    (to eat) is a distinction carried entirely by the first letter, and a
    lowercase noun is simply a spelling error.
    """
    if lang_code in NOUN_CAPITALISING_LANGS and pos_group == 'noun':
        return lemma[:1].upper() + lemma[1:]
    return lemma


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


# Languages whose plurals are formed by adding -s / -es, so that stripping the
# suffix reliably yields the singular.
#
# German is absent, and the omission matters: its plurals are formed by suffix,
# umlaut, both or neither (Haus→Häuser, Mann→Männer, Kind→Kinder, Auto→Autos,
# Fenster→Fenster), so a -s rule does not describe the language. What it does do
# is merge unrelated pairs that happen to differ by one letter — Eis (ice) into
# Ei (egg), Reis (rice) into Rei, Maus into Mau. spaCy's lemmatiser already
# returns the singular for German, which is what this rule exists to approximate.
PLURAL_S_LANGS = {'spa', 'fra', 'ita', 'por'}


def deduplicate_lemma_map(lemma_map: Dict[str, dict],
                          lang_code: str) -> Dict[str, dict]:
    """
    Merge plural/feminine variants into their canonical singular/masculine form.
    """
    to_remove: set = set()

    if lang_code not in PLURAL_S_LANGS:
        return lemma_map

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
                           lang: str,
                           top_n: int = 10_000,
                           whitelist_n: int = 3_000) -> set:
    """
    Build an English word blocklist from the OpenSubtitles English corpus.

    Subtitle files carry a lot of untranslated English. A word is blocked if it
    appears in the top-N English OS words AND is NOT among the top whitelist_n
    words of the language being mined. That cross-reference is what stops
    genuine shared vocabulary from being deleted.

    The whitelist used to be read from the Spanish corpus for every language,
    which was wrong for the other three and would be destructive for German:
    hand, arm, finger, wind, ball, warm, land, best, wild, rat, gift and band
    are all ordinary German words that sit in the English top 10,000 and not in
    the Spanish top 3,000, so every one of them would have been dropped.

    NOTE: nothing currently passes the result of this to build_corpus_entries —
    `mine` relies on spaCy's POS tag instead. It is kept, and kept correct, for
    the point at which that changes.

    Words shorter than 3 chars are always excluded.
    """
    iso = OS_LANG.get(lang)
    if not iso:
        return set()

    en_file     = os_dir / 'en' / 'en_50k.txt'
    target_file = os_dir / iso / f'{iso}_50k.txt'
    if not en_file.exists():
        print(f"  Warning: English blocklist unavailable - {en_file} not found.")
        print("  English words (met, dino, amir, etc.) will not be filtered from OS corpus.")
        return set()

    def top_words(path: Path, n: int) -> set:
        words: set = set()
        if not path.exists():
            return words
        try:
            with open(path, encoding='utf-8', errors='replace') as f:
                for line_rank, raw in enumerate(f, start=1):
                    if line_rank > n:
                        break
                    parts = raw.strip().split()
                    if parts:
                        words.add(parts[0].lower())
        except Exception:
            pass
        return words

    # Without this the blocklist is the whole English top-N, which for a
    # Germanic target language would take a large bite out of real vocabulary.
    target_common = top_words(target_file, whitelist_n)
    if not target_common:
        print(f"  Warning: no {iso} corpus to whitelist against ({target_file}).")
        print(f"  Refusing to apply an unfiltered English blocklist to {lang}.")
        return set()

    blocklist: set = set()
    try:
        with open(en_file, encoding='utf-8', errors='replace') as f:
            for line_rank, raw in enumerate(f, start=1):
                if line_rank > top_n:
                    break
                parts = raw.strip().split()
                if len(parts) >= 2 and len(parts[0]) >= 3:
                    word = parts[0].lower()
                    if word not in target_common:
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

    # Infinitives we can vouch for, used to verify enclitic candidates.
    known_infinitives: set = set()
    if curated_map:
        for entry in curated_map.values():
            if entry.get('pos') == 'verb':
                inf = (entry.get('linguistic') or {}).get('infinitive') or entry.get('word')
                if inf:
                    known_infinitives.add(inf.lower())
    total_rows = len(rows)

    for row_idx, (corpus_rank, word, count) in enumerate(rows):
        print(f"\r  [{row_idx + 1:,}/{total_rows:,}]  {word:<30}", end='', flush=True)
        if ' ' in word:
            continue
        lemma, pos, pos_group = analyze_word(nlp, word, lang_code)
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
        if w_lower in PARTICIPLE_BLOCKLIST.get(lang_code, set()):
            continue
        if w_lower in FRAGMENT_BLOCKLIST.get(lang_code, set()):
            continue
        if is_enclitic_form(w_lower, lang_code, known_infinitives):
            continue
        # NOTE: a "short word with an accent" heuristic was tried here and
        # removed — it caught día, más, así, aquí, sí and él. Fragments are
        # listed explicitly instead; there are few enough of them to enumerate,
        # and a false positive costs a real word.

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
    # The map is keyed by the lowercase lemma so dedup and blocklist lookups
    # are case-insensitive; display_lemma restores the case on the way out.
    entries = [
        corpus_entry(
            word=display_lemma(lemma, data['_pos_group'], lang_code),
            pos_group=data['_pos_group'],
            rank_clean=data['_rank'],
            corpus_count=data['_count'],
            lang_code=lang_code,
            source=source,
        )
        for lemma, data in sorted_items
    ]

    return entries, closed_class_freq
