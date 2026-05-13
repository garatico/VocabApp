# CSV Seed Files & Data Management

## Overview

Seed CSV files are the **source of truth** for vocabulary data. They're human-editable files that can be processed by build scripts to generate the JSON files used by the app.

**Location:** `backend/data/sources/`

```
backend/data/sources/
├── spanish.csv           (1,000 words, exported from enriched JSON)
├── portuguese.csv        (50 words)
├── italian.csv           (50 words)
└── french.csv            (20 words)
```

---

## Data Flow

```
                    ┌─────────────────┐
                    │  Edit CSV Files │
                    │   (manually)    │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ Run Generate    │
                    │ Scripts via CLI │
                    │ or Admin Panel  │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │   JSON Files    │
                    │  (app uses)     │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │  Admin Panel:   │
                    │ Quick Wins or   │
                    │ AI Enrichment   │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ Export to CSV   │
                    │ for Backup      │
                    └─────────────────┘
```

---

## CSV Format

### 17 Columns

| # | Column | Type | Description | Example |
|---|--------|------|-------------|---------|
| 1 | `rank` | Integer | Frequency ranking (1-1000) | `1` |
| 2 | `word` | String | Spanish word (required) | `hablar` |
| 3 | `display` | String | UI display text (usually English) | `to speak` |
| 4 | `glosses` | Pipe-separated | Translations: `gloss1\|gloss2\|gloss3` | `speak\|talk\|say` |
| 5 | `pos` | String | Part of speech | `verb`, `noun`, `adjective`, etc. |
| 6 | `difficulty` | Integer | 1-5 scale (1=beginner) | `1`, `2`, `3` |
| 7 | `tags` | Pipe-separated | Metadata: `tag1\|tag2` | `common\|frequent` |
| 8 | `notes` | String | Usage notes or context | `Regular verb, common` |
| 9 | `examples` | Pipe-separated | Usage examples: `ex1\|ex2\|ex3` | `Hablo español\|They talk often` |
| 10 | `synonyms` | Pipe-separated | Similar words: `syn1\|syn2` | `conversar\|charlar\|dialogar` |
| 11 | `antonyms` | Pipe-separated | Opposite words: `ant1\|ant2` | `silencio\|callar` |
| 12 | `ipa` | String | International Phonetic Alphabet | `[aˈβlaɾ]` |
| 13 | `frequency_band` | String | CEFR level: A1, A2, B1, B2, C1, C2 | `A1` |
| 14 | `gender` | String | Grammatical gender (m/f) | `m`, `f`, or empty |
| 15 | `plural` | String | Plural form for countable nouns | `libros` |
| 16 | `infinitive` | String | Base form for conjugated verbs | `hablar` |
| 17 | `reflexive` | String | Is reflexive? (true/false or empty) | `true` |

### Formatting Rules

**Array fields** use pipe separator (`|`) to separate multiple values:
```csv
glosses: "speak|talk|say|converse"
tags: "common|frequent"
examples: "Hablo español|They speak often"
synonyms: "conversar|charlar|dialogar|platicar"
```

**Text fields with commas, quotes, or newlines** must be wrapped in quotes:
```csv
"This word has, commas"
"Word ""means"" something"  (double-quotes become escaped)
```

**Empty fields** can be left blank or contain nothing:
```csv
notes: 
infinitive: 
antonyms:
```

---

## Example CSV Row

```csv
rank,word,display,glosses,pos,difficulty,tags,notes,examples,synonyms,antonyms,ipa,frequency_band,gender,plural,infinitive,reflexive
1,"el","the (masculine)","the",article,1,"common|frequent","Essential article",,"","","[el]",A1,"m","los","","false"
2,"hablar","to speak","speak|talk|say|converse",verb,1,"common|frequent","Regular verb, infinitive form","Hablo español|They speak often","conversar|charlar|dialogar|platicar","silencio|callar","[aˈβlaɾ]",A1,"","","hablar","false"
```

---

## Current CSV Files

### spanish.csv (1,000 words)
- **Source:** Exported from enriched spanish.json
- **Coverage:** 
  - All basic fields: 100%
  - Examples: 100% (template-generated)
  - Synonyms: 65% (rule-based)
  - IPA: 100% (phonetic rules)
- **Use:** Base vocabulary, full enrichment

### portuguese.csv (50 words)
- **Source:** Generated from minimal JSON
- **Coverage:** Basic fields only
- **Use:** Starter vocabulary for Portuguese

### italian.csv (50 words)
- **Source:** Generated from minimal JSON
- **Coverage:** Basic fields only
- **Use:** Starter vocabulary for Italian

### french.csv (20 words)
- **Source:** Generated from minimal JSON
- **Coverage:** Basic fields only
- **Use:** Starter vocabulary for French

---

## How to Edit

### Method 1: Admin Panel (Easiest)
1. Go to http://localhost:3000/admin
2. Go to **Word Editor** tab
3. Search for a word
4. Fill in fields
5. Click **Save Changes**
✅ Changes write directly to JSON

### Method 2: Edit CSV + Regenerate
1. Open `backend/data/sources/spanish.csv` in Excel/Google Sheets
2. Edit rows (add/modify/delete words)
3. Save CSV
4. Go to admin panel → **Build Scripts**
5. Click **Generate Spanish**
✅ CSV is converted back to JSON

