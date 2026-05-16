#!/usr/bin/env python3
"""
debug_conjugations.py
=====================
Prints the exact mood/tense key structure that mlconjug3 exposes for one
test verb per language.  Run this first to verify (and fix) TENSE_MAP in
clean_wikicorpora.py.

Usage:
    python backend/scripts/data/debug_conjugations.py
    python backend/scripts/data/debug_conjugations.py --langs spa fra
"""

import argparse
import json
import sys

try:
    import mlconjug3
except ImportError:
    print("mlconjug3 is not installed.  pip install mlconjug3")
    sys.exit(1)

# One representative irregular verb per language code
TEST_VERBS = {
    'spa': ('es', 'ser'),
    'fra': ('fr', 'être'),
    'ita': ('it', 'essere'),
    'por': ('pt', 'ser'),
}

# What clean_wikicorpora.py currently expects (for comparison)
EXPECTED_TENSE_MAP = {
    'spa': {
        'present':     ('Indicativo',   'Presente'),
        'preterite':   ('Indicativo',   'Pretérito Indefinido'),
        'imperfect':   ('Indicativo',   'Pretérito Imperfecto'),
        'future':      ('Indicativo',   'Futuro'),
        'conditional': ('Indicativo',   'Condicional'),
        'subjunctive': ('Subjuntivo',   'Presente'),
        'imperative':  ('Imperativo',   'Afirmativo'),
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
        'present':     ('Indicativo',   'Presente'),
        'preterite':   ('Indicativo',   'Passato remoto'),
        'imperfect':   ('Indicativo',   'Imperfetto'),
        'future':      ('Indicativo',   'Futuro semplice'),
        'conditional': ('Condizionale', 'Presente'),
        'subjunctive': ('Congiuntivo',  'Presente'),
        'imperative':  ('Imperativo',   'Presente'),
    },
    'por': {
        'present':     ('Indicativo',   'Presente'),
        'preterite':   ('Indicativo',   'Pretérito Perfeito'),
        'imperfect':   ('Indicativo',   'Pretérito Imperfeito'),
        'future':      ('Indicativo',   'Futuro do Presente'),
        'conditional': ('Indicativo',   'Futuro do Pretérito'),
        'subjunctive': ('Subjuntivo',   'Presente'),
        'imperative':  ('Imperativo',   'Afirmativo'),
    },
}


def print_section(title: str):
    print(f"\n{'═' * 60}")
    print(f"  {title}")
    print('═' * 60)


def debug_lang(lang_code: str):
    ml_lang, test_verb = TEST_VERBS[lang_code]
    print_section(f"{lang_code.upper()}  —  mlconjug3 lang='{ml_lang}'  verb='{test_verb}'")

    try:
        conjugator = mlconjug3.Conjugator(language=ml_lang)
    except Exception as e:
        print(f"  ERROR creating Conjugator: {e}")
        return

    try:
        verb = conjugator.conjugate(test_verb)
    except Exception as e:
        print(f"  ERROR conjugating '{test_verb}': {e}")
        return

    # ── Print raw conjug_info structure ────────────────────────────────
    try:
        info = verb.conjug_info
    except AttributeError:
        print("  verb.conjug_info does not exist on this mlconjug3 version.")
        print(f"  Available attributes: {[a for a in dir(verb) if not a.startswith('_')]}")
        return

    print("\n  ── Full conjug_info tree ──────────────────────────────")
    for mood, tenses in info.items():
        if not isinstance(tenses, dict):
            print(f"    [{mood}] → (not a dict: {type(tenses).__name__})")
            continue
        print(f"\n    Mood: {repr(mood)}")
        for tense, forms in tenses.items():
            if isinstance(forms, dict):
                sample = list(forms.items())[:2]
                print(f"      Tense: {repr(tense)}")
                print(f"        Forms (first 2): {sample}")
            else:
                print(f"      Tense: {repr(tense)} → {forms!r}")

    # ── Check each expected (mood, tense) pair ─────────────────────────
    expected = EXPECTED_TENSE_MAP.get(lang_code, {})
    if expected:
        print("\n  ── TENSE_MAP validation ───────────────────────────────")
        all_ok = True
        for app_tense, (mood, tense_label) in expected.items():
            found = tense_label in info.get(mood, {})
            status = "✓" if found else "✗ MISSING"
            print(f"    {status}  {app_tense:12s} → ({repr(mood)}, {repr(tense_label)})")
            if not found:
                all_ok = False
                # Suggest close matches
                avail_in_mood = list(info.get(mood, {}).keys())
                avail_moods   = list(info.keys())
                if mood not in info:
                    print(f"               mood {repr(mood)} not found. "
                          f"Available moods: {avail_moods}")
                else:
                    print(f"               tense not found in mood {repr(mood)}. "
                          f"Available tenses: {avail_in_mood}")
        if all_ok:
            print("    All expected tense keys found — TENSE_MAP is correct for this language.")

    # ── Sample: show what 'ser'/'être' present tense looks like ────────
    print("\n  ── Sample output (present tense, if found) ────────────")
    pres_mood, pres_tense = expected.get('present', (None, None))
    if pres_mood and pres_tense:
        try:
            forms = info[pres_mood][pres_tense]
            print(f"    {pres_mood} / {pres_tense}:")
            for pronoun, form in forms.items():
                print(f"      {pronoun}: {form}")
        except (KeyError, TypeError) as e:
            print(f"    Could not retrieve: {e}")


def main(langs):
    print(f"mlconjug3 version: {mlconjug3.__version__}")
    for lang in langs:
        if lang not in TEST_VERBS:
            print(f"\n  [{lang}] No test verb configured — skipping.")
            continue
        debug_lang(lang)
    print("\n\nDone. Use the output above to update TENSE_MAP in clean_wikicorpora.py.")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(
        description='Diagnose mlconjug3 key structure to verify/fix TENSE_MAP.'
    )
    parser.add_argument(
        '--langs', nargs='+',
        default=['spa', 'fra', 'ita', 'por'],
        help='Language codes to check (default: spa fra ita por)',
    )
    args = parser.parse_args()
    main(args.langs)
