"""
ipa_data.py — IPA pronunciation data for VocabApp pipeline
===========================================================
Provides get_ipa(word, lang) for use during corpus enrichment.

Resolution order:
  1. Hand-curated lookup table (exact match, most reliable)
  2. Phonetic rule-based generation (approximate, better than nothing)
  3. None  — caller should leave the ipa field empty

Currently supports: 'spa' (Spanish)
To add a language: add entries to IPA_LOOKUP and PHONETIC_RULES below.
"""

import re
from typing import Optional

# ══════════════════════════════════════════════════════════════════════════════
# HAND-CURATED LOOKUP TABLES
# ══════════════════════════════════════════════════════════════════════════════

IPA_LOOKUP: dict[str, dict[str, str]] = {

    'spa': {
        # Articles
        'el':    '[el]',
        'la':    '[la]',
        'los':   '[los]',
        'las':   '[las]',
        'un':    '[un]',
        'una':   '[ˈu.na]',
        'unos':  '[ˈu.nos]',
        'unas':  '[ˈu.nas]',

        # Prepositions
        'de':       '[de]',
        'en':       '[en]',
        'a':        '[a]',
        'por':      '[por]',
        'para':     '[ˈpa.ra]',
        'con':      '[kon]',
        'sin':      '[sin]',
        'desde':    '[ˈdes.de]',
        'hasta':    '[ˈas.ta]',
        'entre':    '[ˈen.tre]',
        'según':    '[seˈɣun]',
        'durante':  '[duˈɾan.te]',
        'mediante': '[meˈðjan.te]',
        'sobre':    '[ˈso.βɾe]',
        'bajo':     '[ˈba.xo]',
        'ante':     '[ˈan.te]',
        'tras':     '[tɾas]',
        'hacia':    '[ˈa.θja]',

        # Conjunctions / particles
        'y':        '[i]',
        'o':        '[o]',
        'pero':     '[ˈpe.ɾo]',
        'que':      '[ke]',
        'si':       '[si]',
        'no':       '[no]',
        'ni':       '[ni]',
        'aunque':   '[ˈawn.ke]',
        'como':     '[ˈko.mo]',
        'cuando':   '[ˈkwan.do]',
        'porque':   '[ˈpoɾ.ke]',

        # Pronouns
        'yo':       '[ʝo]',
        'tú':       '[tu]',
        'él':       '[el]',
        'ella':     '[ˈe.ʎa]',
        'nosotros': '[noˈso.tɾos]',
        'vosotros': '[boˈso.tɾos]',
        'ellos':    '[ˈe.ʎos]',
        'ellas':    '[ˈe.ʎas]',
        'usted':    '[usˈteð]',
        'ustedes':  '[usˈte.ðes]',
        'me':       '[me]',
        'te':       '[te]',
        'se':       '[se]',
        'nos':      '[nos]',
        'le':       '[le]',
        'les':      '[les]',
        'lo':       '[lo]',
        'la':       '[la]',

        # Common irregular verbs
        'ser':       '[seɾ]',
        'estar':     '[esˈtaɾ]',
        'haber':     '[aˈβeɾ]',
        'tener':     '[teˈneɾ]',
        'hacer':     '[aˈθeɾ]',
        'ir':        '[iɾ]',
        'poder':     '[poˈðeɾ]',
        'decir':     '[deˈθiɾ]',
        'dar':       '[daɾ]',
        'saber':     '[saˈβeɾ]',
        'querer':    '[keˈɾeɾ]',
        'deber':     '[deˈβeɾ]',
        'poner':     '[poˈneɾ]',
        'parecer':   '[paˈɾeθeɾ]',
        'dejar':     '[deˈxaɾ]',
        'seguir':    '[seˈɣiɾ]',
        'encontrar': '[enkonˈtɾaɾ]',
        'llamar':    '[ʎaˈmaɾ]',
        'venir':     '[beˈniɾ]',
        'pensar':    '[penˈsaɾ]',
        'salir':     '[saˈliɾ]',
        'volver':    '[bolˈbeɾ]',
        'tomar':     '[toˈmaɾ]',
        'conocer':   '[konoˈθeɾ]',
        'vivir':     '[biˈβiɾ]',
        'sentir':    '[senˈtiɾ]',
        'tratar':    '[tɾaˈtaɾ]',
        'mirar':     '[miˈɾaɾ]',
        'contar':    '[konˈtaɾ]',
        'empezar':   '[empeˈθaɾ]',
        'esperar':   '[espeˈɾaɾ]',
        'buscar':    '[busˈkaɾ]',
        'existir':   '[ekˈsis.tiɾ]',
        'entrar':    '[enˈtɾaɾ]',
        'trabajar':  '[tɾaˈβa.xaɾ]',
        'escribir':  '[eskɾiˈβiɾ]',
        'perder':    '[peɾˈðeɾ]',
        'producir':  '[pɾoðuˈθiɾ]',
        'ocurrir':   '[okuˈɾiɾ]',
        'entender':  '[entenˈdeɾ]',
        'pedir':     '[peˈðiɾ]',
        'recibir':   '[reθiˈβiɾ]',
        'recordar':  '[ɾekoɾˈðaɾ]',
        'terminar':  '[teɾmiˈnaɾ]',
        'considerar':'[konsiðeˈɾaɾ]',
        'servir':    '[seɾˈβiɾ]',
        'sacar':     '[saˈkaɾ]',
        'necesitar': '[neθesiˈtaɾ]',
        'mantener':  '[manteˈneɾ]',
        'resultar':  '[ɾesulˈtaɾ]',
        'leer':      '[leˈeɾ]',
        'caer':      '[kaˈeɾ]',
        'cambiar':   '[kamˈbjaɾ]',
        'llevar':    '[ʎeˈβaɾ]',
        'crear':     '[kɾeˈaɾ]',
        'abrir':     '[aˈβɾiɾ]',
        'comenzar':  '[koˈmenˈθaɾ]',
        'aumentar':  '[awˈmen.taɾ]',
        'hablar':    '[aˈβlaɾ]',
        'pasar':     '[paˈsaɾ]',
        'quedar':    '[keˈðaɾ]',
        'creer':     '[kɾeˈeɾ]',
        'llevar':    '[ʎeˈβaɾ]',
        'aparecer':  '[apaˈɾeθeɾ]',
        'conseguir': '[konseˈɣiɾ]',
        'mostrar':   '[mosˈtɾaɾ]',
        'permitir':  '[peɾmiˈtiɾ]',
        'convertir': '[kombeɾˈtiɾ]',

        # Common nouns
        'hombre':    '[ˈom.bɾe]',
        'mujer':     '[muˈxeɾ]',
        'niño':      '[ˈni.ɲo]',
        'niña':      '[ˈni.ɲa]',
        'día':       '[ˈdi.a]',
        'año':       '[ˈa.ɲo]',
        'tiempo':    '[ˈtjem.po]',
        'parte':     '[ˈpaɾ.te]',
        'caso':      '[ˈka.so]',
        'forma':     '[ˈfoɾ.ma]',
        'vida':      '[ˈbi.ða]',
        'mano':      '[ˈma.no]',
        'lugar':     '[luˈɣaɾ]',
        'momento':   '[moˈmen.to]',
        'mes':       '[mes]',
        'semana':    '[seˈma.na]',
        'hora':      '[ˈo.ɾa]',
        'minuto':    '[miˈnu.to]',
        'segundo':   '[seˈɣun.do]',
        'palabra':   '[paˈla.βɾa]',
        'ejemplo':   '[eˈxem.plo]',
        'razón':     '[ɾaˈθon]',
        'lado':      '[ˈla.ðo]',
        'fuerza':    '[ˈfweɾ.θa]',
        'muerte':    '[ˈmweɾ.te]',
        'guerra':    '[ˈɡe.ɾa]',
        'problema':  '[pɾoˈβle.ma]',
        'empresa':   '[emˈpɾe.sa]',
        'dinero':    '[diˈne.ɾo]',
        'precio':    '[ˈpɾe.θjo]',
        'producto':  '[pɾoˈðuk.to]',
        'resultado': '[ɾesulˈta.ðo]',
        'tipo':      '[ˈti.po]',
        'nivel':     '[niˈβel]',
        'mesa':      '[ˈme.sa]',
        'puerta':    '[ˈpweɾ.ta]',
        'ventana':   '[benˈta.na]',
        'calle':     '[ˈka.ʎe]',
        'ciudad':    '[θjuˈðað]',
        'país':      '[paˈis]',
        'pueblo':    '[ˈpwe.βlo]',
        'casa':      '[ˈka.sa]',
        'agua':      '[ˈa.ɣwa]',
        'fuego':     '[ˈfwe.ɣo]',
        'aire':      '[ˈa.i.ɾe]',
        'tierra':    '[ˈtje.ɾa]',
        'árbol':     '[ˈaɾ.bol]',
        'flor':      '[floɾ]',
        'sol':       '[sol]',
        'luna':      '[ˈlu.na]',
        'estrella':  '[esˈtɾe.ʎa]',
        'mundo':     '[ˈmun.do]',
        'gente':     '[ˈxen.te]',
        'gobierno':  '[ɡoˈbjeɾ.no]',
        'historia':  '[isˈto.ɾja]',
        'número':    '[ˈnu.me.ɾo]',
        'nombre':    '[ˈnom.bɾe]',
        'grupo':     '[ˈɡɾu.po]',
        'sistema':   '[sisˈte.ma]',
        'país':      '[paˈis]',
        'familia':   '[faˈmi.lja]',
        'trabajo':   '[tɾaˈβa.xo]',
        'persona':   '[peɾˈso.na]',

        # Common adjectives
        'grande':      '[ˈɡɾan.de]',
        'pequeño':     '[peˈke.ɲo]',
        'bueno':       '[ˈbwe.no]',
        'malo':        '[ˈma.lo]',
        'nuevo':       '[ˈnwe.βo]',
        'viejo':       '[ˈbje.xo]',
        'largo':       '[ˈlaɾ.ɣo]',
        'corto':       '[ˈkoɾ.to]',
        'alto':        '[ˈal.to]',
        'bajo':        '[ˈba.xo]',
        'fuerte':      '[ˈfweɾ.te]',
        'débil':       '[ˈde.βil]',
        'fácil':       '[ˈfa.θil]',
        'difícil':     '[diˈfi.θil]',
        'rápido':      '[ˈɾa.pi.ðo]',
        'lento':       '[ˈlen.to]',
        'oscuro':      '[osˈku.ɾo]',
        'claro':       '[ˈkla.ɾo]',
        'blanco':      '[ˈblan.ko]',
        'negro':       '[ˈne.ɣɾo]',
        'rojo':        '[ˈɾo.xo]',
        'azul':        '[aˈθul]',
        'verde':       '[ˈbeɾ.de]',
        'amarillo':    '[amaˈɾi.ʎo]',
        'gris':        '[ɡɾis]',
        'importante':  '[impoɾˈtan.te]',
        'diferente':   '[difeˈɾen.te]',
        'mismo':       '[ˈmis.mo]',
        'propio':      '[ˈpɾo.pjo]',
        'único':       '[ˈu.ni.ko]',
        'general':     '[xeneˈɾal]',
        'público':     '[ˈpu.βli.ko]',
        'social':      '[soˈθjal]',
        'político':    '[poˈli.ti.ko]',
        'económico':   '[ekoˈno.mi.ko]',

        # Numbers
        'uno':    '[ˈu.no]',
        'dos':    '[dos]',
        'tres':   '[tɾes]',
        'cuatro': '[ˈkwa.tɾo]',
        'cinco':  '[ˈθin.ko]',
        'seis':   '[sejs]',
        'siete':  '[ˈsje.te]',
        'ocho':   '[ˈo.tʃo]',
        'nueve':  '[ˈnwe.βe]',
        'diez':   '[ˈdjes]',
        'cien':   '[θjen]',
        'mil':    '[mil]',

        # Common adverbs
        'aquí':      '[aˈki]',
        'allá':      '[aˈʎa]',
        'allí':      '[aˈʎi]',
        'ahora':     '[aˈo.ɾa]',
        'entonces':  '[enˈton.θes]',
        'todavía':   '[toðaˈβi.a]',
        'ya':        '[ja]',
        'siempre':   '[ˈsjem.pɾe]',
        'nunca':     '[ˈnun.ka]',
        'jamás':     '[xaˈmas]',
        'solo':      '[ˈso.lo]',
        'también':   '[tamˈbjen]',
        'tampoco':   '[tamˈpo.ko]',
        'bien':      '[bjen]',
        'mal':       '[mal]',
        'mejor':     '[meˈxoɾ]',
        'peor':      '[peˈoɾ]',
        'más':       '[mas]',
        'menos':     '[ˈme.nos]',
        'mucho':     '[ˈmu.tʃo]',
        'poco':      '[ˈpo.ko]',
        'muy':       '[muj]',
        'bastante':  '[basˈtan.te]',
        'casi':      '[ˈka.si]',
        'apenas':    '[aˈpe.nas]',
        'quizás':    '[kiˈθas]',
        'tal vez':   '[tal ˈbeθ]',
    },
}

