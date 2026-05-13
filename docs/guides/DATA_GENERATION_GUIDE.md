# Data Generation System

Efficient, rules-based vocabulary generation with minimal API usage.

## Architecture

```
CSV Sources (rank, word, gloss, POS, etc.)
        ↓
Generate from CSV (convert to schema)
        ↓
Enrich with Rules (conjugations, gender, IPA)
        ↓
Enriched JSON (backend/data/*.json)
        ↓
Serve via API
```

## Zero API Approach

Instead of calling translation/linguistic APIs, we use **deterministic rules**:

### 1. Spanish Verb Conjugations
- **Regular patterns**: -ar, -er, -ir verbs follow predictable rules
- **Irregular list**: ~8 common irregular verbs (ser, estar, haber, tener, hacer, ir, poder, dar, saber)
- **No API needed**: All conjugations generated from rules

**File**: `scripts/data/spanish-verb-conjugations.js`

```javascript
// Example: Generate conjugations for "hablar"
generateVerbConjugations('hablar', 'verb')
// Output: { present: { yo: 'hablo', tú: 'hablas', ... }, preterite: { ... } }
```

### 2. Spanish Gender & Number
- **Gender inference**: Rules based on word endings (-a = feminine, -o = masculine, etc.)
- **Plural generation**: Deterministic rules (-s, -es, special cases)
- **Exceptions list**: ~20 common words that don't follow patterns

**File**: `scripts/data/spanish-gender-patterns.js`

```javascript
// Example: Infer gender and plural
inferNounInfo('casa', 'noun')
// Output: { gender: 'f', plural: 'casas', definiteArticle: 'la' }
```

### 3. Spanish IPA (Lookup Table)
- **High-frequency words**: 100+ common words with verified IPA
- **Rules approach**: For others, leave empty (can be enriched later via API)
- **MVP: 100+ words covered** (~10% of vocabulary)

**File**: `scripts/data/spanish-ipa.js`

```javascript
getIPA('día')  // '[ˈdi.a]'
getIPA('rare-word')  // '' (empty for uncommon words)
```

---

## Scripts

### 1. Generate from CSV
Convert CSV source files to JSON vocabulary schema.

```bash
node scripts/generate-from-csv.js [language]

# Examples:
node scripts/generate-from-csv.js spanish
node scripts/generate-from-csv.js portuguese
node scripts/generate-from-csv.js italian
node scripts/generate-from-csv.js french
```

**What it does**:
- Loads CSV from `data/sources/{language}.csv` or backup location
- Parses columns: rank, word, display, pos, difficulty, tags, notes, etc.
- Converts to vocabulary JSON schema
- Assigns CEFR bands based on frequency rank
- Saves to `backend/data/{language}.json`

### 2. Enrich Vocabulary
Add linguistic data using rules (conjugations, gender, IPA).

```bash
node scripts/enrich-vocabulary.js [language]

# Examples:
node scripts/enrich-vocabulary.js spanish
```

**What it does** (Spanish):
- Generates verb conjugations
- Infers gender and plural for nouns
- Adds IPA from lookup table
- Reports enrichment statistics
- Overwrites existing JSON

### 3. Generate All (Master Script)
One command to generate all languages.

```bash
node scripts/generate-all-vocabulary.js
```

**Workflow**:
1. Generate Portuguese, Italian, French from CSVs
2. Enrich Spanish with rules
3. Report completion

---

## Adding to package.json

```json
{
  "scripts": {
    "generate:vocab": "node scripts/generate-all-vocabulary.js",
    "generate:vocab:spanish": "node scripts/generate-from-csv.js spanish",
    "generate:vocab:portuguese": "node scripts/generate-from-csv.js portuguese",
    "generate:vocab:italian": "node scripts/generate-from-csv.js italian",
    "generate:vocab:french": "node scripts/generate-from-csv.js french",
    "enrich:spanish": "node scripts/enrich-vocabulary.js spanish"
  }
}
```

---

## Workflow: MVP to Production

### MVP Phase (Now)
```
1. Run: npm run generate:vocab
   → Generates Portuguese, Italian, French from CSV stubs
   → Enriches Spanish with conjugations, gender, IPA

2. Result: 4 languages with basic-to-moderate enrichment
   - Spanish: 1000 words, high enrichment (conjugations, gender, ~100 IPA)
   - Others: ~100 words, basic enrichment (glosses, POS, CEFR)
```

### Future: Expand Coverage
```
1. Create comprehensive CSV sources (1000+ words per language)
   - Source from Wiktionary exports
   - Or frequency lists from language corpora

2. Run same scripts:
   npm run generate:vocab
   → Regenerates with 1000+ words each

3. Enrich further (optional):
   - Add examples via API (cached locally)
   - Add synonyms/antonyms via curated database
   - Add more IPA (Wiktionary export)
```

---

## CSV Format

