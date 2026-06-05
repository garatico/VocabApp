#!/usr/bin/env python3
"""
download_images.py
==================
One-time script to download representative photos for picture quiz mode.

Sources (tried in order per concept):
  1. Wikipedia REST API  (encyclopedic, well-labelled)
  2. iNaturalist API     (great for animals, designed for bulk access)

Run from the project root:
    python backend/scripts/download_images.py

Requires: pip install requests

Images land in data/images/{domain}/{concept}.jpg|png and are served by Express at
/images/{concept}.jpg (each domain subfolder is mounted at /images/).
Re-run safely -- already-downloaded files are skipped.
"""

import json
import sys
import time
from pathlib import Path

try:
    import requests
except ImportError:
    print('ERROR: requests library required.')
    print('  pip install requests')
    sys.exit(1)

SCRIPT_DIR   = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent.parent
IMAGES_ROOT  = PROJECT_ROOT / 'data' / 'images'

# Domain classification — determines which subfolder each concept lands in.
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
SESSION = requests.Session()
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


def main():
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


if __name__ == '__main__':
    main()
