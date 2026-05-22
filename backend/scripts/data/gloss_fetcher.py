"""
gloss_fetcher.py — Gloss translation, cache, and domain classification
=======================================================================
Responsible for:
  - Fetching English glosses from Wiktionary (primary) and Google Translate (fallback)
  - Reading and writing the per-language gloss cache (JSONL)
  - Normalizing raw glosses into clean, quiz-ready answer strings
  - Classifying vocabulary entries into semantic domains

Called by clean_wikicorpora.main().
"""

import json
import re
import time
from pathlib import Path
from typing import Dict, List, Optional

from lang_config import LANG_SRC, WIKT_LANG

# Monkey-patch requests.Session so every HTTP call made by wiktionaryparser
# or deep_translator gets a hard timeout. socket.setdefaulttimeout() is not
# enough because requests uses urllib3 connection pools that bypass it.
try:
    import requests as _requests
    _orig_request = _requests.Session.request
    def _timed_request(self, method, url, **kwargs):
        kwargs.setdefault('timeout', 3)
        return _orig_request(self, method, url, **kwargs)
    _requests.Session.request = _timed_request
except ImportError:
    pass


# ══════════════════════════════════════════════════════════════════════════════
# CONSTANTS
# ══════════════════════════════════════════════════════════════════════════════

# Cache entries with these sources are considered settled; skip re-fetching.
# 'unknown' and 'empty' are excluded so they always get retried.
GOOD_SOURCES = {'wiktionary', 'google', 'reviewed'}

# Manually verified glosses — override whatever cache / Google returned.
# Keys are the target-language words; values are clean English glosses in
# preferred order (most common meaning first).
# Marked 'reviewed' in cache so they're never overwritten on future runs.
# NOTE: Do NOT add verb forms here (e.g. 'son', 'era') — those are covered
# by conjugation tables on their parent verb entries.
GLOSS_CORRECTIONS: Dict[str, Dict[str, List[str]]] = {
    'spa': {
        'año':    ['year'],
        'equipo': ['team', 'equipment'],
        'grupo':  ['group'],
        'mayor':  ['older', 'greater', 'main', 'mayor'],
        'parte':  ['part', 'portion', 'side'],
    },
}

