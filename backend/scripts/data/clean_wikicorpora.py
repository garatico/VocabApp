#!/usr/bin/env python3
"""
clean_wikicorpora.py  —  VocabApp data pipeline (single entry point)
=====================================================================
Produces one JSONL file per language ready to be loaded by seed-languages.py:

    data/{language}_preseed.jsonl    e.g. data/spanish_preseed.jsonl

Pipeline steps
--------------
1. HARDCODED entries (always included, regardless of --n)
       Function words and irregular verbs from hardcoded_data.py.
       Irregular verbs get conjugation tables from mlconjug3.

2. CORPUS entries (top --n open-class words from Wikipedia frequency data)
       Nouns, verbs, adjectives extracted via spaCy lemmatisation.
       Verbs receive conjugation tables.

3. RANK MERGE — all entries sorted by corpus frequency.
       Hardcoded words found in the corpus get their natural rank.

4. ENRICHMENT — English glosses, display strings, and domain tags.
       Wiktionary (wiktionaryparser) tried first; Google Translate as fallback.
       Results cached in data/gloss_cache_{lang}.json between runs.

Usage:
    python backend/scripts/data/clean_wikicorpora.py
    python backend/scripts/data/clean_wikicorpora.py --langs spa --n 5000
    python backend/scripts/data/clean_wikicorpora.py --langs spa fra ita por --n 0
    python backend/scripts/data/clean_wikicorpora.py --no-translate
    python backend/scripts/data/clean_wikicorpora.py --batch 100
    python backend/scripts/data/clean_wikicorpora.py --fresh

Diagnose conjugation keys after mlconjug3 upgrades:
    python backend/scripts/data/debug_conjugations.py

Load output into the database:
    python backend/scripts/data/seed-languages.py

Dependencies:
    pip install spacy mlconjug3 deep_translator wiktionaryparser
    python -m spacy download es_core_news_sm fr_core_news_sm it_core_news_sm pt_core_news_sm
"""

import argparse
import copy
import json
import re
import subprocess
import sys
import time
import warnings
from pathlib import Path
from typing import Dict, List, Optional, Tuple

warnings.filterwarnings('ignore', message='.*InconsistentVersionWarning.*')
warnings.filterwarnings('ignore', message='.*Trying to unpickle estimator.*')

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
    print("Warning: mlconjug3 not installed — verbs will have no conjugations.")
    print("  pip install mlconjug3")
    MLCONJUG3_AVAILABLE = False


# ══════════════════════════════════════════════════════════════════════════════
# PATHS
# ══════════════════════════════════════════════════════════════════════════════

SCRIPT_DIR   = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent.parent
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

# ISO 639-1 codes used by translation APIs
LANG_SRC: Dict[str, str] = {
    'spa': 'es',
    'fra': 'fr',
    'ita': 'it',
    'por': 'pt',
}

# Language names used by wiktionaryparser
WIKT_LANG: Dict[str, str] = {
    'spa': 'spanish',
    'fra': 'french',
    'ita': 'italian',
    'por': 'portuguese',
}

MLCONJUG3_LANG: Dict[str, str] = {
    'spa': 'es',
    'fra': 'fr',
    'ita': 'it',
    'por': 'pt',
}