# ══════════════════════════════════════════════════════════════════════════════
# PHONETIC RULES  (applied in order for words not in the lookup table)
# ══════════════════════════════════════════════════════════════════════════════

# Each rule: (compiled_regex, replacement_string)
# Applied sequentially — order matters.

_SPA_RULES = [
    # Multi-char sequences first to avoid partial matches
    (re.compile(r'll'),             'ʎ'),    # ll → palatal lateral
    (re.compile(r'rr'),             'r'),    # rr → trill (use plain r as approximation)
    (re.compile(r'ñ'),              'ɲ'),    # ñ → palatal nasal
    (re.compile(r'ch'),             'tʃ'),   # ch → affricate
    (re.compile(r'qu(?=[ei])'),     'k'),    # qu + e/i → k
    (re.compile(r'gu(?=[ei])'),     'ɡ'),    # gu + e/i → ɡ (silent u)
    (re.compile(r'c(?=[ei])'),      'θ'),    # c + e/i → θ (Castilian)
    (re.compile(r'c'),              'k'),    # c elsewhere → k
    (re.compile(r'z'),              'θ'),    # z → θ (Castilian)
    (re.compile(r'g(?=[ei])'),      'x'),    # g + e/i → x
    (re.compile(r'j'),              'x'),    # j → x
    (re.compile(r'h'),              ''),     # h is silent
    (re.compile(r'v'),              'β'),    # v → β (same as b in Spanish)
    (re.compile(r'b'),              'β'),    # b → β
    (re.compile(r'd(?=[aeiouβɣ])'), 'ð'),   # d between vowels → ð
    (re.compile(r'd$'),             'ð'),    # final d → ð
    (re.compile(r'g'),              'ɡ'),    # g elsewhere → ɡ
    (re.compile(r'r(?=[aeiouβɣðɡ])'), 'ɾ'), # r between vowels → tap
    # Accented vowels → plain IPA vowels (accent is handled by stress marking)
    (re.compile(r'á'),              'a'),
    (re.compile(r'é'),              'e'),
    (re.compile(r'í'),              'i'),
    (re.compile(r'ó'),              'o'),
    (re.compile(r'ú'),              'u'),
    (re.compile(r'ü'),              'w'),
    # Diphthongs
    (re.compile(r'ie'),             'je'),
    (re.compile(r'ue'),             'we'),
    (re.compile(r'ia'),             'ja'),
    (re.compile(r'ua'),             'wa'),
]

