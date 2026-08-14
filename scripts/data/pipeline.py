#!/usr/bin/env python3
"""
pipeline.py — the data pipeline for VocabApp
=============================================
One script. Everything that builds or maintains the vocabulary data runs from
here.

    python scripts/data/pipeline.py all --langs spa --write

The chain, and what each step is for:

    mine      OpenSubtitles frequency corpus -> new curated entries.
              Hits Wiktionary/Google Translate for glosses, so it is
              rate-limited and batched. Not part of `all` — run it when you
              want more words.
    dedupe    Drop duplicate and junk entries. Mining appends without
              checking, so repeats accumulate.
    backfill  Fill missing pos/glosses. sync silently skips entries without
              them, which is why languages can look half-imported.
    enrich    Gender, domains, canonical domain names (Spanish).
    sync      curated JSONL -> vocabulary.db. This is what the app serves.

`all` runs dedupe -> backfill -> enrich -> sync: the local, repeatable part.

Assets and reports, run on demand:

    images    Wikipedia/iNaturalist photos -> data/images/
    emoji     OpenMoji SVGs -> data/emoji/
    check     Picture Quiz coverage report (read-only)

Every run prints a header first, telling you the mode, the languages, and what
it is about to touch — so you never have to guess whether a command was live.

Data is backed up before it is replaced: the curated JSONL to .jsonl.bak, the
database to vocabulary.db.bak.
"""

import argparse
import sys
from pathlib import Path

# The reports below use box-drawing characters and arrows. A Windows console
# defaults to cp1252, which cannot encode them, so printing the very first
# banner raises UnicodeEncodeError and the run dies before doing anything.
# Force UTF-8 and never let an unprintable character stop the pipeline.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding='utf-8', errors='replace')
    except (AttributeError, ValueError):  # pragma: no cover - very old Python
        pass

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from lib import curated, db, visuals                      # noqa: E402
from lib.config import DB_PATH, LANG_NAMES, curated_path  # noqa: E402


# ══════════════════════════════════════════════════════════════════════════════
#  SETTINGS FOR THE PLAY BUTTON
#  ─────────────────────────────
#  Running this file with no arguments — the ▶ button in VS Code, or a
#  double-click — does the whole job: mines new words for every language, then
#  cleans, enriches and loads them into the database. It WRITES. Backups are
#  taken first (.jsonl.bak, .db.bak).
#
#  Edit the four values below to change what the play button does. Nothing else
#  in this file needs touching.
# ══════════════════════════════════════════════════════════════════════════════

# Which languages to process. Remove any you don't want.
RUN_LANGUAGES = ['spa', 'fra', 'ita', 'por']

# Mine new words from the corpora before the rest of the chain?
# This is the slow part: uncached words need a network lookup, roughly a
# second each. Set to False to just rebuild the database from what you have.
RUN_MINING = True

# How many new words to add PER LANGUAGE per run.
#   200   ~15 minutes total, a good first click
#   500   ~35 minutes total
#   2000  ~2 hours total
# There are ~40,000 candidates per language, so this is a click-again-tomorrow
# job. Every run picks up where the last one left off.
MINE_BATCH = 200

# Safety catch. Set to False to make the play button preview only.
PLAY_BUTTON_WRITES = True



# ══════════════════════════════════════════════════════════════════════════════
# Helpers
# ══════════════════════════════════════════════════════════════════════════════

# What each step actually modifies. Used by the run banner so you can see what
# is at risk before anything happens, not after.
STEP_WRITES = {
    'all':      'data/curated/*.jsonl  and  data/vocabulary.db',
    'mine':     'data/curated/*.jsonl  (appends new entries)',
    'dedupe':   'data/curated/*.jsonl',
    'backfill': 'data/curated/*.jsonl',
    'enrich':   'data/curated/*.jsonl  and  data/vocabulary.db',
    'sync':     'data/vocabulary.db',
    'images':   'data/images/',
    'emoji':    'data/emoji/',
    'check':    'nothing — this step only reads',
    'env':      'nothing — this step only reports your setup',
    'everything': 'data/curated/*.jsonl  and  data/vocabulary.db',
}

