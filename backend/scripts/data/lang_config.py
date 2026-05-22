"""
lang_config.py — Shared language configuration for the VocabApp pipeline
=========================================================================
Single source of truth for language codes, model names, and POS mappings.
Imported by corpus_builder.py, gloss_fetcher.py, and clean_wikicorpora.py.
"""

from typing import Dict, Tuple

# 3-letter code → full language name (used for preseed filenames, DB lang field)
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

# 3-letter code → spaCy model name
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

# 3-letter code → ISO 639-1 code used by deep_translator
LANG_SRC: Dict[str, str] = {
    'spa': 'es',
    'fra': 'fr',
    'ita': 'it',
    'por': 'pt',
}

# 3-letter code → ISO 639-1 code used by opensubtitles_freq_corpora directory names
OS_LANG: Dict[str, str] = {
    'spa': 'es',
    'fra': 'fr',
    'ita': 'it',
    'por': 'pt',
    'deu': 'de',
    'rus': 'ru',
    'jpn': 'ja',
    'zho': 'zh',
}

# 3-letter code → language name used by wiktionaryparser
WIKT_LANG: Dict[str, str] = {
    'spa': 'spanish',
    'fra': 'french',
    'ita': 'italian',
    'por': 'portuguese',
}

# 3-letter code → mlconjug3 language code
MLCONJUG3_LANG: Dict[str, str] = {
    'spa': 'es',
    'fra': 'fr',
    'ita': 'it',
    'por': 'pt',
}

# App tense name → (mlconjug3 mood, mlconjug3 tense label)
# Lookup tries bare label first (French exact match), then mood-prefixed (spa/ita/por v4).
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

# spaCy POS tag → app POS group
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
