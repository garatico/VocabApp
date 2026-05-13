# VocabApp Architecture

A multi-tool language learning platform designed to evolve from a single-user static app to a scalable web service.

## Overview

VocabApp consists of **three independent applications** that work together:

```
┌────────────────────────────────────────────────────────┐
│  vocab-practice (PUBLIC)                               │
│  The main vocabulary learning app - what users see     │
└────────────────────┬───────────────────────────────────┘
                     │ Fetches from
                     ▼
        ┌────────────────────────────┐
        │  Backend (Express.js)      │
        │  - Serves /api/vocab/:lang │
        │  - Hosts admin tools       │
        │  - Protects admin routes   │
        └────────┬───────────────────┘
                 │
         ┌───────┴──────────┐
         │                  │
    ┌────▼──────────┐  ┌───▼─────────────┐
    │ corpus-builder│  │ data-processor  │
    │ (ADMIN)       │  │ (ADMIN)         │
    └───────────────┘  └─────────────────┘
```

### The Three Apps

#### 1. **vocab-practice** (Public-facing)
- **Purpose**: Main vocabulary learning application
- **Users**: End users
- **Features**: Quiz modes, table view, recall mode, filtering, progress tracking (future)
- **Tech**: Static HTML/CSS/JavaScript SPA
- **Location**: `packages/vocab-practice/`
- **Access**: `/` (root URL)

#### 2. **corpus-builder** (Admin tool)
- **Purpose**: Build vocabulary corpus from raw sources
- **Users**: Language curators (you, initially)
- **Input**: CSV frequency list + translation APIs (Wiktionary, MyMemory)
- **Output**: JSON with enriched glosses, POS tags, linguistic metadata
- **Tech**: Static HTML/CSS/JavaScript SPA
- **Location**: `packages/corpus-builder/`
- **Access**: `/admin/corpus-builder`

#### 3. **data-processor** (Admin tool)
- **Purpose**: Process and enrich vocabulary data
- **Users**: Language curators (you, initially)
- **Input**: JSON from corpus-builder
- **Processing**:
  - CEFR level classification (A1-C2)
  - Difficulty scoring (1-5)
  - Domain tagging (business, medical, etc.)
  - Register analysis (formal/informal)
  - Data validation
- **Output**: Final JSON ready for vocab-practice
- **Tech**: Static HTML/CSS/JavaScript SPA
- **Location**: `packages/data-processor/`
- **Access**: `/admin/data-processor`

### Backend
- **Purpose**: Lightweight Express server
- **Responsibilities**:
  - Serves vocab-practice SPA
  - Provides `/api/vocab/:lang` endpoint
  - Hosts admin tools at `/admin/*`
  - Protects admin routes (API key authentication)
  - File storage and caching
- **Tech**: Node.js + Express
- **Location**: `backend/`
- **Port**: 3000 (configurable via .env)

### Shared Modules
- **Purpose**: Reusable code, types, and constants
- **Contents**:
  - `schemas/`: Word data structure definition
  - `constants/`: POS values, CEFR levels, registers, domains, languages
  - `utils/`: Common utility functions
- **Location**: `shared/`
- **Used by**: All three apps + backend

## Project Structure