PHONETIC_RULES: dict[str, list] = {
    'spa': _SPA_RULES,
}

VOWELS = set('aeiouáéíóúü')


def _has_written_accent(word: str) -> bool:
    return bool(re.search(r'[áéíóúü]', word))


def _syllabify(ipa: str) -> list[str]:
    """
    Very rough syllabification: split before each vowel cluster.
    Good enough for placing a stress marker; not linguistically precise.
    """
    return re.split(r'(?=[aeiou])', ipa)


def _add_stress(word_original: str, ipa: str) -> str:
    """
    Add a stress marker (ˈ) following standard Spanish stress rules:
      - If the word has a written accent, the accent already marks stress;
        we skip (the IPA doesn't encode the exact position here).
      - If the word ends in a vowel, -n, or -s: stress the penultimate syllable.
      - Otherwise: stress the final syllable.
    """
    if _has_written_accent(word_original):
        # The phonetic rules stripped accents from the IPA string;
        # we can't easily re-place the marker without full syllabification,
        # so just return without a marker — still readable.
        return ipa

    syllables = _syllabify(ipa)
    if len(syllables) <= 1:
        return ipa

    # Spanish default stress rule
    ends_in_vowel_n_s = bool(re.search(r'[aeiou]$|[ns]$', word_original.lower()))
    stress_idx = len(syllables) - 2 if ends_in_vowel_n_s else len(syllables) - 1
    stress_idx = max(0, stress_idx)

    if not syllables[stress_idx].startswith('ˈ'):
        syllables[stress_idx] = 'ˈ' + syllables[stress_idx]

    return ''.join(syllables)


def _apply_rules(word: str, lang: str) -> Optional[str]:
    """Apply phonetic rules for the given language to produce approximate IPA."""
    rules = PHONETIC_RULES.get(lang)
    if not rules:
        return None
    ipa = word.lower()
    for pattern, replacement in rules:
        ipa = pattern.sub(replacement, ipa)
    ipa = _add_stress(word, ipa)
    return f'[{ipa}]'


# ══════════════════════════════════════════════════════════════════════════════
# PUBLIC API
# ══════════════════════════════════════════════════════════════════════════════

def get_ipa(word: str, lang: str) -> Optional[str]:
    """
    Return an IPA string for `word` in `lang` (3-letter code, e.g. 'spa').

    Priority:
      1. Hand-curated lookup table  → accurate
      2. Phonetic rule generation   → approximate
      3. None                       → no IPA available for this language
    """
    if not word or not lang:
        return None

    lookup = IPA_LOOKUP.get(lang, {})
    if word.lower() in lookup:
        return lookup[word.lower()]

    return _apply_rules(word, lang)
