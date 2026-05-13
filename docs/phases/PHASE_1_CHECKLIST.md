# Phase 1 Checklist: Shared Utilities Complete ✓

## What Was Accomplished

Phase 1 populated `shared/` with reusable utility functions that will be used by all three apps without modifying any existing code.

## ✓ Validation Utilities (`shared/utils/validation.js`)

Comprehensive validation and sanitization functions:

- `validateWord(word)` - Validate complete word object
- `validateWordArray(words)` - Batch validate array of words
- `isValidCEFRLevel(level)` - Check CEFR level (A1-C2)
- `isValidRegister(register)` - Check register type
- `isValidDomain(domain)` - Check semantic domain
- `validateDomains(domains)` - Validate domain array
- `isValidPOS(pos)` - Check part of speech
- `isValidLanguageCode(langCode)` - Check language
- `isValidDifficulty(difficulty)` - Check difficulty 1-5
- `isValidRank(rank)` - Check frequency rank
- `isValidWordString(word)` - Check non-empty string
- `checkRequiredFields(obj, fields)` - Check required fields exist
- `sanitizeWord(word)` - Lowercase and trim
- `sanitizeGloss(gloss)` - Trim whitespace
- `deduplicateGlosses(glosses)` - Remove duplicate definitions
- `validateAndFixWord(word, autoFix)` - Validate with optional auto-correction

**Used by**: corpus-builder, data-processor, vocab-practice

## ✓ CSV Utilities (`shared/utils/csv.js`)

CSV parsing and conversion:

- `parseCSV(csvString, options)` - Parse CSV to objects/arrays
- `parseCSVLine(line, delimiter)` - Parse single CSV line (handles quoted fields)
- `objectsToCSV(data, options)` - Convert objects to CSV string
- `escapeCSVField(field)` - Escape field for CSV
- `validateCSVStructure(csvString, requiredColumns)` - Validate CSV format
- `csvStringToObjects(csvString, columnMapping)` - Direct CSV to objects
- `deduplicateByKey(data, key)` - Remove duplicates by field
- `sortByField(data, field, order)` - Sort by field asc/desc
- `filterByField(data, field, value)` - Filter by field value

**Used by**: corpus-builder (import CSV), data-processor (import/export CSV)

## ✓ JSON Utilities (`shared/utils/json.js`)

Object and JSON manipulation:

- `deepClone(obj)` - Deep copy object
- `merge(...objects)` - Shallow merge
- `deepMerge(...objects)` - Deep merge
- `pick(obj, keys)` - Select specific keys
- `omit(obj, keys)` - Exclude specific keys
- `renameKeys(obj, mapping)` - Rename object keys
- `flatten(obj, prefix)` - Flatten nested object
- `unflatten(obj)` - Unflatten flattened object
- `isEmpty(value)` - Check if empty
- `getByPath(obj, path)` - Access nested value (e.g., 'a.b.c')
- `setByPath(obj, path, value)` - Set nested value
- `groupBy(data, field)` - Group array by field
- `countBy(data, field)` - Count occurrences
- `prettyJSON(obj, spaces)` - Pretty print JSON
- `safeParse(jsonString, fallback)` - Safe JSON parse
- `safeStringify(obj, fallback)` - Safe JSON stringify
- `mapValues(obj, fn)` - Transform all values
- `filterObject(obj, fn)` - Filter object properties

**Used by**: corpus-builder, data-processor, backend

## ✓ TypeScript Definitions (`shared/types.d.ts`)

Type definitions for IDE support:

- `Word` interface - Complete word object structure
- `LinguisticData` interface - Linguistic metadata
- `FrequencyData` interface - CEFR and rank data
- `WordMetadata` interface - Source, language, timestamps
- `Language` interface - Language configuration
- All utility function type signatures
- Constants type exports

**Used by**: All packages (VSCode autocomplete, type checking)

## ✓ Updated Exports (`shared/utils/index.js`)

Central export point for all utilities:

```javascript
export * from './validation.js';
export * from './csv.js';
export * from './json.js';
```

All packages can now import utilities:
```javascript
import { validateWord, parseCSV, deepClone } from 'shared/utils';
```

## Key Features

### 1. **Validation with Auto-Fix**
```javascript
// Returns fixed object if autoFix=true
const { word, valid, errors } = validateAndFixWord(data, true);
```

### 2. **CSV Handling**
```javascript
// Handle quoted fields, custom delimiters
const data = parseCSV(csvString, { delimiter: ',' });
```

### 3. **Nested Object Support**
```javascript
// Access deep properties safely
const cefrLevel = getByPath(word, 'frequency.band');
```

### 4. **Type Safety**
IDE provides autocomplete for:
- Validation functions
- CSV functions
- JSON functions
- All constants
- Word schema

## Structure Summary

```
shared/
├── schemas/
│   └── word-schema.js         (Word definition) ✓
├── constants/
│   ├── pos.js                 (Parts of speech) ✓
│   ├── cefr.js                (CEFR levels) ✓
│   ├── registers.js           (Register types) ✓
│   ├── domains.js             (Semantic domains) ✓
│   ├── languages.js           (Languages) ✓
│   └── index.js               (Central export) ✓
├── utils/
│   ├── validation.js          (Word validation) ✓
│   ├── csv.js                 (CSV handling) ✓
│   ├── json.js                (JSON utils) ✓
│   └── index.js               (Central export) ✓
├── index.js                   (Main export) ✓
├── types.d.ts                 (TypeScript definitions) ✓
└── package.json               (Package config) ✓
```

## What's NOT Changed Yet

⏳ **No existing code modified**:
- `index.html` unchanged
- `src/` files unchanged
- `styles/` unchanged
- `corpus-builder.html` unchanged
- Data files unchanged
- Python scripts unchanged

## Testing the Utilities

To verify utilities are working (without modifying existing code):

```javascript
// Test imports
import { validateWord, parseCSV } from 'shared/utils';
import { CEFR_LEVELS, DOMAINS } from 'shared/constants';

// Example usage
const word = {
  rank: 1,
  word: 'test',
  display: 'test',
  glosses: ['test'],
  difficulty: 1,
  frequency: { band: 'A1', rank: 1 },
  domains: ['general'],
  register: 'neutral',
  linguistic: { gender: null, number: null, forms: [], etymology: null },
  examples: [],
  metadata: { language: 'es', source: 'manual', addedAt: new Date().toISOString(), updatedAt: null }
};

const result = validateWord(word);
console.log(result.valid); // true
```

## Next Steps (Phase 2)

In Phase 2, we will:
1. Build the lightweight Express backend
2. Create `/api/vocab/:lang` endpoint
3. Serve static files
4. Add error handling middleware
5. Add admin route skeleton

**Still no code movement - Phase 3 is when we start migrating existing code.**

## Summary

✅ **Phase 1 is complete. All shared utilities are ready.**

- ✓ 15 validation functions created
- ✓ 10 CSV utilities created
- ✓ 17 JSON utilities created
- ✓ TypeScript definitions added
- ✓ Central export configured
- ✓ No existing code modified
- ✓ Ready to build backend in Phase 2

All utilities are properly organized, documented, and ready to be imported by any package in the monorepo.