```
vocab-app-monorepo/
│
├── packages/
│   ├── vocab-practice/           (User-facing app)
│   │   ├── public/
│   │   │   ├── index.html
│   │   │   └── styles/
│   │   ├── src/
│   │   │   ├── app.js            (entry point)
│   │   │   ├── modes/            (quiz, table, recall)
│   │   │   ├── ui/               (UI components)
│   │   │   ├── features/         (TTS, matching)
│   │   │   ├── lib/              (utilities)
│   │   │   └── types.d.ts
│   │   ├── styles/               (CSS files)
│   │   └── package.json
│   │
│   ├── corpus-builder/           (Admin tool)
│   │   ├── src/
│   │   │   ├── index.html
│   │   │   ├── app.js
│   │   │   ├── core/             (CSV parsing, translation)
│   │   │   ├── apis/             (Wiktionary, MyMemory)
│   │   │   └── types.d.ts
│   │   ├── styles/
│   │   └── package.json
│   │
│   └── data-processor/           (Admin tool)
│       ├── src/
│       │   ├── index.html
│       │   ├── app.js
│       │   ├── processors/       (CEFR, difficulty, domains)
│       │   ├── transformers/     (CSV to JSON, merge)
│       │   ├── validators/       (schema, quality)
│       │   └── types.d.ts
│       ├── styles/
│       └── package.json
│
├── shared/                       (Shared modules)
│   ├── schemas/
│   │   └── word-schema.js        (Word data definition)
│   ├── constants/
│   │   ├── pos.js                (Parts of speech)
│   │   ├── cefr.js               (Language levels A1-C2)
│   │   ├── registers.js          (Formal/informal/etc)
│   │   ├── domains.js            (Business/medical/etc)
│   │   ├── languages.js          (Spanish/Portuguese/etc)
│   │   └── index.js
│   ├── utils/
│   │   └── index.js
│   ├── index.js
│   └── package.json
│
├── backend/                      (Express server)
│   ├── src/
│   │   ├── index.js              (Entry point)
│   │   ├── env.js                (Configuration)
│   │   ├── routes/
│   │   │   ├── public.js         (/api/vocab/:lang)
│   │   │   └── admin.js          (/admin/...)
│   │   ├── middleware/
│   │   │   ├── auth.js           (API key validation)
│   │   │   └── error-handler.js
│   │   ├── services/
│   │   │   ├── vocab-service.js  (Serves JSON files)
│   │   │   ├── corpus-service.js (Corpus operations)
│   │   │   └── processor-service.js (Processing operations)
│   │   └── lib/
│   │       └── file-watcher.js
│   ├── data/                     (Vocabulary JSON files)
│   │   ├── spanish.json
│   │   ├── portuguese.json
│   │   ├── italian.json
│   │   └── french.json
│   ├── admin/                    (Admin tool builds)
│   │   ├── corpus-builder/
│   │   └── data-processor/
│   ├── public/                   (vocab-practice build)
│   ├── package.json
│   ├── .env.example
│   └── src/
│
├── data/                         (Raw data & processing)
│   ├── raw/                      (Source files)
│   ├── spanish/                  (Language-specific data)
│   ├── api_output/               (Corpus builder output)
│   └── ...
│
├── docs/                         (Documentation)
│   └── README.md
│
├── package.json                  (Monorepo root)
├── ARCHITECTURE.md               (This file)
├── .gitignore
└── .env.example
```

## Data Flow

### Current Flow (Single User, Static Files)

```
Raw CSV (Spanish words + frequency)
    │
    ▼
Corpus Builder
  ├─ Parses CSV
  ├─ Fetches translations (Wiktionary, MyMemory)
  ├─ Tags part of speech
  └─ Outputs: spanish_raw.json
    │
    ▼
Data Processor
  ├─ Validates data
  ├─ Classifies CEFR bands
  ├─ Scores difficulty
  ├─ Tags domains & registers
  └─ Outputs: spanish.json (full schema)
    │
    ▼
Backend /data/spanish.json (stored on server)
    │
    ▼
Vocab Practice App
  ├─ Fetches via /api/vocab/spanish
  ├─ Caches in browser
  ├─ Filters, sorts, randomizes
  └─ Display to user
```

### Word Object Lifecycle

```
Step 1: Corpus Builder creates basic word object
  {
    rank: 1,
    word: "de",
    glosses: ["of", "from"],
    pos: "preposition"
  }
          ↓
Step 2: Data Processor enriches
  {
    rank: 1,
    word: "de",
    glosses: ["of", "from"],
    pos: "preposition",
    difficulty: 1,        ← added
    frequency: {
      band: "A1",        ← added (CEFR)
      rank: 1
    },
    domains: ["general"], ← added
    register: "neutral"   ← added
  }
          ↓
Step 3: Vocab Practice reads and displays
  - Filters by CEFR level
  - Sorts by difficulty
  - Groups by domain
  - Shows in quiz/table
```

## Shared Schema

All three apps must agree on the **Word** structure. This is defined in:

**File**: `shared/schemas/word-schema.js`

**Used by**:
- `vocab-practice`: Reads and displays
- `corpus-builder`: Creates/writes initial glosses
- `data-processor`: Enriches with CEFR, difficulty, etc.
- `backend`: Serves to clients

**Key fields**:
- `rank`: Word frequency rank
- `word`: The word itself
- `display`: User-friendly display
- `pos`: Part of speech
- `glosses`: English definitions
- `difficulty`: 1-5 score
- `frequency.band`: CEFR level (A1-C2)
- `domains`: Semantic categories
- `register`: Formal/informal/etc

## Shared Constants

All three apps share constant definitions:

**File**: `shared/constants/`