STEP_DETAIL = {
    'all': 'dedupe → backfill → enrich → sync',
    'everything': 'mine → dedupe → backfill → enrich → sync',
}


def banner(text: str) -> None:
    print(f'\n{"═" * 70}\n  {text}\n{"═" * 70}')


def run_banner(args) -> None:
    """
    Print what is about to happen before it happens.

    The two questions people actually have are "is this going to change my
    data?" and "which languages is it touching?", so both are answered on
    screen every single run, whether or not you asked.
    """
    step   = args.command
    detail = STEP_DETAIL.get(step)
    write  = getattr(args, 'write', None)

    print(f'\n{"=" * 70}')
    print(f'  STEP      : {step}' + (f'   ({detail})' if detail else ''))

    if write is None:
        print('  MODE      : READ-ONLY — this step never changes anything')
    elif write:
        print('  MODE      : WRITE — changes WILL be saved')
        print('              a backup is taken first (.jsonl.bak / .db.bak)')
    else:
        print('  MODE      : DRY RUN — nothing will be saved')
        print('              this is the default; add --write to apply')

    if hasattr(args, 'langs'):
        codes = resolve_langs(args)
        names = ', '.join(f'{LANG_NAMES[c]} ({c})' for c in codes)
        print(f'  LANGUAGES : {names}')
        if args.langs is None:
            print(f'              defaulted to all {len(codes)} — narrow with '
                  f'--langs spa')
    elif hasattr(args, 'lang'):
        print(f'  LANGUAGES : {LANG_NAMES[args.lang]} ({args.lang})   '
              f'(this step reports on one language; change with --lang)')

    target = STEP_WRITES.get(step, '?')
    label  = 'WOULD EDIT' if write is False else 'EDITS     ' if write else 'READS     '
    print(f'  {label}: {target}')
    print(f'{"=" * 70}')


def lang_header(lang: str) -> None:
    print(f'\n── {LANG_NAMES[lang].upper()} ({lang}) ──')


def resolve_langs(args) -> list:
    """Validate --langs, exiting with a clear message rather than a traceback."""
    requested = list(getattr(args, 'langs', None) or LANG_NAMES)
    unknown = [c for c in requested if c not in LANG_NAMES]
    if unknown:
        sys.exit(f'Unknown language code(s): {", ".join(unknown)}\n'
                 f'Valid codes: {", ".join(LANG_NAMES)}')
    return requested


def persist(lang: str, entries: list, write: bool, changed: bool) -> None:
    """Write the curated file if there is something to write and we're allowed."""
    if not changed:
        print('  Written      : nothing to do')
        return
    if not write:
        print('  Dry run      : no files changed (pass --write to apply)')
        return
    path = curated.write(lang, entries)
    print(f'  Written      : {path.name} (backup: {path.name}.bak)')


# ══════════════════════════════════════════════════════════════════════════════
# Steps
# ══════════════════════════════════════════════════════════════════════════════

def step_mine(args) -> None:
    banner('MINE — corpus → curated entries')
    total = 0
    for lang in resolve_langs(args):
        cfg = curated.make_lang(lang)
        new = curated.mine_lang(
            cfg, args.batch, args.min_count, args.top, args.no_translate,
            args.verbose, corpus_file=args.corpus,
        )
        if not new:
            continue
        entries = curated.read(lang) + new
        persist(lang, entries, args.write, changed=True)
        total += len(new)
    print(f'\n  Total new entries: {total}')
    if total and args.write:
        print('  Next: pipeline.py all --langs … --write')


