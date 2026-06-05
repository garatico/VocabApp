#!/usr/bin/env python3
"""
download_emoji.py
=================
One-time script to download OpenMoji SVGs for all concepts in visual-map.ts.
Run once from the project root:

    python backend/scripts/download_emoji.py

SVGs land in data/emoji/animals/ and are served by Express at /emoji/*.svg.
No CDN dependency after this runs.
"""

import os
import time
import urllib.request
from pathlib import Path

SCRIPT_DIR   = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent.parent
DEST         = PROJECT_ROOT / 'data' / 'emoji' / 'animals'
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

def download_all():
    DEST.mkdir(parents=True, exist_ok=True)

    already = 0
    downloaded = 0
    failed = []

    total = len(CODES)
    for i, code in enumerate(CODES, 1):
        dest_file = DEST / f'{code}.svg'
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

if __name__ == '__main__':
    print(f'Downloading {len(CODES)} OpenMoji SVGs to {DEST}')
    print(f'Source: {CDN}\n')
    download_all()
