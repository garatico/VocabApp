"""
register_data.py — Register tagging for VocabApp pipeline
==========================================================
Provides get_register(word, lang) for use during corpus enrichment.

The pipeline default is 'neutral'. This module only lists words that are
*distinctly* marked — colloquial slang, regional usage, or formal/literary
vocabulary. If a word isn't listed, 'neutral' is the correct default.

Register levels (matching the DB schema):
  'formal'      — literary, bureaucratic, or very elevated register
  'neutral'     — standard everyday Spanish (default; not stored here)
  'informal'    — casual / familiar but broadly understood
  'colloquial'  — slang, strongly regional, or sub-standard

Currently supports: 'spa' (Spanish)
"""

from typing import Optional

# ══════════════════════════════════════════════════════════════════════════════
# WORD → REGISTER  (only non-neutral words are listed)
# ══════════════════════════════════════════════════════════════════════════════

WORD_REGISTER: dict[str, dict[str, str]] = {

    'spa': {

        # ── Colloquial ────────────────────────────────────────────────────────
        # Spain slang
        'molar':      'colloquial',   # to be cool / great (Spain)
        'guay':       'colloquial',   # cool, great (Spain)
        'pillar':     'colloquial',   # to catch / understand (Spain)
        'curro':      'colloquial',   # job / work (Spain)
        'pasta':      'colloquial',   # money (Spain)
        'guita':      'colloquial',   # money (Spain/Argentina)
        'chaval':     'colloquial',   # kid / young person (Spain)
        'tío':        'colloquial',   # dude / guy (Spain; neutral sense = uncle)
        'tía':        'colloquial',   # girl / woman (Spain; neutral sense = aunt)
        'apañarse':   'colloquial',   # to manage / make do (Spain)
        'gorronear':  'colloquial',   # to sponge off / freeload
        'chao':       'colloquial',   # bye (from Italian ciao)
        'flipar':     'colloquial',   # to freak out / be amazed (Spain)
        'ligar':      'colloquial',   # to flirt / hook up (Spain)
        'mola':       'colloquial',   # it's cool (conjugated form, but appears standalone)

        # Latin American slang
        'platicar':   'colloquial',   # to chat (Mexico/Central America)
        'laburo':     'colloquial',   # job / work (Argentina/Uruguay)
        'mina':       'colloquial',   # woman / girl (Argentina)
        'pibe':       'colloquial',   # kid / guy (Argentina)
        'cacharro':   'colloquial',   # old car / junk (Latin America)
        'órale':      'colloquial',   # ok / right on (Mexico)
        'chido':      'colloquial',   # cool / great (Mexico)
        'chela':      'colloquial',   # beer (Mexico/Central America)
        'jalar':      'colloquial',   # to pull / to work (Mexico)
        'ahorita':    'colloquial',   # right now / in a moment (Mexico; ambiguous timing)
        'wey':        'colloquial',   # dude / guy (Mexico)
        'güey':       'colloquial',   # dude / guy (Mexico, alt. spelling)
        'vaina':      'colloquial',   # thing / stuff (Colombia/Venezuela)
        'bacano':     'colloquial',   # cool / great (Colombia)
        'chévere':    'colloquial',   # cool / great (Venezuela/Colombia)
        'chompa':     'colloquial',   # sweater (Peru/Ecuador)
        'macanudo':   'colloquial',   # great / fine (Argentina)

        # Broadly colloquial
        'zampar':     'colloquial',   # to gobble / eat fast
        'papear':     'colloquial',   # to eat (Latin America)
        'bicho':      'colloquial',   # bug / creature; kid (Puerto Rico)

        # ── Informal ──────────────────────────────────────────────────────────
        'charlar':    'informal',     # to chat
        'compa':      'informal',     # pal / buddy (short for compañero)
        'chico':      'informal',     # kid / boy (can also be neutral adjective)
        'celular':    'informal',     # mobile phone (Latin America)
        'móvil':      'informal',     # mobile phone (Spain)
        'carro':      'informal',     # car (Latin America; neutral in those regions)
        'lío':        'informal',     # mess / problem / fuss
        'rollo':      'informal',     # bore / hassle / thing (Spain)
        'mogollón':   'informal',     # loads / tons of (Spain)
        'madrugada':  'informal',     # early morning hours (actually neutral—remove if disputed)
        'chiste':     'informal',     # joke (borderline neutral; very common)
        'broma':      'informal',     # joke / prank

        # ── Formal ────────────────────────────────────────────────────────────
        'dialogar':   'formal',       # to dialogue / hold talks
        'desconocer': 'formal',       # to be unaware of / not know
        'solicitar':  'formal',       # to request / apply for
        'adquirir':   'formal',       # to acquire / obtain
        'vivienda':   'formal',       # dwelling / housing
        'automóvil':  'formal',       # automobile
        'fallecer':   'formal',       # to pass away / die
        'defunción':  'formal',       # death / decease (administrative)
        'óbito':      'formal',       # death (literary/legal)
        'percatarse': 'formal',       # to become aware of / to notice
        'efectuar':   'formal',       # to carry out / execute
        'proceder':   'formal',       # to proceed
        'manifestar': 'formal',       # to state / express (formal declaration)
        'denominar':  'formal',       # to name / denominate
        'constituir': 'formal',       # to constitute / make up
        'mediante':   'formal',       # by means of / through (preposition)
        'asimismo':   'formal',       # likewise / also (written register)
        'asimismo':   'formal',
        'sin embargo':'formal',       # however / nevertheless
        'no obstante':'formal',       # nevertheless / notwithstanding
        'a pesar de': 'formal',       # despite
        'por tanto':  'formal',       # therefore
        'en cuanto a':'formal',       # as regards / regarding
        'cabe señalar':'formal',      # it should be noted
        'expirar':    'formal',       # to expire / die
        'perecer':    'formal',       # to perish
        'sucumbir':   'formal',       # to succumb
        'fenecer':    'formal',       # to die / end (literary)
        'acaecer':    'formal',       # to happen / occur (literary)
        'acontecer':  'formal',       # to happen (literary/formal)
        'suscitar':   'formal',       # to give rise to / provoke
        'propiciar':  'formal',       # to bring about / foster
        'coadyuvar':  'formal',       # to contribute to (bureaucratic)
        'dilucidar':  'formal',       # to elucidate / clarify
        'infante':    'formal',       # infant / young child (formal/historical)
        'caballero':  'formal',       # gentleman (formally addressing a man)
    },
}

# ══════════════════════════════════════════════════════════════════════════════
# PUBLIC API
# ══════════════════════════════════════════════════════════════════════════════

def get_register(word: str, lang: str) -> Optional[str]:
    """
    Return the register level for `word` in `lang` (3-letter code, e.g. 'spa').

    Returns one of 'formal', 'informal', 'colloquial', or None.
    None means the word is neutral (the pipeline default) — don't overwrite.
    """
    if not word or not lang:
        return None
    return WORD_REGISTER.get(lang, {}).get(word.lower())
