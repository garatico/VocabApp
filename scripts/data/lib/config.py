"""
lib/config.py — language configuration and filesystem paths
============================================================
Single source of truth for:

  * which languages the pipeline handles, and the model / corpus / translator
    code each one uses in every third-party library
  * the frequency rank scales (rank → CEFR band, rank → 1-5 difficulty)
  * every path the pipeline reads or writes

Everything else imports from here, so adding a language or moving a directory
is a one-file change. No side effects: importing this module only computes
paths, it never creates or touches anything on disk.
"""

from pathlib import Path
from typing import Dict, Optional, Tuple

# ── Paths ─────────────────────────────────────────────────────────────────────
# scripts/data/lib/config.py → parents[3] is the repo root.
PROJECT_ROOT = Path(__file__).resolve().parents[3]

DATA_DIR    = PROJECT_ROOT / 'data'
CURATED_DIR = DATA_DIR / 'curated'          # {language}_curated.jsonl — source of truth
DB_PATH     = DATA_DIR / 'vocabulary.db'    # what the app actually serves
OS_DIR      = DATA_DIR / 'opensubtitles_freq_corpora'
WIKI_DIR    = DATA_DIR / 'wikipedia_freq_corpora'
GLOSS_CACHE = DATA_DIR / 'gloss_cache'      # cached Wiktionary/Translate lookups
PRESEED_DIR = DATA_DIR / 'preseed'          # earlier pipeline output, used by backfill
SEED_DIR    = DATA_DIR / 'seed'             # hand-written starter vocabularies
IMAGES_DIR  = DATA_DIR / 'images'           # Wikipedia photos (animals/ food/ nature/)
EMOJI_DIR   = DATA_DIR / 'emoji'            # OpenMoji SVGs

VISUAL_MAP  = PROJECT_ROOT / 'src' / 'client' / 'data' / 'visual-map.ts'


def curated_path(lang: str) -> Path:
    """data/curated/spanish_curated.jsonl for 'spa'."""
    return CURATED_DIR / f'{LANG_NAMES[lang]}_curated.jsonl'


def seed_path(lang: str) -> Path:
    """data/seed/german.txt for 'deu'. May not exist — seeding is optional."""
    return SEED_DIR / f'{LANG_NAMES[lang]}.txt'


def gloss_cache_path(lang: str) -> Path:
    """data/gloss_cache/gloss_cache_spa.jsonl for 'spa'."""
    GLOSS_CACHE.mkdir(parents=True, exist_ok=True)
    return GLOSS_CACHE / f'gloss_cache_{lang}.jsonl'


# 3-letter code -> full language name (used for JSONL filenames, DB lang field)
#
# Everything else in the pipeline iterates over this dict — --langs choices, the
# "all languages" default, the help text. Adding a key here is what makes a
# language exist; the maps below only say which code each library wants for it.
LANG_NAMES: Dict[str, str] = {
    'spa': 'spanish',
    'fra': 'french',
    'ita': 'italian',
    'por': 'portuguese',
    'deu': 'german',
    'nld': 'dutch',
}

# 3-letter code -> spaCy model name
SPACY_MODELS: Dict[str, str] = {
    'fra': 'fr_core_news_sm',
    'ita': 'it_core_news_sm',
    'por': 'pt_core_news_sm',
    'spa': 'es_core_news_sm',
    'deu': 'de_core_news_sm',
    'nld': 'nl_core_news_sm',
}

# 3-letter code -> ISO 639-1 code used by deep_translator
LANG_SRC: Dict[str, str] = {
    'spa': 'es',
    'fra': 'fr',
    'ita': 'it',
    'por': 'pt',
    'deu': 'de',
    'nld': 'nl',
}

# 3-letter code -> ISO 639-1 code used by opensubtitles_freq_corpora directory names
OS_LANG: Dict[str, str] = {
    'spa': 'es',
    'fra': 'fr',
    'ita': 'it',
    'por': 'pt',
    'deu': 'de',
    'nld': 'nl',
}

