"""
lib/visuals.py — images, emoji, and Picture Quiz coverage
=========================================================
Picture Quiz needs a photo or an emoji for every word it shows. This module
fetches those assets and reports on the gaps:

    fetch_images()      Wikipedia / iNaturalist photos -> data/images/
    fetch_emoji()       OpenMoji SVGs                  -> data/emoji/
    coverage_report()   which words visual-map.ts still can't illustrate

The two fetchers are the one part of the pipeline that reaches out to the
network on every run, and they write only into data/images/ and data/emoji/.
They never touch the curated JSONL or the database, which is why they sit
outside the `all` chain and are run on demand.
"""

import json
import re
import sys
import time
import unicodedata
import urllib.request
from collections import defaultdict
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple

from .config import EMOJI_DIR, IMAGES_DIR, LANG_NAMES, VISUAL_MAP, curated_path

try:
    import requests
except ImportError:
    requests = None


# ══════════════════════════════════════════════════════════════════════════════
# IMAGES — Wikipedia photos, with iNaturalist as the fallback for animals
# ══════════════════════════════════════════════════════════════════════════════

IMAGES_ROOT = IMAGES_DIR

FOOD_CONCEPTS   = {'apple', 'beer', 'bread', 'coffee', 'meat', 'milk', 'rice', 'wine'}
NATURE_CONCEPTS = {'fire', 'forest', 'flower', 'moon', 'mountain', 'ocean', 'river', 'sun', 'tree', 'water'}

def dest_for(concept: str) -> Path:
    if concept in FOOD_CONCEPTS:
        return IMAGES_ROOT / 'food'
    if concept in NATURE_CONCEPTS:
        return IMAGES_ROOT / 'nature'
    return IMAGES_ROOT / 'animals'

DEST = IMAGES_ROOT  # kept for already_exists() helper below

# Shared session -- handles cookies, redirects, keep-alive like a real browser
SESSION = requests.Session() if requests else None
SESSION.headers.update({
    'User-Agent': (
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
        'AppleWebKit/537.36 (KHTML, like Gecko) '
        'Chrome/120.0.0.0 Safari/537.36'
    ),
    'Accept':          'image/webp,image/png,image/*,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer':         'https://en.wikipedia.org/',
})