**Contents**:
- `pos.js`: Valid parts of speech (noun, verb, adjective, etc.)
- `cefr.js`: CEFR levels (A1-C2) with utilities
- `registers.js`: Register types (neutral, formal, informal, etc.)
- `domains.js`: Semantic domains (business, medical, travel, etc.)
- `languages.js`: Supported languages (Spanish, Portuguese, Italian, French)

**Usage**:
```javascript
import { CEFR_LEVELS, DOMAINS, POS_VALUES } from 'shared/constants';
```

## Architecture Principles

### 1. Separation of Concerns
Each app has a single responsibility:
- `vocab-practice`: Display & quiz logic only
- `corpus-builder`: CSV parsing & translation enrichment only
- `data-processor`: Data transformation & enrichment only
- `backend`: File serving & API only

### 2. No Cross-App Dependencies
Apps cannot import from each other. Only from `shared/`:
```javascript
// ✓ OK
import { CEFR_LEVELS } from 'shared/constants';

// ✗ NOT OK
import from 'packages/corpus-builder/src';
```

### 3. Shared is Read-Only for Frontend
The frontend (all three apps) only reads from `shared/`. Backend can update `shared/` schemas if needed during data processing.

### 4. Clear Data Contracts
The Word schema is the contract. If either app changes the structure, all apps must be updated.

## Environment Variables

Create `.env` file in backend/:

```
NODE_ENV=development
API_PORT=3000
API_BASE_URL=http://localhost:3000
ADMIN_API_KEY=your-secret-key-here
DATA_DIR=./data
```

For development:
```
VOCAB_API_URL=http://localhost:3000/api
CORPUS_BUILDER_API_URL=http://localhost:3000/admin
DATA_PROCESSOR_API_URL=http://localhost:3000/admin
```

## Development Commands

### Install Dependencies
```bash
npm install
```

### Development Mode
```bash
npm run dev          # Start backend with auto-reload
```

### Build All Apps
```bash
npm run build        # Build all three apps
npm run build:vocab  # Build vocab-practice only
npm run build:corpus # Build corpus-builder only
npm run build:processor # Build data-processor only
```

### Running Apps Locally

**Vocab Practice** (standalone):
```bash
npm run dev --workspace=packages/vocab-practice
# Runs on http://localhost:5000
```

**Corpus Builder** (standalone):
```bash
npm run dev --workspace=packages/corpus-builder
# Runs on http://localhost:5001
```

**Data Processor** (standalone):
```bash
npm run dev --workspace=packages/data-processor
# Runs on http://localhost:5002
```

**Backend + All Apps**:
```bash
npm run dev
# Serves:
# - Vocab app: http://localhost:3000
# - API: http://localhost:3000/api/vocab/:lang
# - Corpus: http://localhost:3000/admin/corpus-builder
# - Processor: http://localhost:3000/admin/data-processor
```

## API Specification (Phase 2)

### Public Routes

#### GET /api/vocab/:lang
Returns full vocabulary for a language

**Response**:
```json
{
  "language": "spanish",
  "code": "es",
  "count": 1000,
  "words": [
    {
      "rank": 1,
      "word": "de",
      "display": "of / from",
      "pos": "preposition",
      "glosses": ["of", "from"],
      "difficulty": 1,
      "frequency": { "band": "A1", "rank": 1 },
      "domains": ["general"],
      "register": "neutral",
      ...
    }
  ]
}
```

### Admin Routes (Protected with API key)

#### POST /admin/corpus/build
Build corpus from CSV

#### POST /admin/processor/transform
Process raw JSON to final schema

#### GET /admin/corpus/status
Get build status and logs

## Deployment

### Short-term (Phase 9)
Deploy as single Node.js process:
- Backend serves everything
- Vocab app compiled to `backend/public/`
- Admin tools compiled to `backend/admin/`
- All at single domain (e.g., vocab.example.com)

### Long-term (Phase 3+)
- Separate frontend SPA from backend API
- Add database (PostgreSQL/SQLite)
- Separate admin panels
- Multiple deployment targets

## Next Steps

1. **Phase 1**: Extract common code into `shared/`
2. **Phase 2**: Build lightweight Express backend
3. **Phase 3**: Migrate vocab-practice to use API
4. **Phase 4**: Reorganize vocab-practice code
5. **Phase 5**: Extract corpus-builder
6. **Phase 6**: Build data-processor
7. **Phase 7**: Integrate admin routes
8. **Phase 8**: Security & optimization
9. **Phase 9**: Deploy

See [implementation plan](./IMPLEMENTATION.md) for details.