def step_dedupe(args) -> None:
    banner('DEDUPE — drop duplicate and junk entries')
    drop = {w.strip().lower() for w in (args.drop_words or []) if w.strip()}
    for lang in resolve_langs(args):
        lang_header(lang)
        entries = curated.read(lang)
        if not entries:
            continue
        survivors, junk, dupes = curated.dedupe_lang(lang, entries, drop)
        persist(lang, survivors, args.write, changed=bool(junk or dupes))


def step_backfill(args) -> None:
    banner('BACKFILL — fill pos/glosses so nothing is skipped on import')
    for lang in resolve_langs(args):
        lang_header(lang)
        entries = curated.read(lang)
        if not entries:
            continue
        filled, missing, complete = curated.backfill_lang(
            lang, entries, use_spacy=not args.no_spacy
        )
        persist(lang, entries, args.write, changed=bool(filled))


def step_enrich(args) -> None:
    banner('ENRICH — gender, domains, canonical domain names')
    for lang in resolve_langs(args):
        if lang != 'spa':
            print(f'\n── {LANG_NAMES[lang].upper()} ({lang}) ── skipped '
                  f'(enrichment rules are Spanish-only for now)')
            continue

        lang_header(lang)
        entries = curated.read(lang)
        if not entries:
            continue

        print('  Gender:')
        gender_changes = curated.enrich_gender(entries)
        print('  Domains:')
        domains_changed = curated.enrich_domains(entries)
        print('  Canonical:')
        canon_changed = curated.canonicalize_all(entries)

        changed = bool(gender_changes or domains_changed or canon_changed)
        persist(lang, entries, args.write, changed)

        if not (changed and args.write):
            continue

        # Mirror the same changes into the DB so it can't drift from the JSONL.
        bak = db.backup_db(DB_PATH)
        if bak:
            print(f'  DB backup    : {bak.name}')
        conn = db.open_db(DB_PATH, create=False)
        try:
            rows = db.patch_gender(conn, gender_changes)
            rows += db.patch_domains(conn, entries)
            print(f'  DB rows      : {rows} updated')
        finally:
            conn.close()


def step_sync(args) -> None:
    banner('SYNC — curated JSONL → vocabulary.db')
    for lang in resolve_langs(args):
        lang_header(lang)
        entries = curated.read(lang)
        if not entries:
            continue
        print(f'  Loaded       : {len(entries)} entries')

        conj_filled = curated.fill_conjugations(entries, lang)
        trans_fixed = curated.fix_translation(entries)
        if conj_filled:
            print(f'  Conjugations : filled {conj_filled} verbs')
        if trans_fixed:
            print(f'  Translation  : fixed {trans_fixed} cognates')

        if not args.write:
            print('  DB           : skipped (dry run — pass --write to apply)')
            continue

        bak = db.backup_db(DB_PATH)
        if bak:
            print(f'  DB backup    : {bak.name}')

        conn = db.open_db(DB_PATH)
        try:
            imported, skipped = db.import_to_db(entries, lang, conn)
        except Exception as e:
            print(f'  DB FAILED    : {e}')
            print(f'  DB unchanged — restore from {bak.name if bak else "backup"} if needed')
            return
        finally:
            conn.close()
        print(f'  DB           : {imported} imported, {skipped} skipped')

        # The JSONL is only rewritten once the DB write has succeeded, so the
        # two can never disagree about what was applied.
        if conj_filled or trans_fixed:
            curated.write(lang, entries)
            print('  JSONL        : saved')


def step_all(args) -> None:
    step_dedupe(args)
    step_backfill(args)
    step_enrich(args)
    step_sync(args)


def step_images(args) -> None:
    banner('IMAGES — Wikipedia/iNaturalist photos → data/images/')
    if not args.write:
        print('  Dry run — pass --write to download.')
        return
    visuals.fetch_images()


def step_emoji(args) -> None:
    banner('EMOJI — OpenMoji SVGs → data/emoji/')
    if not args.write:
        print('  Dry run — pass --write to download.')
        return
    visuals.fetch_emoji()


