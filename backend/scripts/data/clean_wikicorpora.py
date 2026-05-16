#!/usr/bin/env python3
"""
clean_wikicorpora.py  —  VocabApp data pipeline entry point
============================================================
Produces one JSONL file per language containing:

  1. HARDCODED entries (always included, regardless of --n)
       • Function words: articles, prepositions, conjunctions, pronouns,
         demonstratives, possessives, interrogatives, closed-class adverbs.
         These are a finite, stable set deliberately absent from corpus data.
       • Irregular verbs: flagged entries whose conjugation tables are
         generated here via mlconjug3 (if installed).

  2. CORPUS entries (top --n open-class words from Wikipedia frequency data)
       • Only nouns, verbs and adjectives are extracted.
       • Closed-class words are already covered by the hardcoded list above.

Output  →  data/wikicorpus_{lang}.jsonl
           (hardcoded entries first, then corpus entries ordered by frequency)

Usage:
    python backend/scripts/data/clean_wikicorpora.py
    python backend/scripts/data/clean_wikicorpora.py --langs spa --n 5000
    python backend/scripts/data/clean_wikicorpora.py --langs spa fra ita por --n 10000

Dependencies:
    pip install spacy mlconjug3
    python -m spacy download es_core_news_sm   # (and fr / it / pt equivalents)
    mlconjug3 is optional — if absent, irregular verbs are written without
    conjugation tables and can be enriched later.
"""

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Dict, List, Optional, Tuple

# ── Optional imports ───────────────────────────────────────────────────────────
try:
    import spacy
    SPACY_AVAILABLE = True
except ImportError:
    print("Warning: spaCy not installed — corpus extraction will be skipped.")
    print("  pip install spacy")
    SPACY_AVAILABLE = False

try:
    import mlconjug3
    MLCONJUG3_AVAILABLE = True
except ImportError:
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

# mlconjug3 language codes
MLCONJUG3_LANG: Dict[str, str] = {
    'spa': 'es',
    'fra': 'fr',
    'ita': 'it',
    'por': 'pt',
}

# Map app tense names → (mlconjug3 mood, mlconjug3 tense label)
# Forms extracted as list(tense_dict.values()) preserving pronoun order.
TENSE_MAP: Dict[str, Dict[str, Tuple[str, str]]] = {
    'spa': {
        'present':     ('Indicativo',  'Presente'),
        'preterite':   ('Indicativo',  'Pretérito Indefinido'),
        'imperfect':   ('Indicativo',  'Pretérito Imperfecto'),
        'future':      ('Indicativo',  'Futuro'),
        'conditional': ('Indicativo',  'Condicional'),
        'subjunctive': ('Subjuntivo',  'Presente'),
        'imperative':  ('Imperativo',  'Afirmativo'),
    },
    'fra': {
        'present':     ('Indicatif',   'Présent'),
        'preterite':   ('Indicatif',   'Passé simple'),
        'imperfect':   ('Indicatif',   'Imparfait'),
        'future':      ('Indicatif',   'Futur simple'),
        'conditional': ('Conditionnel','Présent'),
        'subjunctive': ('Subjonctif',  'Présent'),
        'imperative':  ('Impératif',   'Présent'),
    },
    'ita': {
        'present':     ('Indicativo',  'Presente'),
        'preterite':   ('Indicativo',  'Passato remoto'),
        'imperfect':   ('Indicativo',  'Imperfetto'),
        'future':      ('Indicativo',  'Futuro semplice'),
        'conditional': ('Condizionale','Presente'),
        'subjunctive': ('Congiuntivo', 'Presente'),
        'imperative':  ('Imperativo',  'Presente'),
    },
    'por': {
        'present':     ('Indicativo',  'Presente'),
        'preterite':   ('Indicativo',  'Pretérito Perfeito'),
        'imperfect':   ('Indicativo',  'Pretérito Imperfeito'),
        'future':      ('Indicativo',  'Futuro do Presente'),
        'conditional': ('Indicativo',  'Futuro do Pretérito'),
        'subjunctive': ('Subjuntivo',  'Presente'),
        'imperative':  ('Imperativo',  'Afirmativo'),
    },
}

# Corpus: only these POS groups are extracted — everything else is hardcoded.
OPEN_CLASS_POS = {'noun', 'verb', 'adjective'}

POS_GROUPS: Dict[str, str] = {
    'NOUN':  'noun',
    'PROPN': 'noun',
    'VERB':  'verb',
    'AUX':   'verb',
    'ADJ':   'adjective',
    'ADV':   'adverb',
    'PRON':  'pronoun',
    'ADP':   'preposition',
    'CCONJ': 'conjunction',
    'SCONJ': 'conjunction',
    'DET':   'article',
    'NUM':   'other',
    'INTJ':  'other',
    'PART':  'other',
    'PUNCT': 'other',
    'SYM':   'other',
    'X':     'other',
}

RANK_START  = 101       # first "real word" rank in corpus (1-100 are punctuation)
NUMERIC_RE  = re.compile(r'^\d+[%]?$')


# ══════════════════════════════════════════════════════════════════════════════
# RANK → METADATA HELPERS
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
# ENTRY FACTORIES
# ══════════════════════════════════════════════════════════════════════════════