# concept -> [Wikipedia article titles to try]
WIKIPEDIA = {
    'dog':          ['Domestic_dog'],
    'puppy':        ['Puppy'],
    'cat':          ['Cat'],
    'kitten':       ['Kitten'],
    'horse':        ['Horse'],
    'foal':         ['Foal'],
    'cow':          ['Domestic_cattle', 'Cattle'],
    'calf':         ['Calf'],
    'pig':          ['Domestic_pig'],
    'sheep':        ['Sheep'],
    'lamb':         ['Lamb'],
    'goat':         ['Domestic_goat', 'Goat'],
    'donkey':       ['Donkey'],
    'rabbit':       ['Domestic_rabbit', 'Rabbit'],
    'hamster':      ['Hamster'],
    'guinea_pig':   ['Guinea_pig'],
    'wolf':         ['Gray_wolf'],
    'fox':          ['Red_fox'],
    'bear':         ['Brown_bear'],
    'deer':         ['Deer', 'White-tailed_deer'],
    'monkey':       ['Rhesus_macaque', 'Monkey'],
    'gorilla':      ['Gorilla'],
    'elephant':     ['African_bush_elephant', 'Elephant'],
    'giraffe':      ['Giraffe'],
    'rhinoceros':   ['White_rhinoceros', 'Rhinoceros'],
    'hippopotamus': ['Hippopotamus'],
    'zebra':        ['Plains_zebra', 'Zebra'],
    'camel':        ['Dromedary', 'Camel'],
    'llama':        ['Llama'],
    'lion':         ['Lion'],
    'tiger':        ['Tiger'],
    'leopard':      ['Leopard'],
    'cheetah':      ['Cheetah'],
    'jaguar':       ['Jaguar'],
    'panther':      ['Black_panther'],
    'lynx':         ['Lynx'],
    'squirrel':     ['Eastern_gray_squirrel', 'Squirrel'],
    'hedgehog':     ['European_hedgehog', 'Hedgehog'],
    'bat':          ['Little_brown_bat', 'Bat'],
    'otter':        ['North_American_river_otter', 'Otter'],
    'mouse':        ['House_mouse', 'Mouse'],
    'whale':        ['Blue_whale', 'Whale'],
    'dolphin':      ['Common_bottlenose_dolphin', 'Dolphin'],
    'shark':        ['Great_white_shark', 'Shark'],
    'seal':         ['Harbor_seal', 'Pinniped'],
    'octopus':      ['Common_octopus', 'Octopus'],
    'shrimp':       ['Shrimp'],
    'lobster':      ['American_lobster', 'Lobster'],
    'crab':         ['Crab'],
    'fish':         ['Atlantic_cod', 'Fish'],
    'salmon':       ['Atlantic_salmon', 'Salmon'],
    'jellyfish':    ['Aurelia_aurita', 'Jellyfish'],
    'bird':         ['Eurasian_blue_tit', 'Bird'],
    'eagle':        ['Bald_eagle', 'Eagle'],
    'falcon':       ['Peregrine_falcon', 'Falcon'],
    'duck':         ['Mallard', 'Duck'],
    'owl':          ['Barn_owl', 'Owl'],
    'peacock':      ['Indian_peafowl', 'Peafowl'],
    'parrot':       ['Budgerigar', 'Parrot'],
    'penguin':      ['Emperor_penguin', 'Penguin'],
    'flamingo':     ['Greater_flamingo', 'Flamingo'],
    'swan':         ['Mute_swan', 'Swan'],
    'rooster':      ['Rooster'],
    'chicken':      ['Hen', 'Free-range_chicken', 'Chicken'],  # target hen/white chicken, not rooster
    'turkey':       ['Wild_turkey'],
    'stork':        ['White_stork'],
    'sparrow':      ['House_sparrow', 'Sparrow'],
    'crow':         ['American_crow', 'Crow'],
    'seagull':      ['Herring_gull', 'Gull'],
    'heron':        ['Grey_heron', 'Heron'],
    'frog':         ['Common_frog', 'Frog'],
    'turtle':       ['Green_sea_turtle', 'Turtle'],
    'lizard':       ['Common_wall_lizard', 'Lizard'],
    'snake':        ['Corn_snake', 'Snake'],
    'crocodile':    ['Nile_crocodile', 'Crocodile'],
    'scorpion':     ['Deathstalker', 'Scorpion'],
    'bee':          ['Western_honey_bee', 'Honey_bee'],
    'butterfly':    ['Monarch_butterfly', 'Butterfly'],
    'ant':          ['Red_fire_ant', 'Ant'],
    'mosquito':     ['Aedes_aegypti', 'Mosquito'],
    'cricket':      ['Field_cricket', 'Cricket_(insect)'],
    'grasshopper':  ['Locust', 'Grasshopper'],
    'beetle':       ['Coccinellidae', 'Beetle'],
    'cockroach':    ['German_cockroach', 'Cockroach'],
    'spider':       ['Garden_spider', 'Spider'],
    'snail':        ['Garden_snail', 'Snail'],
    'worm':         ['Common_earthworm', 'Earthworm'],
    'dragonfly':    ['Dragonfly'],
    'caterpillar':  ['Caterpillar'],
    'flea':         ['Cat_flea', 'Flea'],
    'water':        ['Water'],
    'fire':         ['Fire'],
    'mountain':     ['Mont_Blanc', 'Mountain'],
    'forest':       ['Forest'],
    'tree':         ['Oak', 'Tree'],
    'flower':       ['Rose', 'Flower'],
    'sun':          ['Sun'],
    'moon':         ['Moon'],
    'river':        ['Amazon_River', 'River'],
    'ocean':        ['Pacific_Ocean', 'Ocean'],
    'apple':        ['Apple'],
    'bread':        ['Bread'],
    'meat':         ['Beef', 'Meat'],
    'rice':         ['Rice'],
    'milk':         ['Milk'],
    'wine':         ['Wine'],
    'beer':         ['Beer'],
    'coffee':       ['Coffee'],
}

