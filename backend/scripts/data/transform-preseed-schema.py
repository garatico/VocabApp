#!/usr/bin/env python3
"""
transform-preseed-schema.py

Transforms French and Portuguese preseed JSONL files to match the Spanish JSON schema.

Usage:
    python backend/scripts/data/transform-preseed-schema.py

Input:
    data/french_preseed.jsonl     - French preseed
    data/portuguese_preseed.jsonl - Portuguese preseed

Output:
    data/french.json      - Transformed to Spanish schema format
    data/portuguese.json  - Transformed to Spanish schema format
"""

import json
from pathlib import Path

# Paths
# backend/scripts/data/ → backend/scripts/ → backend/ → VocabApp/
BASE_DIR     = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parent.parent.parent
DATA_DIR     = PROJECT_ROOT / 'data'

INPUT_FILES = {
    'french':     DATA_DIR / 'french_preseed.jsonl',
    'portuguese': DATA_DIR / 'portuguese_preseed.jsonl',
    'italian':    DATA_DIR / 'italian_preseed.jsonl',
}

OUTPUT_FILES = {
    'french':     DATA_DIR / 'french.json',
    'portuguese': DATA_DIR / 'portuguese.json',
    'italian':    DATA_DIR / 'italian.json',
}

# Read JSONL
def read_jsonl(path: Path) -> list[dict]:
    entries = []
    with open(path, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line:
                entries.append(json.loads(line))
    return entries

# Transform to Spanish schema
def transform_preseed(entries: list[dict]) -> list[dict]:
    """Transform preseed schema to match Spanish JSON schema."""
    cefr_to_difficulty = {'A1': 1, 'A2': 2, 'B1': 3, 'B2': 4, 'C1': 5}
    transformed = []

    for idx, entry in enumerate(entries):
        rank = idx + 1
        difficulty = cefr_to_difficulty.get(entry.get('cefr', 'A1'), 1)

        transformed_entry = {
            'rank': rank,
            'word': entry['word'],
            'display': entry.get('gloss', entry['word']),
            'pos': entry.get('part_of_speech', ''),
            'difficulty': difficulty,
            'tags': entry.get('tags', []),
            'notes': entry.get('notes') or '',
            'glosses': [entry.get('gloss', entry['word'])],
            'examples': [],
            'linguistic': {
                'infinitive': entry.get('infinitive'),
                'reflexive': None,
                'gender': entry.get('gender'),
                'plural': None,
                'register': entry.get('register', 'neutral'),
                'ipa': '',
                'syllables': [],
                'conjugations': None,
            },
            'relations': {
                'commonly_confused_with': [],
                'related': [],
                'synonyms': [],
                'antonyms': [],
            },
            'frequency': {
                'band': entry.get('cefr', 'A1'),
                'rank': rank,
                'corpus_frequency': None,
            },
            'domains': entry.get('usage', ['general']),
            'register': entry.get('register', 'neutral'),
        }

        transformed.append(transformed_entry)

    return transformed

# Process one language
def process_language(lang: str):
    label = lang.capitalize()

    print(f'\n{"=" * 60}')
    print(f'  {label}')
    print(f'{"=" * 60}')

    input_path = INPUT_FILES[lang]

    if not input_path.exists():
        print(f'  X File not found: {input_path}')
        return

    # Read JSONL
    input_data = read_jsonl(input_path)
    print(f'  Loaded {len(input_data)} words from JSONL')

    # Transform to Spanish schema
    transformed = transform_preseed(input_data)

    # Write output
    output_path = OUTPUT_FILES[lang]
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(transformed, f, ensure_ascii=False, indent=2)

    print(f'  * {len(transformed)} words written -> {output_path.name}')

# Entry point
def main():
    print('\n' + '=' * 60)
    print('  Preseed Schema Transformation')
    print('=' * 60)

    for lang in ['french', 'portuguese', 'italian']:
        process_language(lang)

    print('\n* Done. Portuguese and French now match Spanish schema.')

if __name__ == '__main__':
    main()
