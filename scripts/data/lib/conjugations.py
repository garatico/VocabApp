"""
conjugations.py — German and Dutch verb tables, from Wiktionary.

WHY THIS IS NOT A RULES ENGINE
------------------------------
The obvious plan was a rules engine like the Spanish one in verb-rules.ts. It
would not have helped. Of the 172 German verbs in the vocabulary roughly 75 are
strong — gehen, nehmen, sprechen, ziehen, schwimmen — and Dutch is much the
same. A strong verb's principal parts cannot be derived from its infinitive;
they have to be supplied. So whatever generates the weak verbs, the hard part is
a table of about 150 verbs, and the only question is where it comes from.

Hand-writing it was the alternative. A wrong Präteritum stem is not a crash: it
is a confidently wrong answer that a learner has no way to doubt, and no test in
this repo would catch it. Wiktionary is checkable by anyone, by opening the page.

WHAT IT TAKES
-------------
Present, simple past and the past participle. Those three are what a learner
needs to talk about the past at all: the everyday past tense in both languages
is the perfect, which is the participle plus a conjugated auxiliary, so the
participle earns its place more than the Präteritum does. Compound tenses are
built from these rather than memorised separately.

SKIPPING BEATS GUESSING
-----------------------
Every parse is shape-checked before it is accepted: six present forms, six
preterite forms, a participle, and nothing containing markup or a footnote
marker. A verb that fails any check is reported and left with no conjugation —
Conjugation mode drops verbs it has no forms for, so the cost of a miss is a
verb you cannot drill, not a verb you are taught wrong.

CACHING
-------
Same shape as the gloss cache and for the same reason: one JSONL per language,
appended as results arrive, so an interrupted run resumes instead of re-fetching
and the network cost is paid once. Failures are cached too, with a reason, so a
verb Wiktionary genuinely has no table for is not retried on every run.
"""

from __future__ import annotations

import json
import re
import time
from typing import Dict, List, Optional, Tuple

from .config import DATA_DIR, LANG_NAMES

# Only these two. The other four have their conjugations already: Spanish from
# the rules engine, fr/it/pt imported from mlconjug3 at sync time.
SUPPORTED = ('deu', 'nld')

WIKT_SECTION = {'deu': 'German', 'nld': 'Dutch'}

CACHE_DIR = DATA_DIR / 'conj_cache'


class ConjugationFetchError(RuntimeError):
    """A failure about the run rather than about the verb. Never cached."""


# Printed once when a run fails for network reasons rather than per verb, since
# the same line repeated 172 times says no more than it does once.
NETWORK_HINT = (
    'Every fetch failed before reaching Wiktionary.\n'
    '    If the reason mentions an expired certificate, it is this machine\'s\n'
    '    root certificate list, not Wiktionary\'s — theirs is valid. Refresh\n'
    '    the bundle Python verifies against:\n'
    '\n'
    '        pip install --upgrade certifi requests\n'
    '\n'
    '    Nothing was cached, so re-running picks up exactly where it stopped.'
)

# Wiktionary asks for a descriptive agent with contact info; anonymous scraping
# from a default urllib agent is what gets a project blocked.
USER_AGENT = (
    'VocabApp/0.1 (language-learning app; conjugation table import; '
    'https://en.wiktionary.org/wiki/Wiktionary:Bots)'
)

# Polite fixed delay. Wiktionary has no published rate limit for logged-out
# reads, and ~1 req/sec is the figure their bot policy treats as uncontroversial.
REQUEST_DELAY_S = 1.0

# A form should be a word, possibly hyphenated or with a separable prefix split
# off. Anything with digits, brackets or markup is a footnote or a parse escape.
FORM_RE = re.compile(r'^[a-zäöüßA-ZÄÖÜ][a-zäöüßA-ZÄÖÜ\' -]*$')


def cache_path(lang_code: str) -> 'object':
    return CACHE_DIR / f'{LANG_NAMES.get(lang_code, lang_code)}.jsonl'