# iNaturalist search terms for animal fallbacks
INATURALIST = {
    'cow': 'Bos taurus', 'calf': 'Bos taurus', 'pig': 'Sus scrofa',
    'lamb': 'Ovis aries', 'goat': 'Capra aegagrus', 'donkey': 'Equus asinus',
    'rabbit': 'Oryctolagus cuniculus', 'hamster': 'Mesocricetus auratus',
    'guinea_pig': 'Cavia porcellus', 'wolf': 'Canis lupus', 'fox': 'Vulpes vulpes',
    'bear': 'Ursus arctos', 'deer': 'Odocoileus virginianus', 'monkey': 'Macaca mulatta',
    'gorilla': 'Gorilla gorilla', 'elephant': 'Loxodonta africana',
    'giraffe': 'Giraffa camelopardalis', 'rhinoceros': 'Ceratotherium simum',
    'hippopotamus': 'Hippopotamus amphibius', 'zebra': 'Equus quagga',
    'camel': 'Camelus dromedarius', 'llama': 'Lama glama', 'lion': 'Panthera leo',
    'tiger': 'Panthera tigris', 'leopard': 'Panthera pardus', 'cheetah': 'Acinonyx jubatus',
    'jaguar': 'Panthera onca', 'lynx': 'Lynx lynx', 'squirrel': 'Sciurus carolinensis',
    'hedgehog': 'Erinaceus europaeus', 'bat': 'Myotis lucifugus',
    'otter': 'Lontra canadensis', 'mouse': 'Mus musculus',
    'whale': 'Balaenoptera musculus', 'dolphin': 'Tursiops truncatus',
    'shark': 'Carcharodon carcharias', 'seal': 'Phoca vitulina',
    'octopus': 'Octopus vulgaris', 'shrimp': 'Penaeus monodon',
    'lobster': 'Homarus americanus', 'crab': 'Cancer pagurus',
    'fish': 'Gadus morhua', 'salmon': 'Salmo salar', 'jellyfish': 'Aurelia aurita',
    'eagle': 'Haliaeetus leucocephalus', 'falcon': 'Falco peregrinus',
    'duck': 'Anas platyrhynchos', 'owl': 'Tyto alba', 'peacock': 'Pavo cristatus',
    'parrot': 'Melopsittacus undulatus', 'penguin': 'Aptenodytes forsteri',
    'flamingo': 'Phoenicopterus roseus', 'swan': 'Cygnus olor',
    'rooster': 'Gallus gallus', 'chicken': 'Gallus gallus domesticus',
    'sparrow': 'Passer domesticus', 'crow': 'Corvus brachyrhynchos',
    'seagull': 'Larus argentatus', 'heron': 'Ardea cinerea',
    'frog': 'Rana temporaria', 'turtle': 'Chelonia mydas',
    'lizard': 'Podarcis muralis', 'snake': 'Pantherophis guttatus',
    'crocodile': 'Crocodylus niloticus', 'scorpion': 'Leiurus quinquestriatus',
    'bee': 'Apis mellifera', 'butterfly': 'Danaus plexippus', 'ant': 'Solenopsis invicta',
    'mosquito': 'Aedes aegypti', 'cricket': 'Gryllus campestris',
    'grasshopper': 'Locusta migratoria', 'beetle': 'Coccinella septempunctata',
    'cockroach': 'Blattella germanica', 'spider': 'Araneus diadematus',
    'snail': 'Cornu aspersum', 'worm': 'Lumbricus terrestris',
    'dragonfly': 'Libellula depressa', 'caterpillar': 'Danaus plexippus',
    'flea': 'Ctenocephalides felis',
}