# Map app tense names to (mlconjug3 mood, mlconjug3 tense label).
# Lookup tries bare label first (French exact match), then mood-prefixed (spa/ita/por v4).
# Portuguese subjunctive has a leading space in tense_label — the double space in
# 'Conjuntivo  Subjuntivo Presente' comes from f"{mood} {tense_label}".
TENSE_MAP: Dict[str, Dict[str, Tuple[str, str]]] = {
    'spa': {
        'present':     ('Indicativo',  'presente'),
        'preterite':   ('Indicativo',  'preterito perfecto simple'),
        'imperfect':   ('Indicativo',  'preterito imperfecto'),
        'future':      ('Indicativo',  'futuro'),
        'conditional': ('Condicional', 'Condicional'),
        'subjunctive': ('Subjuntivo',  'presente'),
        'imperative':  ('Imperativo',  'Afirmativo'),
    },
    'fra': {
        'present':     ('Indicatif',    'Present'),
        'preterite':   ('Indicatif',    'Passe simple'),
        'imperfect':   ('Indicatif',    'Imparfait'),
        'future':      ('Indicatif',    'Futur simple'),
        'conditional': ('Conditionnel', 'Present'),
        'subjunctive': ('Subjonctif',   'Present'),
        'imperative':  ('Imperatif',    'Present'),
    },
    'ita': {
        'present':     ('Indicativo',   'presente'),
        'preterite':   ('Indicativo',   'passato remoto'),
        'imperfect':   ('Indicativo',   'imperfetto'),
        'future':      ('Indicativo',   'futuro semplice'),
        'conditional': ('Condizionale', 'presente'),
        'subjunctive': ('Congiuntivo',  'presente'),
        'imperative':  ('Imperativo',   'Affermativo'),
    },
    'por': {
        'present':     ('Indicativo',  'presente'),
        'preterite':   ('Indicativo',  'preterito perfeito simples'),
        'imperfect':   ('Indicativo',  'preterito imperfeito'),
        'future':      ('Indicativo',  'Futuro do Presente Simples'),
        'conditional': ('Condicional', 'Futuro do Preterito Simples'),
        'subjunctive': ('Conjuntivo',  ' Subjuntivo Presente'),
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
    'PART':  'other',  'PUNCT': 'other',
    'SYM':   'other',  'X':    'other',
}

RANK_START = 101
NUMERIC_RE = re.compile(r'^\d+[%]?$')

# Valid infinitive endings per language.
# Verb lemmas that don't end with one of these are conjugated forms that spaCy
# failed to lemmatise correctly (e.g. "dan" instead of "dar"). Drop them —
# the true infinitive will appear elsewhere in the corpus with higher frequency.
VERB_INFINITIVE_ENDINGS: Dict[str, Tuple[str, ...]] = {
    'spa': ('ar', 'er', 'ir', 'ír'),
    'fra': ('er', 'ir', 're', 'oir', 'oire'),
    'ita': ('are', 'ere', 'ire'),
    'por': ('ar', 'er', 'ir'),
}

# Broader numeric filter: catches European formats like "2.000", "1,5", "3.14"
NUMERIC_BROAD_RE = re.compile(r'^[\d][,.\d]+[%]?$')

# Characters that disqualify a lemma: URLs, paths, special syntax
_BAD_CHARS_RE = re.compile(r'[:/\\@#=<>{}|^~`\[\]"\'*+]|\d')

# Roman numerals — catches corpus noise like 'xix', 'viii', 'cm' from "Siglo XIX" refs.
# Two-stage: first confirm ALL chars are Roman-numeral letters, then check structure.
# This prevents false positives (e.g. 'civil' has all-Roman chars but fails structure).
_ROMAN_CHARS_RE  = re.compile(r'^[ivxlcdm]+$', re.IGNORECASE)
ROMAN_NUMERAL_RE = re.compile(
    r'^m{0,4}(cm|cd|d?c{0,3})(xc|xl|l?x{0,3})(ix|iv|v?i{0,3})$',
    re.IGNORECASE
)


def is_valid_corpus_lemma(lemma: str) -> bool:
    """
    Return False for lemmas that should be excluded from the corpus:
      - Multi-word (spaCy sometimes appends pronouns: 'matar él', 'confor yo')
      - Too short: abbreviations like 'mr', 'dc' (real 2-char words are hardcoded)
      - Contains digits or special characters: URLs, formatted numbers, symbols
      - No actual letters at all
      - Roman numerals (xix, viii, etc. from "Siglo XIX" references in Wikipedia)
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


# ══════════════════════════════════════════════════════════════════════════════
# RANK / BAND HELPERS
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
# CORPUS FREQUENCY RANK LOOKUP
# ══════════════════════════════════════════════════════════════════════════════

def load_corpus_ranks(lang: str) -> Dict[str, int]:
    """Read corpus frequency file and return {word: rank} for rank lookup."""
    try:
        corpus_dir = find_corpus_dir(lang)
        if not corpus_dir:
            return {}
        words_file = find_words_file(corpus_dir, lang)
        ranks: Dict[str, int] = {}
        with open(words_file, encoding='utf-8', errors='replace') as f:
            for raw in f:
                parsed = parse_corpus_line(raw)
                if parsed:
                    rank, word, _count = parsed
                    ranks[word.lower()] = rank
        return ranks
    except Exception:
        return {}


def assign_corpus_rank(entry: dict, corpus_ranks: Dict[str, int]) -> None:
    """Fill rank/difficulty/band for a hardcoded entry found in the corpus."""
    if entry.get('rank') is not None:
        return
    word = entry.get('word', '').lower()
    rank = corpus_ranks.get(word)
    if rank is None:
        return
    entry['rank'] = rank
    entry['difficulty'] = rank_to_difficulty(rank)
    freq = entry.setdefault('frequency', {})
    freq['rank'] = rank
    freq['band'] = rank_to_band(rank)


# ══════════════════════════════════════════════════════════════════════════════
# DOMAIN CLASSIFICATION
# ══════════════════════════════════════════════════════════════════════════════

# Whole-word matched against the English gloss to prevent false positives
# (e.g. 'war' inside 'software', 'sing.' grammar abbreviation hitting music).
DOMAIN_GLOSS_KEYWORDS: Dict[str, List[str]] = {
    'food':        ['eat', 'food', 'drink', 'cook', 'meal', 'fruit', 'vegetable',
                    'meat', 'bread', 'fish', 'dish', 'taste', 'flavor', 'recipe',
                    'soup', 'salad', 'wine', 'beer', 'milk', 'cheese', 'egg'],
    'travel':      ['travel', 'trip', 'journey', 'hotel', 'airport', 'train',
                    'bus', 'car', 'plane', 'ship', 'tourist', 'map', 'road',
                    'station', 'ticket', 'passport', 'border', 'destination'],
    'body':        ['body', 'hand', 'foot', 'eye', 'ear', 'nose', 'mouth',
                    'arm', 'leg', 'head', 'hair', 'skin', 'heart', 'blood',
                    'bone', 'face', 'finger', 'tooth', 'back', 'neck'],
    'health':      ['health', 'doctor', 'medicine', 'sick', 'pain', 'hospital',
                    'drug', 'therapy', 'disease', 'symptom', 'treatment',
                    'injury', 'cure', 'patient', 'nurse', 'pharmacy'],
    'education':   ['school', 'study', 'learn', 'teach', 'book', 'class',
                    'university', 'student', 'teacher', 'lesson', 'knowledge',
                    'exam', 'grade', 'subject', 'course', 'read', 'write'],
    'business':    ['money', 'work', 'job', 'company', 'sell', 'buy', 'market',
                    'price', 'cost', 'profit', 'tax', 'bank', 'invest',
                    'trade', 'contract', 'salary', 'business', 'economy'],
    'technology':  ['computer', 'phone', 'internet', 'digital', 'software',
                    'machine', 'device', 'data', 'network', 'screen',
                    'program', 'system', 'technology', 'electric', 'app',
                    'application', 'electronic', 'keyboard', 'robot'],
    'nature':      ['tree', 'flower', 'animal', 'water', 'fire', 'earth',
                    'sky', 'mountain', 'river', 'sea', 'forest', 'plant',
                    'stone', 'wind', 'rain', 'sun', 'moon', 'star', 'nature'],
    'home':        ['house', 'home', 'room', 'door', 'window', 'floor',
                    'kitchen', 'bathroom', 'bedroom', 'furniture', 'table',
                    'chair', 'bed', 'wall', 'garden', 'roof', 'clean'],
    'people':      ['person', 'people', 'family', 'friend', 'man', 'woman',
                    'child', 'parent', 'mother', 'father', 'brother', 'sister',
                    'human', 'individual', 'community', 'society'],
    'time':        ['time', 'day', 'week', 'month', 'year', 'hour', 'minute',
                    'morning', 'evening', 'night', 'today', 'yesterday',
                    'tomorrow', 'past', 'future', 'season', 'calendar'],
    'culture':     ['art', 'music', 'film', 'book', 'story', 'culture',
                    'tradition', 'religion', 'history', 'language', 'sport',
                    'festival', 'celebrate', 'game', 'dance', 'song', 'play'],
    'geography':   ['country', 'city', 'region', 'location',
                    'continent', 'island', 'north', 'south', 'east', 'west',
                    'border', 'capital', 'territory', 'area', 'zone'],
    'emotions':    ['feel', 'love', 'hate', 'happy', 'sad', 'angry', 'fear',
                    'joy', 'hope', 'worry', 'emotion', 'mood', 'desire',
                    'trust', 'doubt', 'surprise', 'pain', 'pleasure'],
    'government':  ['law', 'government', 'state', 'politics', 'vote', 'right',
                    'freedom', 'power', 'rule', 'justice', 'court', 'police',
                    'military', 'war', 'peace', 'election', 'party', 'tax'],
}

ENTITY_DOMAIN_MAP: Dict[str, List[str]] = {
    'GPE':         ['geography', 'travel'],
    'LOC':         ['geography', 'nature'],
    'ORG':         ['business'],
    'PERSON':      ['people'],
    'MONEY':       ['business'],
    'PRODUCT':     ['technology'],
    'LAW':         ['government'],
    'WORK_OF_ART': ['culture'],
    'LANGUAGE':    ['education', 'culture'],
}


def classify_domains(gloss: str, pos: str, rank: Optional[int],
                     entity_type: Optional[str] = None) -> List[str]:
    """Return domain tags for one entry using whole-word keyword matching."""
    domains: List[str] = []
    gloss_words = set(re.findall(r'[a-z]+', gloss.lower()))
    for domain, keywords in DOMAIN_GLOSS_KEYWORDS.items():
        if any(kw in gloss_words for kw in keywords):
            domains.append(domain)
    if entity_type and entity_type in ENTITY_DOMAIN_MAP:
        for d in ENTITY_DOMAIN_MAP[entity_type]:
            if d not in domains:
                domains.append(d)
    if rank is not None and rank <= 500:
        if 'essential' not in domains:
            domains.insert(0, 'essential')
    return domains if domains else ['general']


# ══════════════════════════════════════════════════════════════════════════════
# TRANSLATION  (Wiktionary -> Google Translate fallback)
# ══════════════════════════════════════════════════════════════════════════════

def try_wiktionary(word: str, lang_code: str) -> Optional[List[str]]:
    """Fetch POS-aware definitions from English Wiktionary."""
    try:
        from wiktionaryparser import WiktionaryParser
    except ImportError:
        return None
    wikt_lang = WIKT_LANG.get(lang_code)
    if not wikt_lang:
        return None
    try:
        parser = WiktionaryParser()
        result = parser.fetch(word, wikt_lang)
        glosses = []
        for block in result:
            for defn in block.get('definitions', []):
                texts = defn.get('text', [])
                for text in texts[1:4]:
                    text = text.strip()
                    text = re.sub(r'^\([^)]+\)\s*', '', text)
                    text = re.split(r'\s[-:]\s', text)[0].strip()
                    if text and len(text) > 1:
                        glosses.append(text)
                        break
        return glosses if glosses else None
    except Exception:
        return None


def try_google_translate(word: str, lang_code: str,
                         delay: float = 0.5) -> Optional[str]:
    """Translate word to English via Google Translate (deep_translator)."""
    try:
        from deep_translator import GoogleTranslator
    except ImportError:
        return None
    src = LANG_SRC.get(lang_code)
    if not src:
        return None
    try:
        time.sleep(delay)
        return GoogleTranslator(source=src, target='en').translate(word)
    except Exception:
        return None


def build_display(word: str, pos: str, glosses: List[str]) -> str:
    """Derive a short display string; verbs get 'to <gloss>'."""
    if not glosses:
        return word
    first = glosses[0].strip().rstrip('.,;')
    if pos == 'verb' and not first.lower().startswith('to '):
        return f"to {first}"
    return first


# ══════════════════════════════════════════════════════════════════════════════
# GLOSS CACHE
# ══════════════════════════════════════════════════════════════════════════════

def load_gloss_cache(lang: str) -> Dict[str, dict]:
    path = OUTPUT_DIR / f'gloss_cache_{lang}.json'
    if path.exists():
        try:
            return json.loads(path.read_text(encoding='utf-8'))
        except Exception:
            pass
    return {}


def save_gloss_cache(lang: str, cache: Dict[str, dict]) -> None:
    path = OUTPUT_DIR / f'gloss_cache_{lang}.json'
    path.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding='utf-8')


# ══════════════════════════════════════════════════════════════════════════════
# ENRICHMENT  (glosses + display + domains)
# ══════════════════════════════════════════════════════════════════════════════

def enrich_entries(entries: List[dict], lang: str,
                   fresh: bool = False,
                   batch: Optional[int] = None,
                   no_translate: bool = False,
                   verbose: bool = False) -> List[dict]:
    """
    Add glosses, display strings, and domain tags to all entries.
    Domain classification always runs over every entry so keyword updates
    take effect without needing --fresh.
    """
    cache = {} if fresh else load_gloss_cache(lang)
    cache_hits = wikt_hits = google_hits = skipped = 0

    needs_gloss = [e for e in entries if not e.get('glosses') or not e.get('display')]
    if batch is not None:
        needs_gloss = needs_gloss[:batch]

    if needs_gloss and not no_translate:
        print(f"  Translating  : {len(needs_gloss)} entries")

    for entry in needs_gloss:
        word   = entry['word']
        pos    = entry.get('pos', '')
        cached = cache.get(word)

        try:
            if cached:
                glosses = cached.get('glosses', [])
                cache_hits += 1
            elif no_translate:
                glosses = []
                skipped += 1
            else:
                glosses = try_wiktionary(word, lang) or []
                if glosses:
                    wikt_hits += 1
                else:
                    translation = try_google_translate(word, lang)
                    if translation and translation.lower() != word.lower():
                        glosses = [translation]
                        google_hits += 1
                cache[word] = {'glosses': glosses}
                if (wikt_hits + google_hits) % 50 == 0:
                    save_gloss_cache(lang, cache)

            if glosses:
                entry['glosses'] = glosses
                if not entry.get('display'):
                    entry['display'] = build_display(word, pos, glosses)

        except Exception as exc:
            # Never let a single word crash the whole translation pass.
            skipped += 1
            cache[word] = {'glosses': []}
            if verbose:
                print(f"  Warning: skipped '{word}' — {type(exc).__name__}: {exc}")

    save_gloss_cache(lang, cache)

    if not no_translate and (wikt_hits + google_hits + cache_hits) > 0:
        print(f"  Gloss source : {cache_hits} cache  "
              f"{wikt_hits} Wiktionary  {google_hits} Google  {skipped} skipped")

    # Domain classification runs over ALL entries every time.
    for entry in entries:
        if not entry.get('domains') or entry['domains'] == ['general']:
            glosses_e   = entry.get('glosses', [])
            first_gloss = glosses_e[0] if glosses_e else ''
            entry['domains'] = classify_domains(
                first_gloss, entry.get('pos', ''), entry.get('rank')
            )

    total_glosses = sum(1 for e in entries if e.get('glosses'))
    total_display = sum(1 for e in entries if e.get('display'))
    print(f"  Coverage     : {total_glosses}/{len(entries)} glosses  "
          f"{total_display}/{len(entries)} display")

    return entries


# ══════════════════════════════════════════════════════════════════════════════
# CORPUS ENTRY FACTORY
# ══════════════════════════════════════════════════════════════════════════════

def corpus_entry(word: str, pos_group: str, rank_clean: int,
                 corpus_count: int, lang_code: str) -> dict:
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
        'domains':    ['general'],
        'register':   'neutral',
        'lang':       LANG_NAMES.get(lang_code, lang_code),
        'source':     'wikicorpus',
        'needs_review': True,
    }


# ══════════════════════════════════════════════════════════════════════════════
# MLCONJUG3  —  CONJUGATION GENERATION
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


# ══════════════════════════════════════════════════════════════════════════════
# SPACY  —  CORPUS EXTRACTION
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
    if not CORPUS_DIR.exists():
        return None
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


def deduplicate_lemma_map(lemma_map: Dict[str, dict],
                          lang_code: str) -> Dict[str, dict]:
    """
    Merge plural/feminine variants into their canonical singular/masculine form.

    Plural → singular (all languages):
      - word ends in '-es' and word[:-2] exists in map → drop plural
      - word ends in '-s'  and word[:-1] exists in map → drop plural
    Feminine → masculine (adjectives, spa/por/ita):
      - adjective ends in '-a' and same word with '-o' exists as adjective → drop feminine

    The surviving entry absorbs the variant's corpus count (keeps the higher value).
    """
    to_remove: set = set()

    for lemma, data in list(lemma_map.items()):
        if lemma in to_remove:
            continue

        # ── Plural → singular ───────────────────────────────────────────────
        if lemma.endswith('es') and len(lemma) > 4:
            base = lemma[:-2]
            if base in lemma_map and base not in to_remove:
                lemma_map[base]['_count'] = max(
                    lemma_map[base]['_count'], data['_count']
                )
                to_remove.add(lemma)
                continue
        if lemma.endswith('s') and len(lemma) > 3:
            base = lemma[:-1]
            if base in lemma_map and base not in to_remove:
                lemma_map[base]['_count'] = max(
                    lemma_map[base]['_count'], data['_count']
                )
                to_remove.add(lemma)
                continue

        # ── Feminine → masculine (adjectives only, spa/por/ita) ────────────
        if (lang_code in ('spa', 'por', 'ita')
                and lemma.endswith('a')
                and len(lemma) > 3
                and data['_pos_group'] == 'adjective'):
            masculine = lemma[:-1] + 'o'
            masc_data = lemma_map.get(masculine)
            if (masc_data and masculine not in to_remove
                    and masc_data['_pos_group'] == 'adjective'):
                lemma_map[masculine]['_count'] = max(
                    lemma_map[masculine]['_count'], data['_count']
                )
                to_remove.add(lemma)

    return {k: v for k, v in lemma_map.items() if k not in to_remove}


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
        if pos == 'NUM' or NUMERIC_RE.match(lemma) or NUMERIC_BROAD_RE.match(lemma):
            continue
        if not is_valid_corpus_lemma(lemma):
            continue
        if pos_group not in OPEN_CLASS_POS:
            continue
        # Drop verb lemmas that don't end in a valid infinitive suffix —
        # they're conjugated forms spaCy failed to reduce to root form.
        if pos_group == 'verb':
            endings = VERB_INFINITIVE_ENDINGS.get(lang_code, ())
            if endings and not any(lemma.endswith(e) for e in endings):
                continue
            # Require ≥ 4 chars for corpus verbs: real 3-char roots (ser/dar/ver/ir)
            # are in the hardcoded list; 3-char matches here are fragments like 'cer'.
            if len(lemma) < 4:
                continue
        if lemma not in lemma_map or count > lemma_map[lemma]['_count']:
            lemma_map[lemma] = {'_count': count, '_pos_group': pos_group}

    # Merge plural/feminine variants into their canonical form before ranking.
    lemma_map = deduplicate_lemma_map(lemma_map, lang_code)

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

    if MLCONJUG3_AVAILABLE and lang_code in TENSE_MAP:
        verbs    = [e for e in entries if e['pos'] == 'verb']
        conj_ok  = conj_fail = 0
        for entry in verbs:
            inf  = entry['linguistic']['infinitive']
            conj = build_conjugations(inf, lang_code, verbose=verbose)
            if conj:
                entry['linguistic']['conjugations'] = conj
                conj_ok += 1
            else:
                conj_fail += 1
        print(f"  Corpus verbs : {len(verbs)} — {conj_ok} conjugated, {conj_fail} skipped")

    return entries


# ══════════════════════════════════════════════════════════════════════════════
# OUTPUT
# ══════════════════════════════════════════════════════════════════════════════

def write_jsonl(outpath: Path, entries: List[dict]) -> None:
    with open(outpath, 'w', encoding='utf-8') as f:
        for entry in entries:
            f.write(json.dumps(entry, ensure_ascii=False) + '\n')


# ══════════════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════════════

def main(langs: List[str], n: int, verbose: bool,
         no_translate: bool, fresh: bool, batch: Optional[int]) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    print(f"Corpus dir  : {CORPUS_DIR}")
    print(f"Output dir  : {OUTPUT_DIR}")
    print(f"Languages   : {', '.join(langs)}")
    print(f"Corpus top  : {n:,} tokens per language")
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
            print(f"[{lang}] No hardcoded data registered — skipping.\n")
            continue

        lang_name = LANG_NAMES.get(lang, lang)
        print(f"── {lang} ({lang_name}) " + "─" * 44)

        fn_words  = copy.deepcopy(data['function_words'])
        irr_verbs = copy.deepcopy(data['irregular_verbs'])

        # Conjugate irregular verbs
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
            print("  mlconjug3 not available — verbs written without conjugations.")

        hardcoded_entries = fn_words + irr_verbs
        print(f"  Hardcoded    : {len(fn_words)} function words "
              f"+ {len(irr_verbs)} irregular verbs = {len(hardcoded_entries)} total")

        # Assign natural corpus ranks to hardcoded entries
        corpus_ranks = load_corpus_ranks(lang)
        if corpus_ranks:
            ranked = sum(
                1 for e in hardcoded_entries
                if assign_corpus_rank(e, corpus_ranks) is None
                and e.get('rank') is not None
            )
            print(f"  Rank lookup  : {len(corpus_ranks):,} corpus words, "
                  f"{ranked} hardcoded entries ranked")

        # Build corpus entries
        corpus_entries_out: List[dict] = []
        if n == 0:
            print("  Corpus       : skipped (--n 0)")
        elif not SPACY_AVAILABLE:
            print("  Corpus       : skipped (spaCy not installed)")
        elif not ensure_spacy_model(lang):
            print(f"  Corpus       : skipped (spaCy model unavailable for '{lang}')")
        else:
            try:
                nlp = spacy.load(SPACY_MODELS[lang])
            except OSError as e:
                print(f"  Corpus       : skipped ({e})")
                nlp = None

            if nlp:
                corpus_dir = find_corpus_dir(lang)
                if not corpus_dir:
                    print(f"  Corpus       : skipped (no folder for '{lang}' in {CORPUS_DIR})")
                else:
                    try:
                        words_file = find_words_file(corpus_dir, lang)
                        print(f"  Corpus src   : {words_file.name}")
                        rows = read_top_n(words_file, n)
                        print(f"  Tokens read  : {len(rows):,}")
                        corpus_entries_out = build_corpus_entries(
                            rows, lang, nlp, verbose=verbose
                        )
                        print(f"  Corpus       : {len(corpus_entries_out):,} entries after filtering")
                    except FileNotFoundError as e:
                        print(f"  Corpus       : skipped ({e})")

        # Merge and sort by rank (unranked last)
        all_entries = hardcoded_entries + corpus_entries_out
        all_entries.sort(key=lambda e: (
            e.get('rank') is None,
            e.get('rank') if e.get('rank') is not None else float('inf')
        ))

        # Write immediately so the file exists before the (slow) translation step.
        # A second write below adds the enrichment results.
        outpath = OUTPUT_DIR / f'{lang_name}_preseed.jsonl'
        write_jsonl(outpath, all_entries)
        print(f"  Output       : {len(all_entries)} entries -> {outpath.name} (pre-enrichment)")

        # Enrich: glosses, display, domains (in-place, then re-write)
        all_entries = enrich_entries(
            all_entries, lang,
            fresh=fresh,
            batch=batch,
            no_translate=no_translate,
            verbose=verbose,
        )
        write_jsonl(outpath, all_entries)
        print(f"  Output       : {len(all_entries)} entries -> {outpath.name} (enriched)\n")

    print("Done.")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(
        description='Build VocabApp preseed JSONL files (hardcoded + corpus + enrichment).',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
examples:
  %(prog)s                            all 4 languages, 10k corpus, with translation
  %(prog)s --langs spa --n 5000       Spanish only, 5k corpus
  %(prog)s --n 0                      hardcoded words only, no corpus
  %(prog)s --no-translate             skip translation step
  %(prog)s --batch 100                translate 100 new words then stop
  %(prog)s --fresh                    ignore gloss cache, re-fetch all
        """,
    )
    parser.add_argument(
        '--langs', nargs='+',
        default=['spa', 'fra', 'ita', 'por'],
        metavar='LANG',
        help='Language codes to process (default: spa fra ita por)',
    )
    parser.add_argument(
        '--n', type=int, default=20_000,
        help='Max corpus tokens per language (0 = hardcoded only, default: 10000)',
    )
    parser.add_argument(
        '--no-translate', action='store_true',
        help='Skip translation — leave glosses/display empty for entries without them',
    )
    parser.add_argument(
        '--fresh', action='store_true',
        help='Ignore gloss cache and re-fetch all translations',
    )
    parser.add_argument(
        '--batch', type=int, default=None,
        metavar='N',
        help='Translate at most N new words per language (useful when rate-limit testing)',
    )
    parser.add_argument(
        '--verbose', action='store_true',
        help='Print conjugation key mismatches and other debug info',
    )
    args = parser.parse_args()
    main(args.langs, args.n, args.verbose, args.no_translate, args.fresh, args.batch)