def fw(word: str, pos: str, glosses: List[str], lang: str,
       band: str = 'A1', difficulty: int = 1,
       notes: str = '', domains: Optional[List[str]] = None) -> dict:
    """Build a hardcoded function-word entry."""
    return {
        'rank':       None,
        'word':       word,
        'display':    glosses[0] if glosses else '',
        'pos':        pos,
        'difficulty': difficulty,
        'tags':       ['hardcoded', 'function_word'],
        'notes':      notes,
        'glosses':    glosses,
        'examples':   [],
        'linguistic': {
            'infinitive':   None,
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
        'frequency':  {'band': band, 'rank': None, 'corpus_frequency': None},
        'domains':    domains or ['general'],
        'register':   'neutral',
        'lang':       lang,
        'source':     'hardcoded',
        'needs_review': False,
    }


def irr(word: str, glosses: List[str], lang: str,
        band: str = 'A1', difficulty: int = 1,
        notes: str = '') -> dict:
    """Build a hardcoded irregular-verb entry (conjugations filled by mlconjug3)."""
    return {
        'rank':       None,
        'word':       word,
        'display':    glosses[0] if glosses else '',
        'pos':        'verb',
        'difficulty': difficulty,
        'tags':       ['hardcoded', 'irregular'],
        'notes':      notes,
        'glosses':    glosses,
        'examples':   [],
        'linguistic': {
            'infinitive':   word,
            'reflexive':    None,
            'gender':       None,
            'plural':       None,
            'register':     'neutral',
            'ipa':          '',
            'syllables':    [],
            'conjugations': None,   # filled by build_conjugations() below
            'irregular':    True,
        },
        'relations':  {'commonly_confused_with': [], 'related': [], 'synonyms': [], 'antonyms': []},
        'frequency':  {'band': band, 'rank': None, 'corpus_frequency': None},
        'domains':    ['general'],
        'register':   'neutral',
        'lang':       lang,
        'source':     'hardcoded',
        'needs_review': False,
    }


def corpus_entry(word: str, pos_group: str, rank_clean: int,
                 corpus_count: int, lang_code: str) -> dict:
    """Build a corpus-sourced entry for an open-class word."""
    is_verb  = pos_group == 'verb'
    band     = rank_to_band(rank_clean)
    difficulty = rank_to_difficulty(rank_clean)
    tags     = ['corpus']
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

_conjugators: Dict[str, object] = {}   # cache one conjugator per language

def get_conjugator(lang_code: str):
    """Return a cached mlconjug3.Conjugator or None."""
    if not MLCONJUG3_AVAILABLE:
        return None
    ml_lang = MLCONJUG3_LANG.get(lang_code)
    if not ml_lang:
        return None
    if ml_lang not in _conjugators:
        try:
            _conjugators[ml_lang] = mlconjug3.Conjugator(language=ml_lang)
        except Exception as e:
            print(f"  Warning: could not create mlconjug3 conjugator for '{ml_lang}': {e}")
            _conjugators[ml_lang] = None
    return _conjugators[ml_lang]


def build_conjugations(infinitive: str, lang_code: str) -> Optional[dict]:
    """
    Return a conjugation dict keyed by app tense name, each value being a list
    of forms in pronoun order (as mlconjug3 returns them).
    Returns None if mlconjug3 is unavailable or conjugation fails.
    """
    conjugator = get_conjugator(lang_code)
    if not conjugator:
        return None

    try:
        verb       = conjugator.conjugate(infinitive)
        tense_map  = TENSE_MAP.get(lang_code, {})
        result     = {}

        for app_tense, (mood, tense_label) in tense_map.items():
            try:
                tense_data = verb.conjug_info[mood][tense_label]
                result[app_tense] = list(tense_data.values())
            except (KeyError, AttributeError, TypeError):
                result[app_tense] = None

        return result if any(v is not None for v in result.values()) else None

    except Exception as e:
        print(f"  Warning: conjugation failed for '{infinitive}': {e}")
        return None


# ══════════════════════════════════════════════════════════════════════════════
# HARDCODED DATA
# ══════════════════════════════════════════════════════════════════════════════

# ── SPANISH ───────────────────────────────────────────────────────────────────

SPANISH_FUNCTION_WORDS: List[dict] = [
    # Articles
    fw('el',    'article', ['the (masc. sing.)'],                'spanish'),
    fw('la',    'article', ['the (fem. sing.)'],                 'spanish'),
    fw('los',   'article', ['the (masc. pl.)'],                  'spanish'),
    fw('las',   'article', ['the (fem. pl.)'],                   'spanish'),
    fw('un',    'article', ['a, an (masc. sing.)'],              'spanish'),
    fw('una',   'article', ['a, an (fem. sing.)'],               'spanish'),
    fw('unos',  'article', ['some (masc. pl.)'],                 'spanish'),
    fw('unas',  'article', ['some (fem. pl.)'],                  'spanish'),
    # Prepositions
    fw('a',         'preposition', ['to', 'at'],                 'spanish'),
    fw('ante',      'preposition', ['before', 'in front of'],    'spanish'),
    fw('bajo',      'preposition', ['under', 'below'],           'spanish'),
    fw('con',       'preposition', ['with'],                     'spanish'),
    fw('contra',    'preposition', ['against'],                  'spanish'),
    fw('de',        'preposition', ['of', 'from'],               'spanish'),
    fw('desde',     'preposition', ['from', 'since'],            'spanish'),
    fw('durante',   'preposition', ['during'],                   'spanish'),
    fw('en',        'preposition', ['in', 'on', 'at'],           'spanish'),
    fw('entre',     'preposition', ['between', 'among'],         'spanish'),
    fw('hacia',     'preposition', ['towards', 'around'],        'spanish'),
    fw('hasta',     'preposition', ['until', 'up to'],           'spanish'),
    fw('mediante',  'preposition', ['by means of', 'through'],   'spanish', band='B1', difficulty=3),
    fw('para',      'preposition', ['for', 'in order to'],       'spanish'),
    fw('por',       'preposition', ['for', 'by', 'through'],     'spanish'),
    fw('según',     'preposition', ['according to'],             'spanish', band='A2', difficulty=2),
    fw('sin',       'preposition', ['without'],                  'spanish'),
    fw('sobre',     'preposition', ['about', 'on top of'],       'spanish'),
    fw('tras',      'preposition', ['after', 'behind'],          'spanish', band='A2', difficulty=2),
    # Conjunctions
    fw('y',          'conjunction', ['and'],                     'spanish'),
    fw('e',          'conjunction', ['and (before i/hi)'],       'spanish',
       notes='Used instead of "y" before words beginning with i or hi'),
    fw('o',          'conjunction', ['or'],                      'spanish'),
    fw('u',          'conjunction', ['or (before o/ho)'],        'spanish',
       notes='Used instead of "o" before words beginning with o or ho'),
    fw('ni',         'conjunction', ['nor', 'neither'],          'spanish'),
    fw('pero',       'conjunction', ['but'],                     'spanish'),
    fw('sino',       'conjunction', ['but rather'],              'spanish', band='A2', difficulty=2),
    fw('aunque',     'conjunction', ['although', 'even though'], 'spanish', band='A2', difficulty=2),
    fw('porque',     'conjunction', ['because'],                 'spanish'),
    fw('pues',       'conjunction', ['since', 'because', 'so'], 'spanish', band='A2', difficulty=2),
    fw('que',        'conjunction', ['that', 'which', 'who'],    'spanish'),
    fw('si',         'conjunction', ['if', 'whether'],           'spanish'),
    fw('como',       'conjunction', ['as', 'like', 'how'],       'spanish'),
    fw('cuando',     'conjunction', ['when'],                    'spanish'),
    fw('donde',      'conjunction', ['where'],                   'spanish'),
    fw('mientras',   'conjunction', ['while', 'whereas'],        'spanish', band='A2', difficulty=2),
    fw('ya que',     'conjunction', ['since', 'given that'],     'spanish', band='B1', difficulty=3),
    fw('sin embargo','conjunction', ['however', 'nevertheless'], 'spanish', band='B1', difficulty=3),
    fw('por lo tanto','conjunction',['therefore', 'thus'],       'spanish', band='B1', difficulty=3),
    fw('es decir',   'conjunction', ['that is', 'in other words'],'spanish',band='B1', difficulty=3),
    # Personal pronouns
    fw('yo',        'pronoun', ['I'],                            'spanish'),
    fw('tú',        'pronoun', ['you (informal sing.)'],         'spanish'),
    fw('él',        'pronoun', ['he'],                           'spanish'),
    fw('ella',      'pronoun', ['she'],                          'spanish'),
    fw('nosotros',  'pronoun', ['we (masc. / mixed)'],           'spanish'),
    fw('nosotras',  'pronoun', ['we (fem.)'],                    'spanish'),
    fw('vosotros',  'pronoun', ['you all (Spain, masc.)'],       'spanish'),
    fw('vosotras',  'pronoun', ['you all (Spain, fem.)'],        'spanish'),
    fw('ellos',     'pronoun', ['they (masc. / mixed)'],         'spanish'),
    fw('ellas',     'pronoun', ['they (fem.)'],                  'spanish'),
    fw('usted',     'pronoun', ['you (formal sing.)'],           'spanish'),
    fw('ustedes',   'pronoun', ['you all (formal / Latin Am.)'], 'spanish'),
    # Object / reflexive pronouns
    fw('me',  'pronoun', ['me', 'myself'],                       'spanish'),
    fw('te',  'pronoun', ['you', 'yourself'],                    'spanish'),
    fw('se',  'pronoun', ['himself', 'herself', 'themselves'],   'spanish'),
    fw('nos', 'pronoun', ['us', 'ourselves'],                    'spanish'),
    fw('os',  'pronoun', ['you all', 'yourselves (Spain)'],      'spanish'),
    fw('lo',  'pronoun', ['him', 'it (masc. direct obj.)'],      'spanish'),
    fw('le',  'pronoun', ['him', 'her', 'you (indirect obj.)'],  'spanish'),
    fw('les', 'pronoun', ['them (indirect obj.)'],               'spanish'),
    # Stressed / prepositional pronouns
    fw('mí',  'pronoun', ['me (after preposition)'],             'spanish'),
    fw('ti',  'pronoun', ['you (after preposition)'],            'spanish'),
    fw('sí',  'pronoun', ['himself / herself (after prep.)'],    'spanish'),
    # Indefinite pronouns
    fw('algo',    'pronoun', ['something'],                      'spanish'),
    fw('nada',    'pronoun', ['nothing'],                        'spanish'),
    fw('alguien', 'pronoun', ['someone', 'somebody'],            'spanish'),
    fw('nadie',   'pronoun', ['nobody', 'no one'],               'spanish'),
    fw('uno',     'pronoun', ['one (indefinite)'],               'spanish'),
    # Possessives (severely underrepresented in Wikipedia corpora)
    fw('mi',      'pronoun', ['my'],                             'spanish'),
    fw('tu',      'pronoun', ['your (informal)'],                'spanish'),
    fw('su',      'pronoun', ['his', 'her', 'your (formal)', 'their'], 'spanish'),
    fw('nuestro', 'pronoun', ['our (masc.)'],                    'spanish'),
    fw('nuestra', 'pronoun', ['our (fem.)'],                     'spanish'),
    fw('vuestro', 'pronoun', ['your (pl., masc., Spain)'],       'spanish'),
    fw('vuestra', 'pronoun', ['your (pl., fem., Spain)'],        'spanish'),
    fw('mío',     'pronoun', ['mine (masc.)'],                   'spanish'),
    fw('mía',     'pronoun', ['mine (fem.)'],                    'spanish'),
    fw('tuyo',    'pronoun', ['yours (masc., informal)'],        'spanish'),
    fw('tuya',    'pronoun', ['yours (fem., informal)'],         'spanish'),
    fw('suyo',    'pronoun', ['his', 'hers', 'yours', 'theirs (masc.)'], 'spanish'),
    fw('suya',    'pronoun', ['his', 'hers', 'yours', 'theirs (fem.)'],  'spanish'),
    # Demonstratives
    fw('este',    'pronoun', ['this (masc.)'],                   'spanish'),
    fw('esta',    'pronoun', ['this (fem.)'],                    'spanish'),
    fw('estos',   'pronoun', ['these (masc.)'],                  'spanish'),
    fw('estas',   'pronoun', ['these (fem.)'],                   'spanish'),
    fw('ese',     'pronoun', ['that (masc.)'],                   'spanish'),
    fw('esa',     'pronoun', ['that (fem.)'],                    'spanish'),
    fw('esos',    'pronoun', ['those (masc.)'],                  'spanish'),
    fw('esas',    'pronoun', ['those (fem.)'],                   'spanish'),
    fw('aquel',   'pronoun', ['that (distant, masc.)'],          'spanish', band='A2', difficulty=2),
    fw('aquella', 'pronoun', ['that (distant, fem.)'],           'spanish', band='A2', difficulty=2),
    fw('aquellos','pronoun', ['those (distant, masc.)'],         'spanish', band='A2', difficulty=2),
    fw('aquellas','pronoun', ['those (distant, fem.)'],          'spanish', band='A2', difficulty=2),
    fw('esto',    'pronoun', ['this (neuter)'],                  'spanish'),
    fw('eso',     'pronoun', ['that (neuter)'],                  'spanish'),
    fw('aquello', 'pronoun', ['that (distant, neuter)'],         'spanish', band='A2', difficulty=2),
    # Interrogatives
    fw('qué',    'pronoun', ['what', 'which'],                   'spanish'),
    fw('quién',  'pronoun', ['who'],                             'spanish'),
    fw('quiénes','pronoun', ['who (pl.)'],                       'spanish'),
    fw('cuál',   'pronoun', ['which (one)'],                     'spanish'),
    fw('cuáles', 'pronoun', ['which (ones)'],                    'spanish'),
    fw('cuándo', 'adverb',  ['when'],                            'spanish'),
    fw('dónde',  'adverb',  ['where'],                           'spanish'),
    fw('cómo',   'adverb',  ['how'],                             'spanish'),
    fw('cuánto', 'pronoun', ['how much (masc.)'],                'spanish'),
    fw('cuánta', 'pronoun', ['how much (fem.)'],                 'spanish'),
    # Closed-class adverbs
    fw('no',       'adverb', ['no', 'not'],                      'spanish'),
    fw('sí',       'adverb', ['yes'],                            'spanish'),
    fw('muy',      'adverb', ['very'],                           'spanish'),
    fw('bien',     'adverb', ['well', 'fine'],                   'spanish'),
    fw('mal',      'adverb', ['badly', 'poorly'],                'spanish'),
    fw('más',      'adverb', ['more'],                           'spanish'),
    fw('menos',    'adverb', ['less', 'fewer'],                  'spanish'),
    fw('también',  'adverb', ['also', 'too'],                    'spanish'),
    fw('tampoco',  'adverb', ['neither', 'not either'],          'spanish'),
    fw('ya',       'adverb', ['already', 'now', 'anymore'],      'spanish'),
    fw('todavía',  'adverb', ['still', 'yet'],                   'spanish'),
    fw('aún',      'adverb', ['still', 'yet', 'even'],           'spanish'),
    fw('siempre',  'adverb', ['always'],                         'spanish'),
    fw('nunca',    'adverb', ['never'],                          'spanish'),
    fw('jamás',    'adverb', ['never', 'ever'],                  'spanish', band='A2', difficulty=2),
    fw('ahora',    'adverb', ['now'],                            'spanish'),
    fw('hoy',      'adverb', ['today'],                          'spanish'),
    fw('ayer',     'adverb', ['yesterday'],                      'spanish'),
    fw('mañana',   'adverb', ['tomorrow'],                       'spanish'),
    fw('aquí',     'adverb', ['here'],                           'spanish'),
    fw('allí',     'adverb', ['there'],                          'spanish'),
    fw('allá',     'adverb', ['over there'],                     'spanish'),
    fw('así',      'adverb', ['like this', 'so', 'thus'],        'spanish'),
    fw('tan',      'adverb', ['so', 'as (comparisons)'],         'spanish'),
    fw('solo',     'adverb', ['only', 'just'],                   'spanish'),
    fw('además',   'adverb', ['furthermore', 'besides'],         'spanish', band='A2', difficulty=2),
    fw('incluso',  'adverb', ['even', 'including'],              'spanish', band='A2', difficulty=2),
    fw('quizás',   'adverb', ['maybe', 'perhaps'],               'spanish', band='A2', difficulty=2),
    fw('tal vez',  'adverb', ['maybe', 'perhaps'],               'spanish', band='A2', difficulty=2),
    fw('antes',    'adverb', ['before', 'earlier'],              'spanish'),
    fw('después',  'adverb', ['after', 'later'],                 'spanish'),
    fw('entonces', 'adverb', ['then', 'so'],                     'spanish'),
    fw('luego',    'adverb', ['then', 'later'],                  'spanish'),
    fw('pronto',   'adverb', ['soon'],                           'spanish'),
    fw('lejos',    'adverb', ['far', 'far away'],                'spanish'),
    fw('cerca',    'adverb', ['near', 'close'],                  'spanish'),
    fw('arriba',   'adverb', ['above', 'up'],                    'spanish'),
    fw('abajo',    'adverb', ['below', 'down'],                  'spanish'),
    fw('dentro',   'adverb', ['inside', 'within'],               'spanish'),
    fw('fuera',    'adverb', ['outside'],                        'spanish'),
    fw('juntos',   'adverb', ['together'],                       'spanish'),
    fw('atrás',    'adverb', ['behind', 'back'],                 'spanish'),
]

SPANISH_IRREGULAR_VERBS: List[dict] = [
    irr('ser',       ['to be (permanent quality)'],              'spanish'),
    irr('estar',     ['to be (state / location)'],               'spanish'),
    irr('haber',     ['to have (auxiliary)', 'there is/are'],    'spanish'),
    irr('ir',        ['to go'],                                  'spanish'),
    irr('tener',     ['to have', 'to hold'],                     'spanish'),
    irr('hacer',     ['to do', 'to make'],                       'spanish'),
    irr('poder',     ['to be able to', 'can'],                   'spanish'),
    irr('querer',    ['to want', 'to love'],                     'spanish'),
    irr('saber',     ['to know (facts)', 'to know how'],         'spanish'),
    irr('venir',     ['to come'],                                'spanish'),
    irr('decir',     ['to say', 'to tell'],                      'spanish'),
    irr('ver',       ['to see'],                                 'spanish'),
    irr('dar',       ['to give'],                                'spanish'),
    irr('poner',     ['to put', 'to place'],                     'spanish'),
    irr('traer',     ['to bring'],                               'spanish'),
    irr('salir',     ['to leave', 'to go out'],                  'spanish'),
    irr('conocer',   ['to know (people/places)', 'to meet'],     'spanish'),
    irr('oír',       ['to hear'],                                'spanish'),
    irr('caer',      ['to fall'],                                'spanish'),
    irr('valer',     ['to be worth'],                            'spanish'),
    irr('caber',     ['to fit (inside)'],                        'spanish', band='B1', difficulty=3),
    irr('andar',     ['to walk'],                                'spanish'),
    irr('dormir',    ['to sleep'],                               'spanish'),
    irr('morir',     ['to die'],                                 'spanish'),
    irr('seguir',    ['to follow', 'to continue'],               'spanish'),
    irr('pedir',     ['to ask for', 'to request'],               'spanish'),
    irr('sentir',    ['to feel', 'to be sorry'],                 'spanish'),
    irr('preferir',  ['to prefer'],                              'spanish', band='A2', difficulty=2),
    irr('repetir',   ['to repeat'],                              'spanish', band='A2', difficulty=2),
    irr('servir',    ['to serve'],                               'spanish'),
    irr('vestir',    ['to dress', 'to wear'],                    'spanish'),
    irr('medir',     ['to measure'],                             'spanish', band='A2', difficulty=2),
    irr('elegir',    ['to choose', 'to elect'],                  'spanish', band='A2', difficulty=2),
    irr('conseguir', ['to get', 'to achieve'],                   'spanish', band='A2', difficulty=2),
    irr('reír',      ['to laugh'],                               'spanish'),
    irr('sonreír',   ['to smile'],                               'spanish', band='A2', difficulty=2),
    irr('conducir',  ['to drive', 'to lead'],                    'spanish', band='A2', difficulty=2),
    irr('producir',  ['to produce'],                             'spanish', band='B1', difficulty=3),
    irr('traducir',  ['to translate'],                           'spanish', band='A2', difficulty=2),
    irr('construir', ['to build', 'to construct'],               'spanish', band='B1', difficulty=3),
    irr('huir',      ['to flee', 'to run away'],                 'spanish', band='B1', difficulty=3),
    irr('incluir',   ['to include'],                             'spanish', band='B1', difficulty=3),
    irr('satisfacer',['to satisfy'],                             'spanish', band='B1', difficulty=3),
]

# ── FRENCH ────────────────────────────────────────────────────────────────────

FRENCH_FUNCTION_WORDS: List[dict] = [
    fw('le',    'article', ['the (masc. sing.)'],                'french'),
    fw('la',    'article', ['the (fem. sing.)'],                 'french'),
    fw('les',   'article', ['the (pl.)'],                        'french'),
    fw('un',    'article', ['a, an (masc.)'],                    'french'),
    fw('une',   'article', ['a, an (fem.)'],                     'french'),
    fw('des',   'article', ['some (pl. indef.)'],                'french'),
    fw('du',    'article', ['some (masc. partitive)'],           'french'),
    fw('de la', 'article', ['some (fem. partitive)'],            'french'),
    fw('à',     'preposition', ['to', 'at', 'in'],               'french'),
    fw('de',    'preposition', ['of', 'from'],                   'french'),
    fw('en',    'preposition', ['in', 'to', 'by'],               'french'),
    fw('dans',  'preposition', ['in', 'inside'],                 'french'),
    fw('sur',   'preposition', ['on', 'upon'],                   'french'),
    fw('sous',  'preposition', ['under', 'below'],               'french'),
    fw('avec',  'preposition', ['with'],                         'french'),
    fw('sans',  'preposition', ['without'],                      'french'),
    fw('pour',  'preposition', ['for', 'in order to'],           'french'),
    fw('par',   'preposition', ['by', 'through', 'per'],         'french'),
    fw('entre', 'preposition', ['between', 'among'],             'french'),
    fw('vers',  'preposition', ['towards', 'around'],            'french'),
    fw('depuis','preposition', ['since', 'for'],                 'french'),
    fw('pendant','preposition',['during', 'for'],                'french'),
    fw('avant', 'preposition', ['before'],                       'french'),
    fw('après', 'preposition', ['after'],                        'french'),
    fw('chez',  'preposition', ["at someone's place", 'at'],     'french'),
    fw('selon', 'preposition', ['according to'],                 'french', band='B1', difficulty=3),
    fw('et',    'conjunction', ['and'],                          'french'),
    fw('ou',    'conjunction', ['or'],                           'french'),
    fw('ni',    'conjunction', ['nor', 'neither'],               'french'),
    fw('mais',  'conjunction', ['but'],                          'french'),
    fw('donc',  'conjunction', ['therefore', 'so'],              'french', band='A2', difficulty=2),
    fw('or',    'conjunction', ['now', 'yet (logical)'],         'french', band='B1', difficulty=3),
    fw('car',   'conjunction', ['because', 'for'],               'french', band='A2', difficulty=2),
    fw('que',   'conjunction', ['that', 'which', 'who'],         'french'),
    fw('si',    'conjunction', ['if', 'whether'],                'french'),
    fw('parce que','conjunction',['because'],                    'french'),
    fw('quand', 'conjunction', ['when'],                         'french'),
    fw('bien que','conjunction',['although'],                    'french', band='B1', difficulty=3),
    fw('cependant','conjunction',['however', 'nevertheless'],    'french', band='B1', difficulty=3),
    fw('pourtant','conjunction', ['however', 'yet'],             'french', band='B1', difficulty=3),
    fw('je',   'pronoun', ['I'],                                 'french'),
    fw('tu',   'pronoun', ['you (informal sing.)'],              'french'),
    fw('il',   'pronoun', ['he', 'it (masc.)'],                  'french'),
    fw('elle', 'pronoun', ['she', 'it (fem.)'],                  'french'),
    fw('nous', 'pronoun', ['we'],                                'french'),
    fw('vous', 'pronoun', ['you (formal / pl.)'],                'french'),
    fw('ils',  'pronoun', ['they (masc. / mixed)'],              'french'),
    fw('elles','pronoun', ['they (fem.)'],                       'french'),
    fw('on',   'pronoun', ['one', 'we (informal)'],              'french'),
    fw('me',   'pronoun', ['me', 'myself'],                      'french'),
    fw('te',   'pronoun', ['you', 'yourself'],                   'french'),
    fw('se',   'pronoun', ['himself', 'herself', 'themselves'],  'french'),
    fw('le',   'pronoun', ['him', 'it (masc. obj.)'],            'french'),
    fw('la',   'pronoun', ['her', 'it (fem. obj.)'],             'french'),
    fw('les',  'pronoun', ['them (obj.)'],                       'french'),
    fw('lui',  'pronoun', ['him', 'her (indirect obj.)'],        'french'),
    fw('leur', 'pronoun', ['them (indirect obj.)'],              'french'),
    fw('y',    'pronoun', ['there', 'it (location/indirect)'],   'french'),
    fw('en',   'pronoun', ['of it', 'of them', 'some'],          'french'),
    fw('mon',  'pronoun', ['my (masc.)'],                        'french'),
    fw('ma',   'pronoun', ['my (fem.)'],                         'french'),
    fw('mes',  'pronoun', ['my (pl.)'],                          'french'),
    fw('ton',  'pronoun', ['your (informal, masc.)'],            'french'),
    fw('ta',   'pronoun', ['your (informal, fem.)'],             'french'),
    fw('tes',  'pronoun', ['your (informal, pl.)'],              'french'),
    fw('son',  'pronoun', ['his', 'her', 'its (masc.)'],         'french'),
    fw('sa',   'pronoun', ['his', 'her', 'its (fem.)'],          'french'),
    fw('ses',  'pronoun', ['his', 'her', 'its (pl.)'],           'french'),
    fw('notre','pronoun', ['our (sing.)'],                       'french'),
    fw('nos',  'pronoun', ['our (pl.)'],                         'french'),
    fw('votre','pronoun', ['your (formal, sing.)'],              'french'),
    fw('vos',  'pronoun', ['your (formal, pl.)'],                'french'),
    fw('leur', 'pronoun', ['their (sing.)'],                     'french'),
    fw('leurs','pronoun', ['their (pl.)'],                       'french'),
    fw('ce',   'pronoun', ['this', 'that', 'it'],                'french'),
    fw('cette','pronoun', ['this (fem.)'],                       'french'),
    fw('ces',  'pronoun', ['these', 'those'],                    'french'),
    fw('ceci', 'pronoun', ['this (neuter)'],                     'french'),
    fw('cela', 'pronoun', ['that (neuter)'],                     'french'),
    fw('ça',   'pronoun', ['that', 'it (informal)'],             'french'),
    fw('qui',     'pronoun', ['who'],                            'french'),
    fw('quoi',    'pronoun', ['what (after preposition)'],       'french'),
    fw('quel',    'pronoun', ['which', 'what (masc.)'],          'french'),
    fw('quelle',  'pronoun', ['which', 'what (fem.)'],           'french'),
    fw('quand',   'adverb',  ['when'],                           'french'),
    fw('où',      'adverb',  ['where'],                          'french'),
    fw('comment', 'adverb',  ['how'],                            'french'),
    fw('combien', 'adverb',  ['how much', 'how many'],           'french'),
    fw('pourquoi','adverb',  ['why'],                            'french'),
    fw('ne',        'adverb', ['not (negation particle)'],       'french'),
    fw('pas',       'adverb', ['not'],                           'french'),
    fw('non',       'adverb', ['no', 'not'],                     'french'),
    fw('oui',       'adverb', ['yes'],                           'french'),
    fw('très',      'adverb', ['very'],                          'french'),
    fw('bien',      'adverb', ['well', 'good'],                  'french'),
    fw('mal',       'adverb', ['badly'],                         'french'),
    fw('plus',      'adverb', ['more', 'no longer'],             'french'),
    fw('moins',     'adverb', ['less'],                          'french'),
    fw('aussi',     'adverb', ['also', 'too'],                   'french'),
    fw('encore',    'adverb', ['still', 'again', 'yet'],         'french'),
    fw('déjà',      'adverb', ['already'],                       'french'),
    fw('toujours',  'adverb', ['always', 'still'],               'french'),
    fw('jamais',    'adverb', ['never', 'ever'],                 'french'),
    fw('maintenant','adverb', ['now'],                           'french'),
    fw("aujourd'hui",'adverb',['today'],                         'french'),
    fw('hier',      'adverb', ['yesterday'],                     'french'),
    fw('demain',    'adverb', ['tomorrow'],                      'french'),
    fw('ici',       'adverb', ['here'],                          'french'),
    fw('là',        'adverb', ['there'],                         'french'),
    fw('là-bas',    'adverb', ['over there'],                    'french'),
    fw('souvent',   'adverb', ['often'],                         'french'),
    fw('parfois',   'adverb', ['sometimes'],                     'french'),
    fw('tôt',       'adverb', ['early', 'soon'],                 'french'),
    fw('tard',      'adverb', ['late'],                          'french'),
    fw('loin',      'adverb', ['far'],                           'french'),
    fw('près',      'adverb', ['near', 'close'],                 'french'),
    fw('seulement', 'adverb', ['only', 'just'],                  'french', band='A2', difficulty=2),
    fw('peut-être', 'adverb', ['maybe', 'perhaps'],              'french', band='A2', difficulty=2),
]

FRENCH_IRREGULAR_VERBS: List[dict] = [
    irr('être',      ['to be'],                                  'french'),
    irr('avoir',     ['to have'],                                'french'),
    irr('aller',     ['to go'],                                  'french'),
    irr('faire',     ['to do', 'to make'],                       'french'),
    irr('pouvoir',   ['to be able to', 'can'],                   'french'),
    irr('vouloir',   ['to want'],                                'french'),
    irr('savoir',    ['to know'],                                'french'),
    irr('venir',     ['to come'],                                'french'),
    irr('devoir',    ['to have to', 'must', 'to owe'],           'french'),
    irr('prendre',   ['to take'],                                'french'),
    irr('mettre',    ['to put', 'to place'],                     'french'),
    irr('voir',      ['to see'],                                 'french'),
    irr('tenir',     ['to hold', 'to keep'],                     'french'),
    irr('partir',    ['to leave', 'to depart'],                  'french'),
    irr('sortir',    ['to go out', 'to exit'],                   'french'),
    irr('sentir',    ['to feel', 'to smell'],                    'french'),
    irr('dormir',    ['to sleep'],                               'french'),
    irr('servir',    ['to serve'],                               'french'),
    irr('suivre',    ['to follow'],                              'french', band='A2', difficulty=2),
    irr('boire',     ['to drink'],                               'french'),
    irr('croire',    ['to believe'],                             'french', band='A2', difficulty=2),
    irr('connaître', ['to know (people/places)'],                'french'),
    irr('naître',    ['to be born'],                             'french', band='A2', difficulty=2),
    irr('vivre',     ['to live'],                                'french'),
    irr('lire',      ['to read'],                                'french'),
    irr('dire',      ['to say', 'to tell'],                      'french'),
    irr('écrire',    ['to write'],                               'french'),
    irr('rire',      ['to laugh'],                               'french'),
    irr('craindre',  ['to fear'],                                'french', band='B1', difficulty=3),
    irr('conduire',  ['to drive', 'to lead'],                    'french', band='A2', difficulty=2),
    irr('produire',  ['to produce'],                             'french', band='B1', difficulty=3),
    irr('traduire',  ['to translate'],                           'french', band='B1', difficulty=3),
    irr('construire',['to build'],                               'french', band='B1', difficulty=3),
    irr('cuire',     ['to cook'],                                'french', band='A2', difficulty=2),
    irr('ouvrir',    ['to open'],                                'french'),
    irr('offrir',    ['to offer'],                               'french'),
    irr('recevoir',  ['to receive'],                             'french', band='A2', difficulty=2),
    irr('mourir',    ['to die'],                                 'french'),
    irr('courir',    ['to run'],                                 'french'),
    irr('valoir',    ['to be worth'],                            'french', band='B1', difficulty=3),
    irr('falloir',   ['to be necessary', 'must (impersonal)'],   'french'),
    irr('pleuvoir',  ['to rain (impersonal)'],                   'french', band='A2', difficulty=2),
]

# ── ITALIAN ───────────────────────────────────────────────────────────────────

ITALIAN_FUNCTION_WORDS: List[dict] = [
    fw('il',    'article', ['the (masc. sing.)'],                'italian'),
    fw('lo',    'article', ['the (masc. before s+c, z)'],        'italian'),
    fw('la',    'article', ['the (fem. sing.)'],                 'italian'),
    fw('i',     'article', ['the (masc. pl.)'],                  'italian'),
    fw('gli',   'article', ['the (masc. pl. before vowel/z/s)'], 'italian'),
    fw('le',    'article', ['the (fem. pl.)'],                   'italian'),
    fw('un',    'article', ['a, an (masc.)'],                    'italian'),
    fw('una',   'article', ['a, an (fem.)'],                     'italian'),
    fw('uno',   'article', ['a, an (masc. before s+c, z)'],      'italian'),
    fw('di',    'preposition', ['of', 'from'],                   'italian'),
    fw('a',     'preposition', ['to', 'at'],                     'italian'),
    fw('da',    'preposition', ['from', 'by', 'since'],          'italian'),
    fw('in',    'preposition', ['in', 'to'],                     'italian'),
    fw('con',   'preposition', ['with'],                         'italian'),
    fw('su',    'preposition', ['on', 'about'],                  'italian'),
    fw('per',   'preposition', ['for', 'through', 'in order to'],'italian'),
    fw('tra',   'preposition', ['between', 'among'],             'italian'),
    fw('fra',   'preposition', ['between', 'among'],             'italian',
       notes='Interchangeable with "tra"'),
    fw('senza', 'preposition', ['without'],                      'italian'),
    fw('sotto', 'preposition', ['under', 'below'],               'italian'),
    fw('sopra', 'preposition', ['above', 'over'],                'italian'),
    fw('dopo',  'preposition', ['after'],                        'italian'),
    fw('verso', 'preposition', ['towards'],                      'italian'),
    fw('durante','preposition', ['during'],                      'italian'),
    fw('secondo','preposition', ['according to'],                'italian', band='B1', difficulty=3),
    fw('e',     'conjunction', ['and'],                          'italian'),
    fw('ed',    'conjunction', ['and (before vowel)'],           'italian'),
    fw('o',     'conjunction', ['or'],                           'italian'),
    fw('né',    'conjunction', ['nor', 'neither'],               'italian'),
    fw('ma',    'conjunction', ['but'],                          'italian'),
    fw('però',  'conjunction', ['but', 'however'],               'italian'),
    fw('che',   'conjunction', ['that', 'which', 'who'],         'italian'),
    fw('se',    'conjunction', ['if', 'whether'],                'italian'),
    fw('perché','conjunction', ['because', 'why'],               'italian'),
    fw('quando','conjunction', ['when'],                         'italian'),
    fw('come',  'conjunction', ['as', 'like', 'how'],            'italian'),
    fw('mentre','conjunction', ['while', 'whereas'],             'italian', band='A2', difficulty=2),
    fw('quindi','conjunction', ['therefore', 'so'],              'italian', band='A2', difficulty=2),
    fw('tuttavia','conjunction',['however', 'nevertheless'],     'italian', band='B1', difficulty=3),
    fw('io',    'pronoun', ['I'],                                'italian'),
    fw('tu',    'pronoun', ['you (informal sing.)'],             'italian'),
    fw('lui',   'pronoun', ['he'],                               'italian'),
    fw('lei',   'pronoun', ['she', 'you (formal)'],              'italian'),
    fw('noi',   'pronoun', ['we'],                               'italian'),
    fw('voi',   'pronoun', ['you (pl.)'],                        'italian'),
    fw('loro',  'pronoun', ['they', 'them'],                     'italian'),
    fw('mi',    'pronoun', ['me', 'myself', 'to me'],            'italian'),
    fw('ti',    'pronoun', ['you', 'yourself'],                  'italian'),
    fw('si',    'pronoun', ['himself', 'herself', 'themselves'], 'italian'),
    fw('ci',    'pronoun', ['us', 'ourselves', 'there', 'it'],   'italian'),
    fw('vi',    'pronoun', ['you (pl.)', 'yourselves', 'there'], 'italian'),
    fw('lo',    'pronoun', ['him', 'it (masc. obj.)'],           'italian'),
    fw('la',    'pronoun', ['her', 'it (fem. obj.)'],            'italian'),
    fw('li',    'pronoun', ['them (masc. obj.)'],                'italian'),
    fw('le',    'pronoun', ['them (fem. obj.)', 'to her'],       'italian'),
    fw('gli',   'pronoun', ['to him', 'to them'],                'italian'),
    fw('ne',    'pronoun', ['of it', 'of them', 'from there'],   'italian'),
    fw('mio',   'pronoun', ['my (masc.)'],                       'italian'),
    fw('mia',   'pronoun', ['my (fem.)'],                        'italian'),
    fw('tuo',   'pronoun', ['your (informal, masc.)'],           'italian'),
    fw('tua',   'pronoun', ['your (informal, fem.)'],            'italian'),
    fw('suo',   'pronoun', ['his', 'her', 'your (formal, masc.)'],'italian'),
    fw('sua',   'pronoun', ['his', 'her', 'your (formal, fem.)'],'italian'),
    fw('nostro','pronoun', ['our (masc.)'],                      'italian'),
    fw('nostra','pronoun', ['our (fem.)'],                       'italian'),
    fw('vostro','pronoun', ['your (pl., masc.)'],                'italian'),
    fw('vostra','pronoun', ['your (pl., fem.)'],                 'italian'),
    fw('loro',  'pronoun', ['their'],                            'italian'),
    fw('questo','pronoun', ['this (masc.)'],                     'italian'),
    fw('questa','pronoun', ['this (fem.)'],                      'italian'),
    fw('quello','pronoun', ['that (masc.)'],                     'italian'),
    fw('quella','pronoun', ['that (fem.)'],                      'italian'),
    fw('ciò',   'pronoun', ['this', 'that (neuter)'],            'italian'),
    fw('chi',     'pronoun', ['who'],                            'italian'),
    fw('che cosa','pronoun', ['what'],                           'italian'),
    fw('cosa',    'pronoun', ['what (informal)'],                'italian'),
    fw('quale',   'pronoun', ['which', 'what'],                  'italian'),
    fw('quanto',  'pronoun', ['how much (masc.)'],               'italian'),
    fw('quando',  'adverb',  ['when'],                           'italian'),
    fw('dove',    'adverb',  ['where'],                          'italian'),
    fw('come',    'adverb',  ['how', 'as'],                      'italian'),
    fw('perché',  'adverb',  ['why'],                            'italian'),
    fw('non',    'adverb', ['not', 'no'],                        'italian'),
    fw('sì',     'adverb', ['yes'],                              'italian'),
    fw('no',     'adverb', ['no'],                               'italian'),
    fw('molto',  'adverb', ['very', 'much', 'a lot'],            'italian'),
    fw('bene',   'adverb', ['well', 'good'],                     'italian'),
    fw('male',   'adverb', ['badly', 'bad'],                     'italian'),
    fw('più',    'adverb', ['more', 'no longer'],                'italian'),
    fw('meno',   'adverb', ['less'],                             'italian'),
    fw('anche',  'adverb', ['also', 'too', 'even'],              'italian'),
    fw('ancora', 'adverb', ['still', 'yet', 'again'],            'italian'),
    fw('già',    'adverb', ['already'],                          'italian'),
    fw('sempre', 'adverb', ['always'],                           'italian'),
    fw('mai',    'adverb', ['never', 'ever'],                    'italian'),
    fw('adesso', 'adverb', ['now'],                              'italian'),
    fw('oggi',   'adverb', ['today'],                            'italian'),
    fw('ieri',   'adverb', ['yesterday'],                        'italian'),
    fw('domani', 'adverb', ['tomorrow'],                         'italian'),
    fw('qui',    'adverb', ['here'],                             'italian'),
    fw('lì',     'adverb', ['there'],                            'italian'),
    fw('così',   'adverb', ['so', 'like this', 'thus'],          'italian'),
    fw('solo',   'adverb', ['only', 'just'],                     'italian'),
    fw('forse',  'adverb', ['maybe', 'perhaps'],                 'italian'),
    fw('presto', 'adverb', ['soon', 'early'],                    'italian'),
    fw('spesso', 'adverb', ['often'],                            'italian'),
    fw('vicino', 'adverb', ['near', 'close'],                    'italian'),
    fw('lontano','adverb', ['far'],                              'italian'),
    fw('dentro', 'adverb', ['inside'],                           'italian'),
    fw('fuori',  'adverb', ['outside'],                          'italian'),
    fw('insieme','adverb', ['together'],                         'italian'),
]

ITALIAN_IRREGULAR_VERBS: List[dict] = [
    irr('essere',   ['to be'],                                  'italian'),
    irr('avere',    ['to have'],                                 'italian'),
    irr('andare',   ['to go'],                                   'italian'),
    irr('fare',     ['to do', 'to make'],                        'italian'),
    irr('stare',    ['to stay', 'to be (state)'],                'italian'),
    irr('dare',     ['to give'],                                 'italian'),
    irr('sapere',   ['to know'],                                 'italian'),
    irr('potere',   ['to be able to', 'can'],                    'italian'),
    irr('volere',   ['to want'],                                 'italian'),
    irr('venire',   ['to come'],                                 'italian'),
    irr('dovere',   ['to have to', 'must'],                      'italian'),
    irr('tenere',   ['to hold', 'to keep'],                      'italian'),
    irr('porre',    ['to place', 'to put'],                      'italian', band='B1', difficulty=3),
    irr('scegliere',['to choose'],                               'italian', band='B1', difficulty=3),
    irr('leggere',  ['to read'],                                 'italian'),
    irr('scrivere', ['to write'],                                'italian'),
    irr('vincere',  ['to win'],                                  'italian'),
    irr('perdere',  ['to lose'],                                 'italian'),
    irr('chiudere', ['to close'],                                'italian'),
    irr('aprire',   ['to open'],                                 'italian'),
    irr('morire',   ['to die'],                                  'italian'),
    irr('uscire',   ['to go out', 'to exit'],                    'italian'),
    irr('dire',     ['to say', 'to tell'],                       'italian'),
    irr('bere',     ['to drink'],                                'italian'),
    irr('sedere',   ['to sit'],                                  'italian'),
    irr('cadere',   ['to fall'],                                 'italian'),
    irr('valere',   ['to be worth'],                             'italian', band='B1', difficulty=3),
    irr('piacere',  ['to like', 'to please'],                    'italian'),
    irr('nascere',  ['to be born'],                              'italian', band='A2', difficulty=2),
    irr('vivere',   ['to live'],                                 'italian'),
    irr('tradurre', ['to translate'],                            'italian', band='B1', difficulty=3),
    irr('condurre', ['to lead', 'to drive'],                     'italian', band='B1', difficulty=3),
    irr('rimanere', ['to stay', 'to remain'],                    'italian', band='A2', difficulty=2),
    irr('salire',   ['to go up', 'to climb'],                    'italian'),
    irr('sentire',  ['to feel', 'to hear'],                      'italian'),
    irr('dormire',  ['to sleep'],                                'italian'),
    irr('seguire',  ['to follow'],                               'italian', band='A2', difficulty=2),
]

# ── PORTUGUESE ────────────────────────────────────────────────────────────────

PORTUGUESE_FUNCTION_WORDS: List[dict] = [
    fw('o',    'article', ['the (masc. sing.)'],                 'portuguese'),
    fw('a',    'article', ['the (fem. sing.)'],                  'portuguese'),
    fw('os',   'article', ['the (masc. pl.)'],                   'portuguese'),
    fw('as',   'article', ['the (fem. pl.)'],                    'portuguese'),
    fw('um',   'article', ['a, an (masc.)'],                     'portuguese'),
    fw('uma',  'article', ['a, an (fem.)'],                      'portuguese'),
    fw('uns',  'article', ['some (masc. pl.)'],                  'portuguese'),
    fw('umas', 'article', ['some (fem. pl.)'],                   'portuguese'),
    fw('de',    'preposition', ['of', 'from'],                   'portuguese'),
    fw('a',     'preposition', ['to', 'at'],                     'portuguese'),
    fw('em',    'preposition', ['in', 'on', 'at'],               'portuguese'),
    fw('por',   'preposition', ['for', 'by', 'through'],         'portuguese'),
    fw('para',  'preposition', ['for', 'to', 'in order to'],     'portuguese'),
    fw('com',   'preposition', ['with'],                         'portuguese'),
    fw('sem',   'preposition', ['without'],                      'portuguese'),
    fw('sobre', 'preposition', ['about', 'over', 'on'],          'portuguese'),
    fw('entre', 'preposition', ['between', 'among'],             'portuguese'),
    fw('até',   'preposition', ['until', 'up to'],               'portuguese'),
    fw('desde', 'preposition', ['since', 'from'],                'portuguese'),
    fw('sob',   'preposition', ['under', 'beneath'],             'portuguese'),
    fw('após',  'preposition', ['after'],                        'portuguese', band='A2', difficulty=2),
    fw('durante','preposition',['during'],                       'portuguese'),
    fw('e',       'conjunction', ['and'],                        'portuguese'),
    fw('ou',      'conjunction', ['or'],                         'portuguese'),
    fw('nem',     'conjunction', ['nor', 'neither'],             'portuguese'),
    fw('mas',     'conjunction', ['but'],                        'portuguese'),
    fw('porém',   'conjunction', ['however', 'but'],             'portuguese', band='A2', difficulty=2),
    fw('que',     'conjunction', ['that', 'which', 'who'],       'portuguese'),
    fw('se',      'conjunction', ['if', 'whether'],              'portuguese'),
    fw('porque',  'conjunction', ['because'],                    'portuguese'),
    fw('pois',    'conjunction', ['because', 'since', 'so'],     'portuguese', band='A2', difficulty=2),
    fw('quando',  'conjunction', ['when'],                       'portuguese'),
    fw('embora',  'conjunction', ['although', 'even though'],    'portuguese', band='B1', difficulty=3),
    fw('portanto','conjunction', ['therefore', 'so'],            'portuguese', band='A2', difficulty=2),
    fw('contudo', 'conjunction', ['however', 'nonetheless'],     'portuguese', band='B1', difficulty=3),
    fw('eu',    'pronoun', ['I'],                                'portuguese'),
    fw('tu',    'pronoun', ['you (informal, European)'],         'portuguese'),
    fw('ele',   'pronoun', ['he'],                               'portuguese'),
    fw('ela',   'pronoun', ['she'],                              'portuguese'),
    fw('nós',   'pronoun', ['we'],                               'portuguese'),
    fw('eles',  'pronoun', ['they (masc. / mixed)'],             'portuguese'),
    fw('elas',  'pronoun', ['they (fem.)'],                      'portuguese'),
    fw('você',  'pronoun', ['you (Brazilian informal)'],         'portuguese'),
    fw('vocês', 'pronoun', ['you all (Brazilian)'],              'portuguese'),
    fw('me',    'pronoun', ['me', 'myself'],                     'portuguese'),
    fw('te',    'pronoun', ['you', 'yourself'],                  'portuguese'),
    fw('se',    'pronoun', ['himself', 'herself', 'themselves'], 'portuguese'),
    fw('nos',   'pronoun', ['us', 'ourselves'],                  'portuguese'),
    fw('lhe',   'pronoun', ['to him', 'to her', 'to you'],       'portuguese'),
    fw('lhes',  'pronoun', ['to them'],                          'portuguese'),
    fw('meu',   'pronoun', ['my (masc.)'],                       'portuguese'),
    fw('minha', 'pronoun', ['my (fem.)'],                        'portuguese'),
    fw('teu',   'pronoun', ['your (informal, masc.)'],           'portuguese'),
    fw('tua',   'pronoun', ['your (informal, fem.)'],            'portuguese'),
    fw('seu',   'pronoun', ['his', 'her', 'your (masc.)'],       'portuguese'),
    fw('sua',   'pronoun', ['his', 'her', 'your (fem.)'],        'portuguese'),
    fw('nosso', 'pronoun', ['our (masc.)'],                      'portuguese'),
    fw('nossa', 'pronoun', ['our (fem.)'],                       'portuguese'),
    fw('este',  'pronoun', ['this (masc.)'],                     'portuguese'),
    fw('esta',  'pronoun', ['this (fem.)'],                      'portuguese'),
    fw('esse',  'pronoun', ['that (masc., near listener)'],      'portuguese'),
    fw('essa',  'pronoun', ['that (fem., near listener)'],       'portuguese'),
    fw('aquele','pronoun', ['that (masc., far)'],                'portuguese'),
    fw('aquela','pronoun', ['that (fem., far)'],                 'portuguese'),
    fw('isto',  'pronoun', ['this (neuter)'],                    'portuguese'),
    fw('isso',  'pronoun', ['that (neuter, near listener)'],     'portuguese'),
    fw('aquilo','pronoun', ['that (neuter, far)'],               'portuguese'),
    fw('quem',  'pronoun', ['who'],                              'portuguese'),
    fw('que',   'pronoun', ['what', 'which'],                    'portuguese'),
    fw('qual',  'pronoun', ['which', 'what'],                    'portuguese'),
    fw('quanto','pronoun', ['how much (masc.)'],                 'portuguese'),
    fw('quando','adverb',  ['when'],                             'portuguese'),
    fw('onde',  'adverb',  ['where'],                            'portuguese'),
    fw('como',  'adverb',  ['how', 'as'],                        'portuguese'),
    fw('não',    'adverb', ['no', 'not'],                        'portuguese'),
    fw('sim',    'adverb', ['yes'],                              'portuguese'),
    fw('muito',  'adverb', ['very', 'much', 'a lot'],            'portuguese'),
    fw('bem',    'adverb', ['well', 'good'],                     'portuguese'),
    fw('mal',    'adverb', ['badly'],                            'portuguese'),
    fw('mais',   'adverb', ['more'],                             'portuguese'),
    fw('menos',  'adverb', ['less'],                             'portuguese'),
    fw('também', 'adverb', ['also', 'too'],                      'portuguese'),
    fw('já',     'adverb', ['already', 'now', 'soon'],           'portuguese'),
    fw('ainda',  'adverb', ['still', 'yet', 'even'],             'portuguese'),
    fw('sempre', 'adverb', ['always'],                           'portuguese'),
    fw('nunca',  'adverb', ['never'],                            'portuguese'),
    fw('agora',  'adverb', ['now'],                              'portuguese'),
    fw('hoje',   'adverb', ['today'],                            'portuguese'),
    fw('ontem',  'adverb', ['yesterday'],                        'portuguese'),
    fw('amanhã', 'adverb', ['tomorrow'],                         'portuguese'),
    fw('aqui',   'adverb', ['here'],                             'portuguese'),
    fw('ali',    'adverb', ['there'],                            'portuguese'),
    fw('lá',     'adverb', ['there', 'over there'],              'portuguese'),
    fw('assim',  'adverb', ['like this', 'so', 'thus'],          'portuguese'),
    fw('tão',    'adverb', ['so', 'as (comparisons)'],           'portuguese'),
    fw('só',     'adverb', ['only', 'just'],                     'portuguese'),
    fw('talvez', 'adverb', ['maybe', 'perhaps'],                 'portuguese', band='A2', difficulty=2),
    fw('antes',  'adverb', ['before', 'earlier'],                'portuguese'),
    fw('depois', 'adverb', ['after', 'later'],                   'portuguese'),
    fw('então',  'adverb', ['then', 'so'],                       'portuguese'),
    fw('logo',   'adverb', ['soon', 'therefore'],                'portuguese'),
    fw('perto',  'adverb', ['near', 'close'],                    'portuguese'),
    fw('longe',  'adverb', ['far'],                              'portuguese'),
    fw('dentro', 'adverb', ['inside'],                           'portuguese'),
    fw('fora',   'adverb', ['outside'],                          'portuguese'),
]

PORTUGUESE_IRREGULAR_VERBS: List[dict] = [
    irr('ser',       ['to be (permanent)'],                      'portuguese'),
    irr('estar',     ['to be (state / location)'],               'portuguese'),
    irr('ir',        ['to go'],                                  'portuguese'),
    irr('ter',       ['to have'],                                'portuguese'),
    irr('haver',     ['to have (auxiliary)', 'there is/are'],    'portuguese'),
    irr('fazer',     ['to do', 'to make'],                       'portuguese'),
    irr('poder',     ['to be able to', 'can'],                   'portuguese'),
    irr('querer',    ['to want'],                                'portuguese'),
    irr('saber',     ['to know'],                                'portuguese'),
    irr('vir',       ['to come'],                                'portuguese'),
    irr('dizer',     ['to say', 'to tell'],                      'portuguese'),
    irr('ver',       ['to see'],                                 'portuguese'),
    irr('dar',       ['to give'],                                'portuguese'),
    irr('pôr',       ['to put', 'to place'],                     'portuguese'),
    irr('trazer',    ['to bring'],                               'portuguese'),
    irr('sair',      ['to leave', 'to go out'],                  'portuguese'),
    irr('conhecer',  ['to know (people/places)'],                'portuguese'),
    irr('ouvir',     ['to hear'],                                'portuguese'),
    irr('caber',     ['to fit (inside)'],                        'portuguese', band='B1', difficulty=3),
    irr('valer',     ['to be worth'],                            'portuguese', band='B1', difficulty=3),
    irr('cair',      ['to fall'],                                'portuguese'),
    irr('rir',       ['to laugh'],                               'portuguese'),
    irr('dormir',    ['to sleep'],                               'portuguese'),
    irr('seguir',    ['to follow', 'to continue'],               'portuguese'),
    irr('pedir',     ['to ask for'],                             'portuguese'),
    irr('sentir',    ['to feel'],                                'portuguese'),
    irr('perder',    ['to lose'],                                'portuguese'),
    irr('ler',       ['to read'],                                'portuguese'),
    irr('escrever',  ['to write'],                               'portuguese'),
    irr('traduzir',  ['to translate'],                           'portuguese', band='B1', difficulty=3),
    irr('construir', ['to build'],                               'portuguese', band='B1', difficulty=3),
    irr('incluir',   ['to include'],                             'portuguese', band='B1', difficulty=3),
    irr('conseguir', ['to get', 'to achieve'],                   'portuguese', band='A2', difficulty=2),
]


# ══════════════════════════════════════════════════════════════════════════════
# LANGUAGE REGISTRY
# ══════════════════════════════════════════════════════════════════════════════

LANGUAGE_DATA: Dict[str, dict] = {
    'spa': {
        'name':            'spanish',
        'function_words':  SPANISH_FUNCTION_WORDS,
        'irregular_verbs': SPANISH_IRREGULAR_VERBS,
    },
    'fra': {
        'name':            'french',
        'function_words':  FRENCH_FUNCTION_WORDS,
        'irregular_verbs': FRENCH_IRREGULAR_VERBS,
    },
    'ita': {
        'name':            'italian',
        'function_words':  ITALIAN_FUNCTION_WORDS,
        'irregular_verbs': ITALIAN_IRREGULAR_VERBS,
    },
    'por': {
        'name':            'portuguese',
        'function_words':  PORTUGUESE_FUNCTION_WORDS,
        'irregular_verbs': PORTUGUESE_IRREGULAR_VERBS,
    },
}


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
                         lang_code: str, nlp) -> List[dict]:
    """Lemmatise, deduplicate, filter to open-class POS, return corpus entries."""
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

    entries = []
    for rank_clean, (lemma, data) in enumerate(sorted_items, start=1):
        entries.append(corpus_entry(
            word=lemma,
            pos_group=data['_pos_group'],
            rank_clean=rank_clean,
            corpus_count=data['_count'],
            lang_code=lang_code,
        ))
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