def wikipedia_image_url(title: str) -> str | None:
    """Fetch the full-resolution original image URL from Wikipedia.
    Uses the REST summary API which returns originalimage (full res) and
    thumbnail (fallback). No size cap — we control pacing via request delays."""
    try:
        r = SESSION.get(
            f'https://en.wikipedia.org/api/rest_v1/page/summary/{title}',
            timeout=10,
        )
        if r.status_code == 404:
            return None
        r.raise_for_status()
        data = r.json()
        # originalimage = full resolution original file (best quality)
        # thumbnail = smaller CDN version (fallback if no original)
        return (data.get('originalimage') or data.get('thumbnail') or {}).get('source')
    except Exception:
        return None


def inaturalist_photo(taxon_name: str) -> str | None:
    url = 'https://api.inaturalist.org/v1/taxa'
    try:
        r = SESSION.get(url, params={'q': taxon_name, 'per_page': 1}, timeout=10)
        r.raise_for_status()
        results = r.json().get('results', [])
        if not results:
            return None
        photo = results[0].get('default_photo', {})
        # Use medium_url for reasonable file size
        return photo.get('medium_url') or photo.get('square_url')
    except Exception:
        return None


def download(url: str, dest: Path) -> tuple[bool, bool]:
    """Download url to dest. Returns (success, was_rate_limited).
    On 429 returns immediately — caller should switch source, not retry same URL."""
    try:
        r = SESSION.get(url, timeout=30, stream=True)
        if r.status_code == 429:
            print(f'      rate limited — switching to iNaturalist')
            return False, True
        r.raise_for_status()
        data = r.content
        if len(data) < 1000:
            print(f'      too small ({len(data)}B), skipping')
            return False, False
        dest.write_bytes(data)
        return True, False
    except requests.exceptions.Timeout:
        print(f'      timeout')
        return False, False
    except Exception as e:
        print(f'      download error: {e}')
        return False, False


def already_exists(concept: str) -> Path | None:
    for ext in ('.jpg', '.jpeg', '.png', '.webp'):
        p = dest_for(concept) / f'{concept}{ext}'
        if p.exists() and p.stat().st_size > 1000:
            return p
    return None


def ext_for(url: str) -> str:
    u = url.lower().split('?')[0]
    for e in ('.png', '.webp', '.gif', '.svg'):
        if u.endswith(e):
            return e
    return '.jpg'


def fetch_images() -> None:
    """Download every photo referenced by visual-map.ts that is not already local."""
    if requests is None:
        sys.exit('The requests library is required for image downloads: pip install requests')
    for sub in ('animals', 'food', 'nature'):
        (IMAGES_ROOT / sub).mkdir(parents=True, exist_ok=True)
    total = len(WIKIPEDIA)
    ok = skipped = 0
    failed = []

    print(f'Downloading {total} images -> {DEST}\n')

    for i, (concept, wiki_titles) in enumerate(WIKIPEDIA.items(), 1):
        if already_exists(concept):
            print(f'  [{i:3}/{total}] skip  {concept}')
            skipped += 1
            continue

        image_url = None
        source = None

        # 1. Try Wikipedia (full resolution original)
        for title in wiki_titles:
            image_url = wikipedia_image_url(title)
            if image_url:
                source = f'wiki:{title}'
                break
            time.sleep(0.5)

        # 2. Try iNaturalist for animals
        if not image_url and concept in INATURALIST:
            time.sleep(0.2)
            image_url = inaturalist_photo(INATURALIST[concept])
            if image_url:
                source = f'inat:{INATURALIST[concept]}'

        if not image_url:
            print(f'  [{i:3}/{total}] FAIL  {concept:<20} no image found')
            failed.append(concept)
            continue

        dest_file = dest_for(concept) / f'{concept}{ext_for(image_url)}'
        success, rate_limited = download(image_url, dest_file)

        # On 429 from Wikipedia, immediately try iNaturalist
        if not success and rate_limited and concept in INATURALIST:
            time.sleep(1.0)
            image_url = inaturalist_photo(INATURALIST[concept])
            if image_url:
                source = f'inat:{INATURALIST[concept]}'
                dest_file = dest_for(concept) / f'{concept}{ext_for(image_url)}'
                success, _ = download(image_url, dest_file)

        if success:
            kb = dest_file.stat().st_size // 1024
            print(f'  [{i:3}/{total}] ok    {concept:<20} {kb:4}KB  ({source})')
            ok += 1
        else:
            failed.append(concept)
            print(f'  [{i:3}/{total}] FAIL  {concept:<20} download failed')

        time.sleep(1.5)  # 1.5s between each concept — polite, avoids rate limits

    print(f'\n{"="*50}')
    print(f'Downloaded : {ok}')
    print(f'Skipped    : {skipped}')
    print(f'Failed     : {len(failed)}')
    if failed:
        print(f'Failed     : {failed}')