def _db_counts() -> dict:
    """Rows per language, for the before/after summary. Empty dict if no DB."""
    try:
        conn = db.open_db(DB_PATH, create=False)
        try:
            counts = dict(conn.execute(
                'SELECT language, COUNT(*) FROM words GROUP BY language').fetchall())
            counts['(glosses)'] = conn.execute(
                'SELECT COUNT(*) FROM word_glosses').fetchone()[0]
            return counts
        finally:
            conn.close()
    except Exception:
        return {}


def step_everything(args) -> None:
    """
    The play-button path: mine, then the full local chain, for every language.

    Deliberately does not ask for confirmation — the whole point is that it
    runs on one click. Backups are taken before anything is replaced.
    """
    before = _db_counts()

    est = len(args.langs) * args.batch // 60 if args.mine else 0
    print(f'\n  This run will:')
    n = 1
    if args.mine:
        print(f'    {n}. mine up to {args.batch:,} new words for each of '
              f'{len(args.langs)} languages  (~{max(est, 1)} min, network)')
        n += 1
    for label in ('remove duplicates and junk',
                  'fill missing parts of speech and glosses',
                  'add gender and domains (Spanish)',
                  'load everything into vocabulary.db'):
        print(f'    {n}. {label}')
        n += 1
    print(f'\n  Editing what this does: the SETTINGS block at the top of this file.')
    print(f'  Stop at any time with Ctrl+C — finished steps are already saved.\n')

    try:
        if args.mine:
            step_mine(args)
        step_dedupe(args)
        step_backfill(args)
        step_enrich(args)
        step_sync(args)
    except KeyboardInterrupt:
        print('\n\n  Stopped. Anything already written is saved and consistent.')

    after = _db_counts()
    if before or after:
        banner('RESULT — words in the database')
        keys = sorted(set(before) | set(after))
        print(f'    {"":12s} {"before":>9s} {"after":>9s} {"change":>9s}')
        total_b = total_a = 0
        for k in keys:
            b, a = before.get(k, 0), after.get(k, 0)
            if not k.startswith('('):
                total_b += b
                total_a += a
            d = a - b
            arrow = f'+{d:,}' if d > 0 else f'{d:,}'
            print(f'    {k:12s} {b:>9,} {a:>9,} {arrow:>9s}')
        d = total_a - total_b
        print(f'    {"TOTAL":12s} {total_b:>9,} {total_a:>9,} '
              f'{(f"+{d:,}" if d > 0 else f"{d:,}"):>9s}')
        if d > 0:
            print(f'\n    {d:,} new words are now in the app. Run this again for more.')
        elif args.mine:
            print(f'\n    No new words this run. Either the corpus candidates are '
                  f'exhausted\n    at the current --min-count, or every batch entry '
                  f'was already curated.')