def load_cache(lang_code: str) -> Dict[str, dict]:
    path = cache_path(lang_code)
    cache: Dict[str, dict] = {}
    if not path.exists():
        return cache
    with open(path, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
                cache[entry['word']] = entry
            except Exception:
                pass
    return cache


def save_to_cache(lang_code: str, word: str, entry: dict) -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    with open(cache_path(lang_code), 'a', encoding='utf-8') as f:
        f.write(json.dumps({'word': word, **entry}, ensure_ascii=False) + '\n')


# ── Fetching ──────────────────────────────────────────────────────────────────

def _fetch_html(word: str) -> Optional[str]:
    """
    Rendered article HTML from the REST endpoint, or None for 404.

    Uses `requests` rather than `urllib`, and the difference is not stylistic.
    urllib verifies TLS against whatever root certificates the machine happens
    to have, which on an older install means every fetch dies with

        CERTIFICATE_VERIFY_FAILED: certificate has expired

    naming a certificate that is the local one, not Wiktionary's — Wikimedia's
    is fine. requests verifies against certifi's bundle, which is updated with
    the package instead of with the operating system. `requests` is already a
    pipeline dependency (visuals.py uses it for image downloads).
    """
    import urllib.parse
    url = 'https://en.wiktionary.org/api/rest_v1/page/html/' + urllib.parse.quote(word, safe='')

    try:
        import requests
    except ImportError:
        requests = None  # type: ignore[assignment]

    if requests is not None:
        try:
            resp = requests.get(url, headers={'User-Agent': USER_AGENT}, timeout=20)
        except requests.exceptions.SSLError as exc:
            raise ConjugationFetchError(f'TLS verification failed ({exc})') from exc
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        return resp.text

    # Fallback for an environment without requests. Same behaviour, minus the
    # certifi bundle — so this is the path that hits the expired-root problem.
    import urllib.request
    import urllib.error
    req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return resp.read().decode('utf-8', errors='replace')
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            return None
        raise


def _clean(cell_text: str) -> List[str]:
    """
    A cell can hold several accepted forms, or none.

    Wiktionary separates alternatives with commas or line breaks and marks
    rare/archaic ones with a superscript. Everything that survives FORM_RE is
    kept in order; the first is what the drill checks against.
    """
    text = cell_text.replace(' ', ' ')
    parts = re.split(r'[,\n/]| or ', text)
    out: List[str] = []
    for p in parts:
        p = p.strip().strip('*†1234567890').strip()
        if p and FORM_RE.match(p) and p not in out:
            out.append(p)
    return out


def parse_tables(html: str, lang_code: str) -> Tuple[Optional[dict], str]:
    """
    Pull present, preterite and participle out of the rendered article.

    Returns (forms, reason). `forms` is None when anything did not parse, and
    `reason` always says which check failed — a silent skip is indistinguishable
    from a verb Wiktionary has never heard of, and they need different fixes.
    """
    try:
        from bs4 import BeautifulSoup
    except ImportError:
        return None, 'beautifulsoup4 not installed (pip install -r scripts/data/requirements.txt)'

    soup = BeautifulSoup(html, 'html.parser')

    # Wiktionary is one page per spelling across every language that uses it, so
    # the German section of a page has to be isolated before anything is read
    # from it — 'was' is a German verb form and an English word, and the wrong
    # section would silently produce English tables.
    section_name = WIKT_SECTION[lang_code]
    heading = None
    for h in soup.find_all(['h2', 'h3']):
        if h.get_text(strip=True).lower() == section_name.lower():
            heading = h
            break
    if heading is None:
        return None, f'no {section_name} section'

    scope = []
    for el in heading.find_all_next():
        if el.name in ('h2',) and el is not heading:
            break
        scope.append(el)

    tables = [el for el in scope if el.name == 'table'
              and 'inflection-table' in ' '.join(el.get('class') or [])]
    if not tables:
        return None, 'no inflection table'

    # Row lookup by its header text. Wiktionary's German and Dutch verb tables
    # both label rows in the leftmost cell, so this does not depend on column
    # positions, which differ between the two languages' templates.
    # Include terms, then terms that disqualify a row that matched one.
    #
    # The exclusions are the whole point: "present participle" contains
    # "present", and claimed the present tense — a one-cell row where six were
    # expected, which is what every verb failed on. Matching on a substring
    # needs to say what the substring must *not* be part of.
    wanted = {
        'present':         (('present', 'presens', 'tegenwoordige'),
                            ('participle', 'participium', 'deelwoord', 'subjunctive')),
        'preterite':       (('preterite', 'past tense', 'imperfect', 'verleden'),
                            ('participle', 'subjunctive', 'perfect')),
        'past_participle': (('past participle', 'voltooid deelwoord', 'partizip ii'),
                            ()),
    }
    found: Dict[str, List[str]] = {}

    for table in tables:
        for row in table.find_all('tr'):
            cells = row.find_all(['th', 'td'])
            if len(cells) < 2:
                continue
            label = cells[0].get_text(' ', strip=True).lower()
            for key, (needles, banned) in wanted.items():
                if key in found:
                    continue
                if not any(n in label for n in needles):
                    continue
                if any(b in label for b in banned):
                    continue
                values: List[str] = []
                for c in cells[1:]:
                    forms = _clean(c.get_text(' ', strip=True))
                    values.append(forms[0] if forms else '')
                found[key] = values

    present = [v for v in found.get('present', []) if v]
    preterite = [v for v in found.get('preterite', []) if v]
    participle = next((v for v in found.get('past_participle', []) if v), '')

    if len(present) < 6:
        return None, f'present had {len(present)} forms, expected 6'
    if len(preterite) < 6:
        return None, f'preterite had {len(preterite)} forms, expected 6'
    if not participle:
        return None, 'no past participle'

    return {
        'present':         present[:6],
        'preterite':       preterite[:6],
        'past_participle': participle,
    }, 'ok'


def dump_tables(lang_code: str, word: str) -> str:
    """
    Print what Wiktionary's table actually looks like, row by row.

    Written because the parser was guessing. Two rounds of "expected six forms,
    found one" said the shape was wrong without saying what it was, and there is
    no fixture for this — the page is the specification. `--dump haben` shows
    every row's label and cells so the selectors can be written against the
    thing rather than against an assumption about it.
    """
    try:
        from bs4 import BeautifulSoup
    except ImportError:
        return 'beautifulsoup4 not installed (pip install -r scripts/data/requirements.txt)'

    try:
        html = _fetch_html(word)
    except Exception as exc:
        return f'fetch failed: {exc}\n\n{NETWORK_HINT}'
    if html is None:
        return f'no Wiktionary page for {word!r}'

    soup = BeautifulSoup(html, 'html.parser')
    section_name = WIKT_SECTION[lang_code]

    heading = None
    for h in soup.find_all(['h2', 'h3']):
        if h.get_text(strip=True).lower() == section_name.lower():
            heading = h
            break
    if heading is None:
        heads = [h.get_text(strip=True) for h in soup.find_all(['h2', 'h3'])][:20]
        return f'no {section_name} section. Headings seen: {heads}'

    scope = []
    for el in heading.find_all_next():
        if el.name == 'h2' and el is not heading:
            break
        scope.append(el)

    out = [f'=== {word} ({section_name}) ===']
    tables = [el for el in scope if el.name == 'table']
    out.append(f'{len(tables)} table(s) in this section')

    for ti, table in enumerate(tables):
        classes = ' '.join(table.get('class') or [])
        out.append(f'\n--- table {ti}  class={classes!r} ---')
        for ri, row in enumerate(table.find_all('tr')):
            cells = row.find_all(['th', 'td'])
            texts = [c.get_text(' ', strip=True)[:28] for c in cells]
            out.append(f'  r{ri:<3} [{len(cells)}] {texts}')
    return '\n'.join(out)


def fetch_conjugation(lang_code: str, word: str,
                      cache: Dict[str, dict]) -> Tuple[Optional[dict], str]:
    """Cached lookup. Returns (forms, source) where source explains a miss."""
    hit = cache.get(word)
    if hit is not None:
        forms = hit.get('forms')
        return (forms, 'cache') if forms else (None, f"cache: {hit.get('reason', 'no table')}")

    try:
        html = _fetch_html(word)
    except Exception as exc:
        # Not cached: a network failure is about the run, not about the verb,
        # and caching it would make the failure permanent.
        return None, f'fetch failed: {exc}'

    time.sleep(REQUEST_DELAY_S)

    if html is None:
        save_to_cache(lang_code, word, {'forms': None, 'reason': 'no wiktionary page'})
        cache[word] = {'forms': None, 'reason': 'no wiktionary page'}
        return None, 'no wiktionary page'

    forms, reason = parse_tables(html, lang_code)
    entry = {'forms': forms, 'reason': reason}
    save_to_cache(lang_code, word, entry)
    cache[word] = entry
    return forms, reason