# ══════════════════════════════════════════════════════════════════════════════
# EMOJI — OpenMoji SVGs
# ══════════════════════════════════════════════════════════════════════════════

EMOJI_DEST = EMOJI_DIR / 'animals'
CDN          = 'https://cdn.jsdelivr.net/npm/openmoji@15.0.0/color/svg'

# All codepoints referenced in visual-map.ts
CODES = [
    # Mammals
    '1F401',  # rat
    '1F404',  # cow
    '1F406',  # leopard
    '1F407',  # rabbit
    '1F40A',  # crocodile
    '1F40B',  # whale
    '1F40C',  # snail
    '1F40D',  # snake
    '1F40E',  # horse (face)
    '1F410',  # goat
    '1F411',  # sheep
    '1F412',  # monkey
    '1F413',  # rooster
    '1F415',  # dog (face)
    '1F416',  # pig (face)
    '1F417',  # boar
    '1F418',  # elephant
    '1F419',  # octopus
    '1F41B',  # bug
    '1F41C',  # ant
    '1F41D',  # honeybee
    '1F41F',  # fish
    '1F422',  # turtle
    '1F426',  # bird
    '1F427',  # penguin
    '1F42A',  # camel
    '1F42C',  # dolphin
    '1F42F',  # tiger face
    '1F434',  # horse face
    '1F437',  # pig face
    '1F438',  # frog
    '1F439',  # hamster
    '1F43A',  # wolf
    '1F43B',  # bear
    '1F43F',  # chipmunk/squirrel
    # New-ish animals
    '1F980',  # crab
    '1F981',  # lion
    '1F982',  # scorpion
    '1F983',  # turkey
    '1F985',  # eagle
    '1F986',  # duck
    '1F987',  # bat
    '1F988',  # shark
    '1F989',  # owl
    '1F98A',  # fox
    '1F98B',  # butterfly
    '1F98C',  # deer
    '1F98D',  # gorilla
    '1F98E',  # lizard
    '1F98F',  # rhinoceros
    '1F990',  # shrimp
    '1F992',  # giraffe
    '1F993',  # zebra
    '1F994',  # hedgehog
    '1F997',  # cricket
    '1F999',  # llama
    '1F99A',  # peacock
    '1F99B',  # hippopotamus
    '1F99C',  # parrot
    '1F99E',  # lobster
    '1F99F',  # mosquito
    '1F9A2',  # swan
    '1F9A6',  # otter
    '1F9A9',  # flamingo
    '1F9AD',  # seal
    '1F414',  # chicken (animal)
    '1F431',  # cat face (kitten)
    '1F436',  # dog face (puppy)
    '1FAB3',  # cockroach
    '1FAAF',  # donkey (unicode 15)
    '1FAB2',  # beetle
]