**Required columns** (case-insensitive):
```
rank,word,display,pos,difficulty,tags,notes
```

**Optional columns**:
```
answers (glosses), domains, register, gender, plural, etc.
```

**Example** (Portuguese):
```csv
rank,word,display,answers,pos,difficulty,tags,notes
1,de,of / from,of|from,preposition,1,common|frequent,
2,a,to / at,to|at,preposition,1,common|frequent,
3,o,the (masculine),the,article,1,common,
...
```

---

## Data File Structure

Each language JSON follows this schema:

```javascript
{
  "rank": 1,                         // Frequency rank
  "word": "de",                      // Source word
  "display": "of / from",            // English gloss
  "pos": "preposition",              // Part of speech
  "difficulty": 1,                   // 1-5 scale
  "tags": ["common", "frequent"],    // Metadata
  "notes": "",                       // Usage notes
  "glosses": ["of", "from"],         // Translation options
  "examples": [],                    // Example sentences
  "linguistic": {
    "infinitive": null,
    "reflexive": null,
    "gender": "m|f|null",            // Noun gender
    "plural": "de + s or irregular",  // Plural form
    "register": "neutral|formal|informal|technical",
    "ipa": "[de]",                   // Pronunciation
    "syllables": [],
    "conjugations": {
      "present": { yo: "...", tú: "...", ... },
      "preterite": { ... },
      "imperfect": { ... },
      "future": { ... },
      "conditional": { ... }
    }
  },
  "relations": {
    "commonly_confused_with": [],
    "related": [],
    "synonyms": [],
    "antonyms": []
  },
  "frequency": {
    "band": "A1|A2|B1|B2|C1|C2",
    "rank": 1,
    "corpus_frequency": null
  },
  "domains": ["general|business|medical|travel|...]
}
```

---

## Token Cost Analysis

### MVP Generation (Minimal API)
- **CSV Parsing**: 0 tokens (local file parsing)
- **Conjugation Generation**: 0 tokens (rules-based)
- **Gender Inference**: 0 tokens (pattern matching)
- **IPA Lookup**: 0 tokens (lookup table)
- **CEFR Assignment**: 0 tokens (rank-based)
- **Total**: ~0 API tokens

### Future Enrichment (Optional, Batched)
- **Examples** (3 per word × 4 languages × 1000 words): Wiktionary API (free, rate-limited)
- **IPA** (remaining words): Wiktionary export (one-time download)
- **Synonyms**: Curated database or API
- **Cost**: Minimal if batched and cached

---

## Extending the System

### Add More Verbs to Irregular List
Edit `scripts/data/spanish-verb-conjugations.js`:

```javascript
const IRREGULAR_VERBS = {
  'nuevoverbo': {
    present: { yo: '...', tú: '...', ... },
    // ...
  }
};
```

### Add IPA for More Words
Edit `scripts/data/spanish-ipa.js`:

```javascript
const IPA_LOOKUP = {
  'palabra': '[pa.ˈla.bɾa]',  // Add entry
  // ...
};
```

### Add Gender Exceptions
Edit `scripts/data/spanish-gender-patterns.js`:

```javascript
const EXCEPTIONS = {
  'nueva-palabra': 'f',  // Add entry
  // ...
};
```

### Custom Enrichment
Modify `scripts/enrich-vocabulary.js` to add custom logic:

```javascript
function enrichWord(word, language) {
  // Your custom logic here
  return enriched;
}
```

---

## Testing

```bash
# Generate all
npm run generate:vocab

# Start app
npm run dev

# Test in browser
# http://localhost:3000
# Select each language and verify data loads
```

---

## Size & Performance

**Output file sizes**:
- spanish.json: ~1MB (1000 words)
- portuguese.json: ~200KB (100 words initial, expands with sources)
- italian.json: ~200KB
- french.json: ~200KB

**Generation time**:
- CSV → JSON: ~100ms per language
- Enrichment: ~50ms (rules-based)
- Total: <1 second for all 4 languages

---

## Git Workflow

```bash
# 1. Generate data
npm run generate:vocab

# 2. Commit data files
git add backend/data/*.json
git commit -m "Generate vocabulary data for all languages"

# 3. Scripts are checked in, CSVs are source of truth
git add data/sources/*.csv
git add scripts/
git commit -m "Add data generation infrastructure"

# 4. Future updates
# Just update CSVs and regenerate:
npm run generate:vocab
git add backend/data/*.json
git commit -m "Update vocabulary data"
```

---

## Summary

This system provides:
- ✅ **Zero API calls** for MVP (all rules-based)
- ✅ **Deterministic output** (reproducible, auditable)
- ✅ **Fast generation** (<1 second for all 4 languages)
- ✅ **Scalable** (easily expand CSV sources)
- ✅ **Maintainable** (clear rules, easy to extend)
- ✅ **Token-efficient** (no AI generation needed)