def step_env(args) -> None:
    """
    Report what this Python can actually see.

    'pip install spacy' succeeding does not mean pipeline.py can import it —
    on Windows especially, `pip`, `python`, `py` and a venv can easily be four
    different installs. This prints the one that matters: the interpreter
    running this file.
    """
    import platform
    from lib.config import (CURATED_DIR, DB_PATH, EMOJI_DIR, GLOSS_CACHE,
                            IMAGES_DIR, OS_DIR, PROJECT_ROOT, SPACY_MODELS,
                            curated_path)

    print(f'\n  PYTHON')
    print(f'    interpreter    : {sys.executable}')
    print(f'    version        : {sys.version.split()[0]}  ({platform.platform()})')
    print(f'    pipeline.py    : {Path(__file__).resolve()}')

    print(f'\n  PACKAGES')
    ok = True
    for mod, why in [('spacy',            'REQUIRED for `mine` — without it mining yields zero words'),
                     ('mlconjug3',        'verb conjugation for fra/ita/por during `sync`'),
                     ('wiktionaryparser', 'gloss source for `mine`'),
                     ('deep_translator',  'gloss fallback for `mine`'),
                     ('requests',         'needed by `images`')]:
        try:
            m = __import__(mod)
            ver = getattr(m, '__version__', '?')
            print(f'    [ok]      {mod:18s} {ver:12s} {why}')
        except ImportError:
            ok = False
            print(f'    [MISSING] {mod:18s} {"":12s} {why}')

    print(f'\n  SPACY MODELS')
    try:
        import spacy
        for code, model in SPACY_MODELS.items():
            try:
                spacy.load(model)
                print(f'    [ok]      {code}  {model}')
            except OSError:
                ok = False
                print(f'    [MISSING] {code}  {model}   '
                      f'-> "{sys.executable}" -m spacy download {model}')
    except ImportError:
        print(f'    spaCy not importable, so no models can be checked.')

    print(f'\n  DATA')
    print(f'    project root   : {PROJECT_ROOT}')
    for label, path in [('curated dir', CURATED_DIR), ('database', DB_PATH),
                        ('OS corpora', OS_DIR), ('gloss cache', GLOSS_CACHE),
                        ('images', IMAGES_DIR), ('emoji', EMOJI_DIR)]:
        mark = 'ok     ' if path.exists() else 'MISSING'
        print(f'    [{mark}] {label:14s} {path}')

    print(f'\n  PER-LANGUAGE')
    for code, name in LANG_NAMES.items():
        cp = curated_path(code)
        n = sum(1 for line in open(cp, encoding='utf-8') if line.strip()) if cp.exists() else 0
        cache = GLOSS_CACHE / f'gloss_cache_{code}.jsonl'
        nc = sum(1 for line in open(cache, encoding='utf-8') if line.strip()) if cache.exists() else 0
        corpus = OS_DIR / {'spa': 'es', 'fra': 'fr', 'ita': 'it', 'por': 'pt'}[code]
        files = ', '.join(sorted(f.name for f in corpus.glob('*.txt'))) if corpus.exists() else 'none'
        print(f'    {name:11s} curated {n:>6,}   glosses cached {nc:>6,}   corpus: {files}')

    if not ok:
        print(f'\n  >>> Something above is MISSING. Install into the interpreter '
              f'listed at the top:')
        print(f'      "{sys.executable}" -m pip install -r scripts/data/requirements.txt')
    else:
        print(f'\n  Everything the pipeline needs is present.')


def step_check(args) -> None:
    banner('CHECK — Picture Quiz visual coverage')
    visuals.coverage_report(
        lang=args.lang, top=args.top, domains=args.domain,
        pos=args.pos, covered_only=args.covered, show_all=args.all,
    )


# ══════════════════════════════════════════════════════════════════════════════
# CLI
# ══════════════════════════════════════════════════════════════════════════════