def fetch_emoji() -> None:
    """Download the OpenMoji SVGs referenced by visual-map.ts."""
    EMOJI_DEST.mkdir(parents=True, exist_ok=True)

    already = 0
    downloaded = 0
    failed = []

    total = len(CODES)
    for i, code in enumerate(CODES, 1):
        dest_file = EMOJI_DEST / f'{code}.svg'
        if dest_file.exists() and dest_file.stat().st_size > 100:
            already += 1
            print(f'  [{i:2}/{total}] skip  {code}  (already exists)')
            continue

        url = f'{CDN}/{code}.svg'
        try:
            urllib.request.urlretrieve(url, dest_file)
            size = dest_file.stat().st_size
            print(f'  [{i:2}/{total}] ok    {code}  ({size:,} bytes)')
            downloaded += 1
            time.sleep(0.05)  # polite pause
        except Exception as e:
            print(f'  [{i:2}/{total}] FAIL  {code}  ({e})')
            failed.append(code)

    print(f'\nDone.')
    print(f'  Downloaded : {downloaded}')
    print(f'  Skipped    : {already}')
    print(f'  Failed     : {len(failed)}')
    if failed:
        print(f'  Failed codes: {failed}')
        print('\nFailed SVGs will fall back to the CDN at runtime.')
    else:
        print('\nAll SVGs are local. You can now point visual-map.ts at /emoji/*.svg')
        print('and remove the CDN fallback.')


# ══════════════════════════════════════════════════════════════════════════════
# COVERAGE — what Picture Quiz still can't illustrate
# ══════════════════════════════════════════════════════════════════════════════

def norm(s: str) -> str:
    """Normalise a word the same way visual-map.ts does."""
    return (
        unicodedata.normalize('NFD', s.lower().strip())
        .encode('ascii', 'ignore')
        .decode()
        .replace(' ', ' ')  # collapse internal spaces
    )


def parse_visual_map(lang: str = 'spanish') -> tuple[set, set]:
    """
    Parse visual-map.ts and return:
      (concepts_words, image_words)
    where each is a set of normalised words that have a visual.
    """
    content = VISUAL_MAP.read_text(encoding='utf-8')

    # ── CONCEPTS array: words with SVG or emoji ──────────────────────────────
    concepts_words: set[str] = set()
    for m in re.finditer(
        rf"{lang}:\s*\[([^\]]+)\]",
        content
    ):
        for w in re.findall(r"'([^']+)'", m.group(1)):
            concepts_words.add(norm(w))

    # ── IMAGES dict: words with a local photo ────────────────────────────────
    # Extract section between "const IMAGES" and the closing "};"
    img_match = re.search(r'const IMAGES[^{]*\{(.*?)\};', content, re.DOTALL)
    image_words: set[str] = set()
    if img_match:
        for key in re.findall(r"'([^']+)'\s*:", img_match.group(1)):
            image_words.add(norm(key))

    return concepts_words, image_words




def check_coverage(
    entries: list[dict],
    concepts_words: set,
    image_words: set,
) -> tuple[list[dict], list[dict]]:
    """Split entries into (covered, uncovered)."""
    covered   = []
    uncovered = []

    for e in entries:
        w = norm(e.get('word', ''))
        has_visual = (
            w in concepts_words
            or w in image_words
            or bool(e.get('emoji'))
        )
        if has_visual:
            covered.append(e)
        else:
            uncovered.append(e)

    return covered, uncovered


def summarise(entries: list[dict], label: str) -> None:
    by_pos    = defaultdict(int)
    by_domain = defaultdict(int)
    by_band   = defaultdict(int)

    for e in entries:
        by_pos[e.get('pos') or 'unknown'] += 1
        for d in (e.get('domains') or ['none']):
            by_domain[d] += 1
        by_band[e.get('difficulty') or e.get('band') or '?'] += 1

    print(f'\n  By POS ({label}):')
    for pos, n in sorted(by_pos.items(), key=lambda x: -x[1])[:8]:
        print(f'    {pos:15s} {n}')

    print(f'\n  By domain ({label}, top 10):')
    for dom, n in sorted(by_domain.items(), key=lambda x: -x[1])[:10]:
        print(f'    {dom:20s} {n}')