### Method 3: Bulk Changes in Spreadsheet
1. Click **↓ Export Spanish** button in admin panel
2. Opens CSV in your default spreadsheet app
3. Make bulk edits (add columns, edit multiple rows)
4. Save and close
5. Re-import: manually copy back to `sources/spanish.csv` or use CLI
6. Click **Generate Spanish** to apply changes

---

## Command Line Usage

### Export to CSV
```bash
cd backend/scripts
node export-to-csv.js spanish    # Single language
node export-to-csv.js all        # All languages
```

Output: `backend/data/sources/spanish.csv` (17 columns, 1000 rows)

### Generate from CSV
```bash
cd backend/scripts
node generate-from-csv.js spanish
node generate-from-csv.js portuguese
# ...generates JSON files
```

### Phase 1 Quick Wins (Enrichment)
```bash
cd backend/scripts
node enrich-quick-wins.js spanish
# Enriches JSON: adds synonyms, examples, IPA, registers
```

---

## Recommended Workflow

### Setup (One-time)
```bash
# Export current JSON to CSV
node export-to-csv.js all

# Verify CSVs are created
ls backend/data/sources/
# → spanish.csv, portuguese.csv, italian.csv, french.csv
```

### Daily Editing
1. **Make changes** in admin panel (fastest)
   - Search word → edit form → save
   - Changes write directly to JSON

2. **Backup** periodically
   - Click export buttons to download CSV backups
   - Or run `export-to-csv.js` script

### Bulk Enrichment
1. **Quick Wins** (free, 8 hours development)
   ```bash
   node enrich-quick-wins.js spanish
   ```

2. **Export** to share/backup
   ```bash
   node export-to-csv.js spanish
   ```

---

## Quality Checks

### Before Regenerating from CSV
- ✅ All required fields filled (rank, word, pos)
- ✅ Pipe separator used correctly for arrays
- ✅ No stray quote marks
- ✅ Difficulty is 1-5
- ✅ CEFR band is A1-C2
- ✅ Gender is m/f (optional)
- ✅ POS is valid (noun, verb, adjective, etc.)

### After Regenerating
- Check admin panel → **Statistics** tab
- View coverage metrics
- Verify word count matches CSV

---

## Troubleshooting

### "No CSV found" error
**Problem:** Script can't find CSV file
**Solution:** 
- Verify file exists: `backend/data/sources/spanish.csv`
- Run export first: `node export-to-csv.js spanish`

### Invalid CSV format
**Problem:** "SyntaxError: Unexpected token"
**Solution:**
- Check quotes are paired: `"text"` not `"text` 
- Pipe separators in arrays: `value1|value2` not `value1, value2`
- No unescaped quotes in text: `word ""means"" thing` (double quotes)

### Regenerated JSON is empty
**Problem:** Generate script ran but JSON is blank
**Solution:**
- Check CSV has data rows (not just headers)
- Verify `word` column isn't empty
- Check for encoding issues (should be UTF-8)

### Can't export to CSV
**Problem:** Export button does nothing
**Solution:**
- Check server is running in development mode
- Verify `/api/admin/export` endpoint exists
- Check browser console for errors

---

## Data Validation

### Required Fields
- `rank`: Must be unique integer
- `word`: Must not be empty, Spanish word
- `pos`: Must be valid (noun, verb, adjective, preposition, etc.)

### Optional Fields
- `display`: Defaults to word if empty
- `glosses`: At least one required for users
- `examples`: Can be empty (Quick Wins will fill)
- `synonyms`: Can be empty (Quick Wins will fill)
- `ipa`: Can be empty (Quick Wins will fill)

### Recommended Fields
- `difficulty`: 1-5 (for UI filtering)
- `frequency_band`: A1-C2 (for learning level)
- `tags`: common, frequent, etc. (for organization)

---

## Comparison: CSV vs Admin Panel

| Task | CSV | Admin Panel |
|------|-----|-------------|
| Edit single word | Slower | ✅ Faster |
| Bulk changes | ✅ Faster | Slower |
| Add new word | ✅ CSV | Manual entry |
| Run enrichment | CLI | ✅ UI button |
| View statistics | No | ✅ Dashboard |
| Backup data | ✅ Export | ✅ Download |

---

## Files

```
backend/data/
├── sources/
│   ├── spanish.csv           (1000 words)
│   ├── portuguese.csv        (50 words)
│   ├── italian.csv           (50 words)
│   └── french.csv            (20 words)
├── spanish.json              (generated, used by app)
├── portuguese.json           (generated, used by app)
├── italian.json              (generated, used by app)
└── french.json               (generated, used by app)

backend/scripts/
├── export-to-csv.js          (JSON → CSV)
├── generate-from-csv.js      (CSV → JSON)
├── enrich-quick-wins.js      (Enrichment)
└── utils/
    ├── synonym-generator.js
    ├── ipa-expander.js
    ├── register-generator.js
    └── example-generator.js
```

---

## Next Steps

1. **Review Spanish CSV:**
   - Open `backend/data/sources/spanish.csv`
   - Check data looks correct
   - Make any manual edits needed

2. **Run Quick Wins:**
   - Admin panel → Build Scripts
   - Click "Phase 1 Quick Wins"
   - Watch enrichment process

3. **Verify Results:**
   - Admin panel → Statistics
   - Check coverage improved
   - Search a word to verify

4. **Backup:**
   - Download CSV exports regularly
   - Keep copies of enriched data

---

## Questions?

Refer to:
- Admin panel → **Help & Docs** tab (comprehensive field reference)
- `PHASE1_QUICK_WINS.md` (enrichment documentation)
- `generate-from-csv.js` source code (implementation details)