def main() -> None:
    parser = argparse.ArgumentParser(
        prog='pipeline.py',
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Two flags matter, and they work the same way on every step
----------------------------------------------------------
  (nothing)          PREVIEW. Reports what it would do, changes nothing.
  --write   / -w     APPLY. Saves the changes, after taking a backup.

  --langs   / -l     Which languages: spa fra ita por.
                     Several at once is fine: --langs spa ita
                     Leave it off and ALL FOUR are processed.

So the shape of every command is:

    python scripts/data/pipeline.py STEP --langs spa          <- preview
    python scripts/data/pipeline.py STEP --langs spa --write  <- apply

Worked example — rebuild the Spanish database
---------------------------------------------
  python scripts/data/pipeline.py all --langs spa            # see the plan
  python scripts/data/pipeline.py all --langs spa --write    # do it

Per-step help, which lists that step's own options:

  python scripts/data/pipeline.py sync --help
""",
    )
    sub = parser.add_subparsers(
        dest='command', metavar='STEP',
        title='steps (pick one)',
    )

    codes = ' '.join(LANG_NAMES)

    def add(name, help_text, *, langs=True, write=True):
        writes = STEP_WRITES.get(name, '')
        detail = STEP_DETAIL.get(name)

        epilog = f"""
Examples
--------
  # preview — safe, changes nothing
  python scripts/data/pipeline.py {name}{' --langs spa' if langs else ''}

  # apply
  python scripts/data/pipeline.py {name}{' --langs spa' if langs else ''} --write
""" if write else f"""
Example
-------
  python scripts/data/pipeline.py {name}
"""

        description = help_text
        if detail:
            description += f'\n\nRuns, in order: {detail}'
        description += f'\n\nTouches: {writes}'
        if write:
            description += ('\n\nThis step is a DRY RUN unless you pass --write. '
                            'A dry run reports\neverything it would do and changes '
                            'nothing, so it is always safe\nto run first.')

        p = sub.add_parser(
            name, help=help_text, description=description, epilog=epilog,
            formatter_class=argparse.RawDescriptionHelpFormatter,
        )

        if langs:
            p.add_argument(
                '-l', '--langs', nargs='+', metavar='CODE', choices=list(LANG_NAMES),
                help=(f'which languages to process. Valid codes: {codes}. '
                      f'You can give several ("--langs spa ita"). '
                      f'DEFAULT: all {len(LANG_NAMES)} languages.'),
            )
        if write:
            p.add_argument(
                '-w', '--write', action='store_true',
                help=('APPLY the changes. Without this flag the step only previews: '
                      'it prints what it would do and writes nothing. '
                      'DEFAULT: preview (dry run).'),
            )
            # Accepted and ignored: dry run is the default now. Keeps older
            # commands and notes from failing with "unrecognized arguments".
            p.add_argument('--dry-run', action='store_true', help=argparse.SUPPRESS)
        return p

    p = add('all', 'dedupe → backfill → enrich → sync (the full local chain)')
    p.add_argument('--no-spacy', action='store_true', help='skip spaCy tagging in backfill')
    p.add_argument('--drop-words', nargs='*', default=[], help='extra words to drop in dedupe')
    p.set_defaults(func=step_all)

    p = add('mine', 'corpus → new curated entries (network, rate-limited)')
    p.add_argument('--batch', type=int, default=500, metavar='N',
                   help='how many new entries to add per language per run. '
                        'Words whose gloss is already cached cost nothing; '
                        'uncached ones take about a second each. DEFAULT: 500.')
    p.add_argument('--corpus', choices=['50k', 'full'], default='50k',
                   help='which frequency file to read. "50k" is the curated '
                        '50,000-word list. "full" is the complete corpus '
                        '(1.2M lines for Spanish) — mostly typos and proper '
                        'nouns past the first 50k, so raise --min-count with '
                        'it. DEFAULT: 50k.')
    p.add_argument('--min-count', type=int, default=100, metavar='N',
                   help='ignore words appearing fewer than N times in the '
                        'corpus. DEFAULT: 100.')
    p.add_argument('--top', type=int, default=0, metavar='N',
                   help='only scan the N most frequent words. 0 means scan the '
                        'whole file, which is what you want unless you are in '
                        'a hurry — every scanned word costs one spaCy tag. '
                        'DEFAULT: 0 (no limit).')
    p.add_argument('--no-translate', action='store_true',
                   help='Wiktionary only, skip the Google Translate fallback')
    p.add_argument('--verbose', action='store_true')
    p.set_defaults(func=step_mine)

    p = add('dedupe', 'drop duplicate and junk curated entries')
    p.add_argument('--drop-words', nargs='*', default=[],
                   help='extra words to remove outright (corpus fragments etc.)')
    p.set_defaults(func=step_dedupe)

    p = add('backfill', 'fill missing pos/glosses so sync stops skipping rows')
    p.add_argument('--no-spacy', action='store_true',
                   help='skip spaCy tagging even when it is available')
    p.set_defaults(func=step_backfill)

    p = add('enrich', 'gender, domains and canonical domain names')
    p.set_defaults(func=step_enrich)

    p = add('sync', 'curated JSONL → vocabulary.db')
    p.set_defaults(func=step_sync)

    p = add('images', 'download Wikipedia/iNaturalist photos', langs=False)
    p.set_defaults(func=step_images)

    p = add('emoji', 'download OpenMoji SVGs', langs=False)
    p.set_defaults(func=step_emoji)

    p = add('everything', 'mine + the full chain, every language '
            '(what the play button runs)')
    p.add_argument('--batch', type=int, default=MINE_BATCH, metavar='N',
                   help=f'new words per language (DEFAULT: {MINE_BATCH})')
    p.add_argument('--no-mine', dest='mine', action='store_false', default=True,
                   help='skip mining; just rebuild from existing curated files')
    p.add_argument('--corpus', choices=['50k', 'full'], default='50k')
    p.add_argument('--min-count', type=int, default=100, metavar='N')
    p.add_argument('--top', type=int, default=0, metavar='N')
    p.add_argument('--no-translate', action='store_true')
    p.add_argument('--no-spacy', action='store_true')
    p.add_argument('--drop-words', nargs='*', default=[])
    p.add_argument('--verbose', action='store_true')
    p.set_defaults(func=step_everything)

    p = add('env', 'show which Python, packages and data this pipeline sees',
            langs=False, write=False)
    p.set_defaults(func=step_env)

    p = add('check', 'Picture Quiz coverage report (read-only)', langs=False, write=False)
    p.add_argument('-l', '--lang', default='spa', choices=list(LANG_NAMES),
                   help=f'which language to report on — one at a time here. '
                        f'Valid codes: {codes}. DEFAULT: spa.')
    p.add_argument('--top', type=int, default=30, help='how many words to list (default: 30)')
    p.add_argument('--domain', nargs='+', metavar='DOMAIN')
    p.add_argument('--pos', nargs='+', metavar='POS')
    p.add_argument('--covered', action='store_true', help='show covered words instead of gaps')
    p.add_argument('--all', action='store_true', help='show everything, not just --top N')
    p.set_defaults(func=step_check)

    # No arguments at all — the VS Code play button, or a double-click.
    # Do the whole job using the SETTINGS block at the top of this file,
    # rather than printing help at someone who cannot pass arguments.
    if len(sys.argv) == 1:
        args = argparse.Namespace(
            command='everything',
            func=step_everything,
            langs=list(RUN_LANGUAGES),
            write=PLAY_BUTTON_WRITES,
            mine=RUN_MINING,
            batch=MINE_BATCH,
            corpus='50k',
            min_count=100,
            top=0,
            no_translate=False,
            verbose=False,
            no_spacy=False,
            drop_words=[],
        )
    else:
        args = parser.parse_args()
        if not args.command:
            parser.print_help()
            sys.exit(0)
        args.mine = getattr(args, 'mine', False)

    run_banner(args)
    args.func(args)

    print(f'\n{"=" * 70}')
    if getattr(args, 'write', None) is False:
        print(f'  {args.command}: DRY RUN COMPLETE — nothing was written.')
        if len(sys.argv) == 1:
            # Launched from the play button, where there is no command line to
            # add a flag to. Point at the setting instead.
            print('  To make this apply, open this file and set:')
            print('      PLAY_BUTTON_WRITES = True')
        else:
            print(f'  Re-run with --write to apply:')
            argv = ' '.join(a for a in sys.argv[1:] if a != '--dry-run')
            print(f'      python scripts/data/pipeline.py {argv} --write')
    elif getattr(args, 'write', None) is True:
        print(f'  {args.command}: DONE — changes written.')
        print('  Backups: data/curated/*.jsonl.bak, data/vocabulary.db.bak')
    else:
        print(f'  {args.command}: DONE.')
    print(f'{"=" * 70}')


if __name__ == '__main__':
    main()