def coverage_report(lang: str = 'spa', top: int = 30,
                    domains: Optional[List[str]] = None,
                    pos: Optional[List[str]] = None,
                    covered_only: bool = False,
                    show_all: bool = False) -> None:
    """Report which words Picture Quiz can and cannot illustrate. Read-only."""
    from . import curated

    lang_name = LANG_NAMES[lang]
    print(f'Visual coverage check — {lang_name.upper()}')
    print(f'  visual-map.ts : {VISUAL_MAP}')

    # ── Parse visual-map ─────────────────────────────────────────────────────
    concepts_words, image_words = parse_visual_map(lang_name)
    all_covered_words = concepts_words | image_words
    print(f'  CONCEPTS words: {len(concepts_words)}')
    print(f'  IMAGES words  : {len(image_words)}')
    print(f'  Total mapped  : {len(all_covered_words)} unique words')

    # ── Load JSONL ───────────────────────────────────────────────────────────
    entries = curated.read(lang)
    if not entries:
        return
    print(f'  JSONL entries : {len(entries)}')

    # ── Compute coverage ─────────────────────────────────────────────────────
    covered, uncovered = check_coverage(entries, concepts_words, image_words)
    pct = len(covered) / len(entries) * 100 if entries else 0

    print(f'\n  ✓ Covered  : {len(covered):>5}  ({pct:.1f}%)')
    print(f'  ✗ Uncovered: {len(uncovered):>5}  ({100 - pct:.1f}%)')

    # ── Apply filters ────────────────────────────────────────────────────────
    target = covered if covered_only else uncovered
    label  = 'covered' if covered_only else 'uncovered'

    if domains:
        target = [
            e for e in target
            if any(d in (e.get('domains') or []) for d in domains)
        ]
        print(f'  Filtered to domains {domains}: {len(target)} {label}')

    if pos:
        target = [e for e in target if e.get('pos') in pos]
        print(f'  Filtered to pos {pos}: {len(target)} {label}')

    # ── Summary breakdown ─────────────────────────────────────────────────────
    summarise(target, label)

    # ── Word list ─────────────────────────────────────────────────────────────
    # Sort uncovered by frequency rank (most common first = highest priority)
    target_sorted = sorted(target, key=lambda e: e.get('rank') or 9999)
    limit = len(target_sorted) if show_all else top

    action = 'covered' if covered_only else f'top {limit} uncovered (by frequency rank)'
    print(f'\n  {action.capitalize()} words:\n')
    print(f'  {"rank":>5}  {"word":25s}  {"translation":25s}  {"pos":12s}  {"domains"}')
    print(f'  {"-"*5}  {"-"*25}  {"-"*25}  {"-"*12}  {"-"*20}')

    for e in target_sorted[:limit]:
        rank    = e.get('rank') or '–'
        word    = e.get('word', '')[:25]
        display = (e.get('translation') or '')[:25]
        pos     = (e.get('pos') or '')[:12]
        domains = ', '.join((e.get('domains') or []))[:30]
        print(f'  {str(rank):>5}  {word:25s}  {display:25s}  {pos:12s}  {domains}')

    if not show_all and len(target_sorted) > limit:
        print(f'\n  … and {len(target_sorted) - limit} more. Use --all to see everything.')

    # ── Sanity check: visual-map words missing from JSONL ─────────────────────
    jsonl_words = {norm(e['word']) for e in entries}
    phantom = all_covered_words - jsonl_words
    if phantom:
        print(f'\n  ⚠ {len(phantom)} visual-map entries have no matching JSONL word')
        print(f'  (stale mappings or typos):')
        for w in sorted(phantom)[:20]:
            print(f'    {w}')
        if len(phantom) > 20:
            print(f'    … and {len(phantom) - 20} more')
    else:
        print(f'\n  ✓ All visual-map entries match a JSONL word')