def main(langs: List[str], n: int) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    print(f"Corpus dir : {CORPUS_DIR}")
    print(f"Output dir : {OUTPUT_DIR}")
    print(f"Languages  : {', '.join(langs)}")
    print(f"Corpus top : {n:,} tokens per language\n")

    for lang in langs:
        data = LANGUAGE_DATA.get(lang)
        if not data:
            print(f"[{lang}] No hardcoded data registered — skipping.\n")
            continue

        print(f"── {lang} {'─' * 50}")

        # 1. Hardcoded entries — always included
        fn_words  = data['function_words']
        irr_verbs = data['irregular_verbs']

        # 2. Fill conjugations for irregular verbs via mlconjug3
        conj_count = 0
        if MLCONJUG3_AVAILABLE:
            print(f"  Conjugating {len(irr_verbs)} irregular verbs via mlconjug3 ...")
            for entry in irr_verbs:
                inf  = entry['linguistic']['infinitive']
                conj = build_conjugations(inf, lang)
                if conj:
                    entry['linguistic']['conjugations'] = conj
                    conj_count += 1
            print(f"  Conjugations generated: {conj_count} / {len(irr_verbs)}")
        else:
            print(f"  mlconjug3 not available — irregular verbs written without conjugations.")

        hardcoded_entries = fn_words + irr_verbs
        print(f"  Hardcoded : {len(fn_words)} function words + {len(irr_verbs)} irregular verbs"
              f" = {len(hardcoded_entries)} total")

        # 3. Corpus entries — open-class words only, top N
        corpus_entries_out: List[dict] = []
        if SPACY_AVAILABLE and n > 0:
            if not ensure_spacy_model(lang):
                print(f"  Corpus skipped: spaCy model unavailable for '{lang}'.")
            else:
                try:
                    nlp = spacy.load(SPACY_MODELS[lang])
                except OSError as e:
                    print(f"  Corpus skipped: {e}")
                    nlp = None

                if nlp:
                    corpus_dir = find_corpus_dir(lang)
                    if not corpus_dir:
                        print(f"  Corpus skipped: no folder for '{lang}' in {CORPUS_DIR}")
                    else:
                        try:
                            words_file = find_words_file(corpus_dir, lang)
                            print(f"  Corpus src : {words_file}")
                            rows = read_top_n(words_file, n)
                            print(f"  Tokens read: {len(rows):,}")
                            corpus_entries_out = build_corpus_entries(rows, lang, nlp)
                            print(f"  Corpus     : {len(corpus_entries_out):,} entries after filtering")
                        except FileNotFoundError as e:
                            print(f"  Corpus skipped: {e}")
        elif n == 0:
            print(f"  Corpus skipped: --n 0 specified.")
        else:
            print(f"  Corpus skipped: spaCy not installed.")

        # 4. Combine and write
        all_entries = hardcoded_entries + corpus_entries_out
        outpath     = OUTPUT_DIR / f'wikicorpus_{lang}.jsonl'
        write_jsonl(outpath, all_entries)
        print(f"  Output     : {len(all_entries)} entries → {outpath}\n")

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
        help='Max corpus tokens to read per language before filtering '
             '(0 = hardcoded only, default: 10000)',
    )
    args = parser.parse_args()
    main(args.langs, args.n)
