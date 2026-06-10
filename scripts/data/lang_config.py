"""
lang_config.py - Shared language configuration for the VocabApp pipeline
=========================================================================
Single source of truth for language codes, model names, POS mappings,
and shared utility functions.
Imported by corpus_builder.py, corpus_to_curated.py, sync_db.py, and
check_visual_coverage.py.
"""

from typing import Dict, Optional, Tuple

# 3-letter code -> full language name (used for JSONL filenames, DB lang field)
LANG_NAMES: Dict[str, str] = {
    'spa': 'spanish',
    'fra': 'french',
    'ita': 'italian',
    'por': 'portuguese',
}

# 3-letter code -> spaCy model name
SPACY_MODELS: Dict[str, str] = {
    'fra': 'fr_core_news_sm',
    'ita': 'it_core_news_sm',
    'por': 'pt_core_news_sm',
    'spa': 'es_core_news_sm',
}

# 3-letter code -> ISO 639-1 code used by deep_translator
LANG_SRC: Dict[str, str] = {
    'spa': 'es',
    'fra': 'fr',
    'ita': 'it',
    'por': 'pt',
}

# 3-letter code -> ISO 639-1 code used by opensubtitles_freq_corpora directory names
OS_LANG: Dict[str, str] = {
    'spa': 'es',
    'fra': 'fr',
    'ita': 'it',
    'por': 'pt',
}

# 3-letter code -> language name used by wiktionaryparser
WIKT_LANG: Dict[str, str] = {
    'spa': 'spanish',
    'fra': 'french',
    'ita': 'italian',
    'por': 'portuguese',
}

# 3-letter code -> mlconjug3 language code
MLCONJUG3_LANG: Dict[str, str] = {
    'spa': 'es',
    'fra': 'fr',
    'ita': 'it',
    'por': 'pt',
}

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
}


def rank_to_difficulty(rank: Optional[int]) -> int:
    """Map a frequency rank to a 1-5 difficulty level (1 = most common)."""
    if not rank:     return 5
    if rank <= 200:  return 1
    if rank <= 500:  return 2
    if rank <= 1000: return 3
    if rank <= 2000: return 4
    return 5


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