# 3-letter code -> language name used by wiktionaryparser
WIKT_LANG: Dict[str, str] = {
    'spa': 'spanish',
    'fra': 'french',
    'ita': 'italian',
    'por': 'portuguese',
    'deu': 'german',
    'nld': 'dutch',
}

# 3-letter code -> mlconjug3 language code
#
# NO 'deu' OR 'nld' ENTRY, AND THAT IS NOT AN OVERSIGHT. mlconjug3 ships models
# for en, es, fr, it, pt and ro only — no German, no Dutch. A missing key here
# makes get_conjugator() return None, which build_conjugations() already
# handles, so those verbs are imported with conjugations: null rather than
# failing.
#
# LANGS_WITHOUT_CONJUGATION below exists so the pipeline can *say* that once,
# instead of reporting it as several thousand individual failures.
MLCONJUG3_LANG: Dict[str, str] = {
    'spa': 'es',
    'fra': 'fr',
    'ita': 'it',
    'por': 'pt',
}

# Languages with no automated conjugation source. Spanish is absent because it
# has one of its own — the rules engine in src/server/lib/verb-rules.ts, driven
# by conjugation_class rather than by mlconjug3.
LANGS_WITHOUT_CONJUGATION = frozenset(
    code for code in LANG_NAMES
    if code not in MLCONJUG3_LANG and code != 'spa'
)

# App tense name -> (mlconjug3 mood, mlconjug3 tense label)
# Lookup tries bare label first (French exact match), then mood-prefixed (spa/ita/por v4).
TENSE_MAP: Dict[str, Dict[str, Tuple[str, str]]] = {
    'spa': {
        'present':     ('Indicativo',  'presente'),
        'preterite':   ('Indicativo',  'pretérito perfecto simple'),
        'imperfect':   ('Indicativo',  'pretérito imperfecto'),
        'future':      ('Indicativo',  'futuro'),
        'conditional': ('Condicional', 'Condicional'),
        'subjunctive': ('Subjuntivo',  'presente'),
        'imperative':  ('Imperativo',  'Afirmativo'),
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
        'preterite':   ('Indicativo',  'pretérito perfeito simples'),
        'imperfect':   ('Indicativo',  'pretérito imperfeito'),
        'future':      ('Indicativo',  'Futuro do Presente Simples'),
        'conditional': ('Condicional', 'Futuro do Pretérito Simples'),
        'subjunctive': ('Conjuntivo',  ' Subjuntivo Presente'),
        'imperative':  ('Imperativo',  'Afirmativo'),
    },
    # No 'deu' — see MLCONJUG3_LANG. A tense map with no conjugator behind it
    # would only produce a table of Nones.
}


# ── Frequency rank scales ─────────────────────────────────────────────────────
# These two are the *only* definitions of these scales in the pipeline.
# The corpus and mining code each used to carry their own copy
# with different thresholds, which meant rank 1200 was B1 in one file and B2 in
# the other. The thresholds kept here are the ones that produced the data
# currently in vocabulary.db, so nothing already imported shifts band.

def rank_to_difficulty(rank: Optional[int]) -> int:
    """Map a frequency rank to a 1-5 difficulty level (1 = most common)."""
    if not rank:     return 5
    if rank <= 200:  return 1
    if rank <= 500:  return 2
    if rank <= 1000: return 3
    if rank <= 2000: return 4
    return 5


def rank_to_band(rank: Optional[int]) -> str:
    """Map a frequency rank to a CEFR band (A1 = most common)."""
    if not rank:     return 'C2'
    if rank <= 200:  return 'A1'
    if rank <= 500:  return 'A2'
    if rank <= 1000: return 'B1'
    if rank <= 2000: return 'B2'
    if rank <= 4000: return 'C1'
    return 'C2'


# spaCy POS tag -> app POS group
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
