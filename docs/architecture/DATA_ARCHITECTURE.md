# Data Architecture Strategy

## Current State

### Spanish (Complete)
- **Source**: `_old-files-backup/old-data/raw/spa_news_*.tar.gz` (corpus files)
- **Enriched Data**: `backend/data/spanish.json` (~1000 words)
- **Structure**: Full metadata with linguistic info, domains, frequency bands, examples, relations

### Portuguese, Italian, French (Stub)
- **Source**: CSV files with ~100 basic words each
- **No enriched JSON** - need to be generated
- **Current structure**: Basic frequency, POS, display, answers

### Data Size Comparison
```
spanish.json     ~ 1MB  (1000 words, full metadata)
portuguese.csv   ~ 2.6KB (100 words, basic)
italian.csv      ~ 2.6KB (100 words, basic)
french.csv       ~ 1.1KB (100 words, basic)
```

---

## Data Pipeline (Current)

```
Raw Sources (CSV/Corpus)
        ↓
    Corpus Builder (Browser UI)
        ↓ (Fetches from APIs)
    Enrichment (Wiktionary, MyMemory)
        ↓
    Validation & Schema Check
        ↓
Generated JSON (backend/data/*.json)
        ↓
    Express Server (API)
        ↓
    Frontend (Browser Cache)
```

---

## Architecture Options

### Option A: Expand CSV Sources → Generate via Pipeline
**Best for**: Control, maintainability, gradual expansion

**Approach**:
1. Create comprehensive CSV frequency lists for each language (1000+ words)
2. Run through corpus-builder to enrich with translations and linguistic data
3. Commit enriched JSON to `backend/data/`
4. Serve via API

**Pros**:
- CSVs are human-readable, version-controlled source of truth
- Easy to update/correct data
- Reproducible pipeline (audit trail)
- Can expand incrementally

**Cons**:
- Need to source/create comprehensive frequency lists
- Time-consuming to enrich via APIs
- API rate limits may slow generation

**Data Sources**:
- Wiktionary frequency lists
- News corpora (Spanish already has)
- Language frequency databases
- OpenSubtitles
- Common word lists

---

### Option B: Use Pre-Built Datasets
**Best for**: Speed, comprehensive coverage

**Approach**:
1. Download pre-built vocabulary datasets for each language
2. Transform to match schema
3. Commit to `backend/data/`

**Pros**:
- Fast deployment
- Already enriched with linguistic data
- Professional quality

**Cons**:
- License restrictions (check if compatible with MIT)
- Less control over content
- May not match schema exactly

**Sources**:
- Wiktionary export
- OpenMultiLingual Wordnet
- Language-specific frequency lists
- Spaced repetition databases (Anki, Memrise)

---

### Option C: Hybrid Approach (Recommended)
**Best for**: Balance of speed and quality

**Approach**:
1. Keep Spanish as-is (already complete)
2. For Portuguese, Italian, French:
   - Extend CSV sources to ~1000 words using open frequency databases
   - Generate enriched JSON via corpus-builder
   - Commit to `backend/data/`

**Implementation**:
```
data/
├── sources/                    ← Source CSVs (version controlled)
│   ├── spanish.csv (1000+ words)
│   ├── portuguese.csv (expand to 1000+)
│   ├── italian.csv (expand to 1000+)
│   └── french.csv (expand to 1000+)
│
├── generated/                  ← Generated JSONs (commit to repo)
│   ├── spanish.json (1000 words, full metadata)
│   ├── portuguese.json (1000 words, full metadata)
│   ├── italian.json (1000 words, full metadata)
│   └── french.json (1000 words, full metadata)
│
└── scripts/
    └── generate-vocabulary.js  ← Build script to regenerate from CSVs
```

---

## Recommended Implementation

### Phase 1: Prepare Source Data
1. **Identify sources** for each language's top 1000 words
2. **Create/expand CSV files** to 1000 rows with: rank, word, display, answers, pos, difficulty, tags, notes
3. **Validate CSV structure** against schema

### Phase 2: Build Generation Pipeline
1. **Create Node.js script** (`scripts/generate-vocabulary.js`):
   ```javascript
   // Reads CSVs from data/sources/
   // Processes through enrichment APIs
   // Validates against schema
   // Outputs to backend/data/
   ```

2. **Add npm script** to package.json:
   ```json
   "generate:vocab": "node scripts/generate-vocabulary.js"
   ```

3. **Implement caching/batching**:
   - Cache API results locally
   - Batch requests to respect rate limits
   - Skip already-enriched words

### Phase 3: Automate
1. **Pre-commit hook**: Validate CSVs before commits
2. **Documentation**: How to regenerate if source data changes
3. **Version tracking**: Track which words have been enriched

---

## Proposed File Structure

```
vocab-app/
├── backend/
│   └── data/
│       ├── spanish.json      ← Served by /api/vocab/spanish
│       ├── portuguese.json   ← Served by /api/vocab/portuguese
│       ├── italian.json      ← Served by /api/vocab/italian
│       └── french.json       ← Served by /api/vocab/french
│
├── data/
│   └── sources/              ← CSV source files
│       ├── spanish.csv       (1000+ words)
│       ├── portuguese.csv    (1000+ words)
│       ├── italian.csv       (1000+ words)
│       └── french.csv        (1000+ words)
│
├── scripts/
│   └── generate-vocabulary.js ← Generation pipeline
│
└── docs/
    └── DATA_ARCHITECTURE.md   (this file)
```

---

## Word Schema (All Languages Must Match)

```javascript
{
  "rank": 1,                           // Position in frequency list
  "word": "de",                        // Source word
  "display": "of / from",              // English gloss
  "pos": "preposition",                // Part of speech
  "difficulty": 1,                     // 1-5 scale
  "tags": ["common", "frequent"],      // Metadata tags
  "notes": "",                         // Usage notes
  "glosses": ["of", "from"],           // Translation options
  "examples": [],                      // Example sentences
  "linguistic": {
    "infinitive": null,
    "reflexive": null,
    "gender": null,
    "plural": null,
    "register": "neutral",             // formal, informal, technical, neutral
    "ipa": "",
    "syllables": [],
    "conjugations": null
  },
  "relations": {
    "commonly_confused_with": [],
    "related": [],
    "synonyms": [],
    "antonyms": []
  },
  "frequency": {
    "band": "B1",                      // CEFR level
    "rank": 1,
    "corpus_frequency": null
  },
  "domains": ["general"]               // semantic domains
}
```

---

## Action Items

Choose one:

1. **Quick Start** (Option C - Hybrid):
   - Extend Portuguese/Italian/French CSVs to ~500 words (quick database search)
   - Generate JSON via corpus-builder
   - Commit all 4 languages to backend/data/

2. **Comprehensive** (Option C - Full):
   - Same as Quick Start but expand to 1000 words per language
   - Better coverage for learners

3. **Data-Driven** (Option A - Full Pipeline):
   - Build generation script now
   - Automate enrichment for all future updates
   - Cleanest long-term solution

---

## Which approach do you prefer?

**Question for you**: 
- Do you want to **minimize time to MVP** (quick expanded CSVs → generate JSON)?
- Or **build the right infrastructure now** (full generation pipeline with scripts)?
- Do you want **deep linguistic data** (full enrichment with examples, conjugations)?
- Or **pragmatic depth** (just glosses, POS, frequency)?

Your answer determines which of Options A/B/C we implement.