# ── Domain keywords (matched against English glosses) ────────────────────────
# Whole-word matching prevents false positives (e.g. 'war' inside 'software').
DOMAIN_GLOSS_KEYWORDS: Dict[str, List[str]] = {
    'animals':    ['dog', 'cat', 'bird', 'fish', 'horse', 'cow', 'pig', 'sheep',
                   'wolf', 'lion', 'tiger', 'bear', 'monkey', 'elephant', 'snake',
                   'rabbit', 'duck', 'eagle', 'bee', 'butterfly', 'frog', 'shark',
                   'whale', 'insect', 'animal', 'pet', 'wild', 'species', 'prey',
                   'predator', 'mammal', 'reptile', 'amphibian', 'creature'],
    'food':       ['eat', 'food', 'drink', 'cook', 'meal', 'fruit', 'vegetable',
                   'meat', 'bread', 'fish', 'dish', 'taste', 'flavor', 'recipe',
                   'soup', 'salad', 'wine', 'beer', 'milk', 'cheese', 'egg',
                   'rice', 'pasta', 'pizza', 'chocolate', 'sugar', 'salt', 'oil',
                   'butter', 'coffee', 'tea', 'juice', 'water', 'apple', 'orange',
                   'banana', 'tomato', 'potato', 'onion', 'garlic', 'lemon'],
    'travel':     ['travel', 'trip', 'journey', 'hotel', 'airport', 'train',
                   'bus', 'car', 'plane', 'ship', 'tourist', 'map', 'road',
                   'station', 'ticket', 'passport', 'border', 'destination',
                   'luggage', 'flight', 'cruise', 'voyage', 'taxi', 'guide'],
    'body':       ['body', 'hand', 'foot', 'eye', 'ear', 'nose', 'mouth',
                   'arm', 'leg', 'head', 'hair', 'skin', 'heart', 'blood',
                   'bone', 'face', 'finger', 'tooth', 'back', 'neck',
                   'chest', 'stomach', 'knee', 'shoulder', 'tongue', 'lip'],
    'health':     ['health', 'doctor', 'medicine', 'sick', 'pain', 'hospital',
                   'drug', 'therapy', 'disease', 'symptom', 'treatment',
                   'injury', 'cure', 'patient', 'nurse', 'pharmacy', 'virus',
                   'infection', 'surgery', 'diagnosis', 'mental', 'physical'],
    'family':     ['family', 'mother', 'father', 'parent', 'child', 'son',
                   'daughter', 'brother', 'sister', 'grandmother', 'grandfather',
                   'grandparent', 'uncle', 'aunt', 'cousin', 'husband', 'wife',
                   'spouse', 'relative', 'sibling', 'nephew', 'niece'],
    'emotions':   ['feel', 'love', 'hate', 'happy', 'sad', 'angry', 'fear',
                   'joy', 'hope', 'worry', 'emotion', 'mood', 'desire',
                   'trust', 'doubt', 'surprise', 'pleasure', 'excited',
                   'nervous', 'proud', 'ashamed', 'jealous', 'grateful',
                   'lonely', 'bored', 'confused', 'calm', 'anxious'],
    'weather':    ['rain', 'sun', 'snow', 'wind', 'cloud', 'storm', 'thunder',
                   'lightning', 'fog', 'temperature', 'cold', 'hot', 'warm',
                   'humid', 'dry', 'weather', 'climate', 'forecast', 'hail',
                   'frost', 'flood', 'drought', 'rainbow', 'sunny', 'rainy'],
    'education':  ['school', 'study', 'learn', 'teach', 'book', 'class',
                   'university', 'student', 'teacher', 'lesson', 'knowledge',
                   'exam', 'grade', 'subject', 'course', 'read', 'write',
                   'degree', 'diploma', 'homework', 'lecture', 'library'],
    'business':   ['money', 'work', 'job', 'company', 'sell', 'buy', 'market',
                   'price', 'cost', 'profit', 'tax', 'bank', 'invest',
                   'trade', 'contract', 'salary', 'business', 'economy',
                   'budget', 'revenue', 'debt', 'loan', 'client', 'brand'],
    'technology': ['computer', 'phone', 'internet', 'digital', 'software',
                   'machine', 'device', 'data', 'network', 'screen',
                   'program', 'system', 'technology', 'electric', 'app',
                   'application', 'electronic', 'keyboard', 'robot',
                   'camera', 'battery', 'signal', 'wireless', 'download'],
    'nature':     ['tree', 'flower', 'water', 'fire', 'earth',
                   'sky', 'mountain', 'river', 'sea', 'forest', 'plant',
                   'stone', 'wind', 'rain', 'sun', 'moon', 'star', 'nature',
                   'ocean', 'lake', 'desert', 'jungle', 'beach', 'valley',
                   'cave', 'cliff', 'soil', 'grass', 'leaf', 'root', 'seed'],
    'home':       ['house', 'home', 'room', 'door', 'window', 'floor',
                   'kitchen', 'bathroom', 'bedroom', 'furniture', 'table',
                   'chair', 'bed', 'wall', 'garden', 'roof', 'clean',
                   'sofa', 'lamp', 'shelf', 'closet', 'stair', 'basement'],
    'clothing':   ['wear', 'clothes', 'shirt', 'dress', 'shoe', 'hat',
                   'coat', 'jacket', 'pants', 'skirt', 'sock', 'glove',
                   'scarf', 'belt', 'fabric', 'cotton', 'fashion', 'style'],
    'people':     ['person', 'people', 'friend', 'man', 'woman',
                   'child', 'human', 'individual', 'community', 'society',
                   'neighbor', 'stranger', 'adult', 'elder', 'baby'],
    'time':       ['time', 'day', 'week', 'month', 'year', 'hour', 'minute',
                   'morning', 'evening', 'night', 'today', 'yesterday',
                   'tomorrow', 'past', 'future', 'season', 'calendar',
                   'second', 'decade', 'century', 'moment', 'period'],
    'culture':    ['art', 'music', 'film', 'book', 'story', 'culture',
                   'tradition', 'religion', 'history', 'language', 'sport',
                   'festival', 'celebrate', 'game', 'dance', 'song', 'play',
                   'poem', 'theater', 'museum', 'concert', 'exhibition'],
    'geography':  ['country', 'city', 'region', 'location',
                   'continent', 'island', 'north', 'south', 'east', 'west',
                   'border', 'capital', 'territory', 'area', 'zone',
                   'village', 'town', 'province', 'district', 'coast'],
    'government': ['law', 'government', 'state', 'politics', 'vote', 'right',
                   'freedom', 'power', 'rule', 'justice', 'court', 'police',
                   'military', 'war', 'peace', 'election', 'party', 'tax',
                   'constitution', 'democracy', 'republic', 'parliament'],
    'science':    ['science', 'research', 'experiment', 'theory', 'fact',
                   'evidence', 'chemistry', 'physics', 'biology', 'math',
                   'laboratory', 'discovery', 'analysis', 'hypothesis',
                   'formula', 'element', 'atom', 'cell', 'organism'],
    'sports':     ['sport', 'play', 'game', 'team', 'ball', 'win', 'lose',
                   'race', 'run', 'jump', 'swim', 'kick', 'score', 'match',
                   'competition', 'athlete', 'coach', 'stadium', 'champion'],
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

# ── Gloss cleaning regexes ───────────────────────────────────────────────────
_PAREN_RE      = re.compile(r'\([^)]*\)')
_BRACKET_RE    = re.compile(r'\[[^\]]*\]')
_SEMI_NOTE_RE  = re.compile(r'\s*;.*')
_DASH_NOTE_RE  = re.compile(r'\s+[-–—]\s+.*')
_COLON_NOTE_RE = re.compile(r'\s*:\s.*')


# ══════════════════════════════════════════════════════════════════════════════
# WIKTIONARY / GOOGLE TRANSLATE
# ══════════════════════════════════════════════════════════════════════════════

_wikt_parser = None


def _get_wikt_parser():
    global _wikt_parser
    if _wikt_parser is None:
        try:
            from wiktionaryparser import WiktionaryParser
            _wikt_parser = WiktionaryParser()
        except ImportError:
            pass
    return _wikt_parser


def try_wiktionary(word: str, lang_code: str) -> Optional[List[str]]:
    """Fetch POS-aware definitions from English Wiktionary."""
    wikt_lang = WIKT_LANG.get(lang_code)
    if not wikt_lang:
        return None
    parser = _get_wikt_parser()
    if parser is None:
        return None
    try:
        result  = parser.fetch(word, wikt_lang)
        glosses = []
        for block in result:
            for defn in block.get('definitions', []):
                texts = defn.get('text', [])
                for text in texts[1:5]:
                    text = text.strip()
                    if text and len(text) > 1:
                        glosses.append(text)
                if len(glosses) >= 6:
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


# ══════════════════════════════════════════════════════════════════════════════
# GLOSS NORMALIZATION
# ══════════════════════════════════════════════════════════════════════════════

def clean_gloss(text: str) -> Optional[str]:
    """
    Strip parentheticals, brackets, usage notes, and trailing punctuation.
    Returns None if the result is empty, too long, or contains bad characters.
    """
    text = _PAREN_RE.sub('', text)
    text = _BRACKET_RE.sub('', text)
    text = _SEMI_NOTE_RE.sub('', text)
    text = _DASH_NOTE_RE.sub('', text)
    text = _COLON_NOTE_RE.sub('', text)
    text = re.sub(r'\s+', ' ', text).strip().strip('.,;:')
    if not text or len(text.split()) > 6:
        return None
    if re.search(r'[<>{}|\\]', text):
        return None
    return text


def normalize_glosses(raw: List[str], pos: str) -> List[str]:
    """
    Clean raw glosses and expand verbs to include both 'to X' and 'X' forms.
    Splits comma-separated items, deduplicates, and caps at 8 results.

    Parentheticals are stripped before comma-splitting so that a gloss like
    "yours (masc, informal)" is not incorrectly split mid-parenthesis.
    """
    seen:   set       = set()
    result: List[str] = []

    def _add(text: str) -> None:
        key = text.lower()
        if key not in seen:
            seen.add(key)
            result.append(text)

    for raw_item in raw:
        pre = _PAREN_RE.sub('', raw_item)
        pre = _BRACKET_RE.sub('', pre).strip()

        parts = [p.strip() for p in re.split(r'[,/]', pre) if p.strip()]
        for part in parts:
            cleaned = clean_gloss(part)
            if not cleaned:
                continue
            if pos == 'verb':
                if cleaned.lower().startswith('to '):
                    with_to = cleaned
                    bare    = cleaned[3:].strip()
                else:
                    bare    = cleaned
                    with_to = 'to ' + cleaned
                _add(with_to)
                _add(bare)
            else:
                _add(cleaned)

    return result[:8]


def build_display(word: str, pos: str, glosses: List[str]) -> str:
    """Pick a single fallback display string from the glosses list."""
    if not glosses:
        return word
    if pos == 'verb':
        for g in glosses:
            if g.lower().startswith('to '):
                return g
    return glosses[0]


# ══════════════════════════════════════════════════════════════════════════════
# GLOSS CACHE
# ══════════════════════════════════════════════════════════════════════════════

def load_gloss_cache(lang: str, cache_dir: Path) -> Dict[str, dict]:
    path = cache_dir / f'gloss_cache_{lang}.jsonl'
    if not path.exists():
        return {}
    cache: Dict[str, dict] = {}
    try:
        for line in path.read_text(encoding='utf-8').splitlines():
            line = line.strip()
            if not line:
                continue
            row  = json.loads(line)
            word = row.pop('word', None)
            if word:
                cache[word] = row
    except Exception:
        pass
    return cache


def save_gloss_cache(lang: str, cache: Dict[str, dict], cache_dir: Path) -> None:
    cache_dir.mkdir(parents=True, exist_ok=True)
    path = cache_dir / f'gloss_cache_{lang}.jsonl'
    with path.open('w', encoding='utf-8') as f:
        for word, entry in cache.items():
            f.write(json.dumps({'word': word, **entry}, ensure_ascii=False) + '\n')


# ══════════════════════════════════════════════════════════════════════════════
# DOMAIN CLASSIFICATION
# ══════════════════════════════════════════════════════════════════════════════

def classify_domains(gloss: str, pos: str, rank: Optional[int],
                     entity_type: Optional[str] = None) -> List[str]:
    """Return domain tags for one entry using whole-word keyword matching."""
    domains:     List[str] = []
    gloss_words: set       = set(re.findall(r'[a-z]+', gloss.lower()))
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
# ENRICHMENT  (glosses + display + domains)
# ══════════════════════════════════════════════════════════════════════════════

def enrich_entries(entries: List[dict], lang: str,
                   cache_dir: Path,
                   fresh: bool = False,
                   batch: Optional[int] = None,
                   no_translate: bool = False,
                   verbose: bool = False) -> List[dict]:
    """
    Add glosses, display strings, and domain tags to all entries.
    Domain classification always runs over every entry so keyword updates
    take effect without needing --fresh.
    """
    cache      = {} if fresh else load_gloss_cache(lang, cache_dir)
    cache_hits = wikt_hits = google_hits = skipped = 0

    needs_gloss = [e for e in entries if not e.get('glosses') or not e.get('display')]
    if batch is not None:
        needs_gloss = needs_gloss[:batch]

    if needs_gloss and not no_translate:
        print(f"  Translating  : {len(needs_gloss)} entries")

    total_needed = len(needs_gloss)
    try:
        for idx, entry in enumerate(needs_gloss):
            word   = entry['word']
            pos    = entry.get('pos', '')
            cached = cache.get(word)

            print(f"\r  [{idx + 1}/{total_needed}]  {word:<25}", end='', flush=True)

            try:
                source   = cached.get('source', 'unknown') if cached else None
                reviewed = cached.get('reviewed', False)   if cached else False
                use_cache = cached is not None and (
                    reviewed or (source in GOOD_SOURCES and bool(cached.get('glosses')))
                )

                if use_cache:
                    raw_glosses  = cached.get('glosses', [])
                    cache_hits  += 1
                elif no_translate:
                    raw_glosses  = []
                    skipped     += 1
                else:
                    raw_glosses = try_wiktionary(word, lang) or []
                    if raw_glosses:
                        wikt_hits += 1
                        cache[word] = {'glosses': raw_glosses, 'source': 'wiktionary'}
                    else:
                        translation = try_google_translate(word, lang)
                        if translation and translation.lower() != word.lower():
                            raw_glosses  = [translation]
                            google_hits += 1
                            cache[word]  = {'glosses': raw_glosses, 'source': 'google'}
                        else:
                            cache[word] = {'glosses': [], 'source': 'empty'}
                    fetched = wikt_hits + google_hits
                    if fetched > 0 and fetched % 50 == 0:
                        save_gloss_cache(lang, cache, cache_dir)

                glosses = normalize_glosses(raw_glosses, pos)
                if glosses:
                    entry['glosses'] = glosses
                    entry['display'] = build_display(word, pos, glosses)

            except Exception as exc:
                skipped += 1
                cache[word] = {'glosses': [], 'source': 'empty'}
                if verbose:
                    print(f"\n  Warning: skipped '{word}' — {type(exc).__name__}: {exc}")

        print()

    except KeyboardInterrupt:
        save_gloss_cache(lang, cache, cache_dir)
        print(f"\n  Interrupted  : {cache_hits} cache  "
              f"{wikt_hits} Wiktionary  {google_hits} Google  {skipped} skipped")
        raise KeyboardInterrupt

    # ── Apply manual corrections ──────────────────────────────────────────────
    # Runs before the cache save so corrected values are persisted as 'reviewed'
    # and before the normalization pass so they're cleaned consistently.
    corrections = GLOSS_CORRECTIONS.get(lang, {})
    if corrections:
        corrected = 0
        for entry in entries:
            override = corrections.get(entry['word'])
            if override:
                entry['glosses'] = override
                entry['display'] = build_display(
                    entry['word'], entry.get('pos', ''), override)
                cache[entry['word']] = {'glosses': override, 'source': 'reviewed'}
                corrected += 1
        if corrected:
            print(f"  Corrections  : {corrected} manual override(s) applied")

    save_gloss_cache(lang, cache, cache_dir)

    if not no_translate and (wikt_hits + google_hits + cache_hits) > 0:
        print(f"  Gloss source : {cache_hits} cache  "
              f"{wikt_hits} Wiktionary  {google_hits} Google  {skipped} skipped")

    # Normalize ALL entries (including hardcoded ones that already had glosses).
    for entry in entries:
        pos         = entry.get('pos', '')
        raw_glosses = entry.get('glosses', [])
        if raw_glosses:
            cleaned = normalize_glosses(raw_glosses, pos)
            if cleaned:
                entry['glosses'] = cleaned
                entry['display'] = build_display(entry['word'], pos, cleaned)

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
