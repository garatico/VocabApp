# Backend

Lightweight Express server for VocabApp.

## What This Server Does

- Serves vocab-practice SPA from `/`
- Provides vocabulary API at `/api/vocab/:language`
- Hosts admin tools (corpus-builder, data-processor) at `/admin/*`
- Protects admin routes with API key authentication
- Caches vocabulary files with intelligent reuse
- Serves static assets
- Handles errors gracefully with detailed messages

## Quick Start

### Run from root directory:
```bash
# Start everything (backend + build frontend)
npm run dev

# Or just backend
npm run dev:backend-only
```

The entire system will be available at: **http://localhost:3000**

## Structure

```
backend/
├── src/
│   ├── index.js              (Express app setup)
│   ├── env.js                (Configuration)
│   ├── routes/
│   │   ├── public.js         (GET /api/vocab/:lang)
│   │   └── admin.js          (POST /admin/... protected)
│   ├── middleware/
│   │   ├── auth.js           (API key validation)
│   │   └── error-handler.js
│   ├── services/
│   │   ├── vocab-service.js  (File serving)
│   │   ├── corpus-service.js (Corpus operations - future)
│   │   └── processor-service.js (Processing - future)
│   └── lib/
│       └── file-watcher.js   (Detect file changes)
├── data/
│   ├── spanish.json
│   ├── portuguese.json
│   ├── italian.json
│   └── french.json
├── admin/
│   ├── corpus-builder/       (Built from packages/corpus-builder)
│   └── data-processor/       (Built from packages/data-processor)
├── public/                   (Built vocab-practice SPA)
├── package.json
├── .env.example
└── README.md
```

## API Specification

### Public Routes

#### GET /api/vocab/:language
Returns full vocabulary for a language

**Parameters**:
- `language`: `spanish`, `portuguese`, `italian`, `french`

**Response** (200):
```json
{
  "language": "spanish",
  "code": "es",
  "count": 1000,
  "words": [ ... ]
}
```

**Response** (404):
```json
{
  "error": "Language not found"
}
```

### Admin Routes (Protected)

All admin routes require `X-Admin-Key` header:
```
X-Admin-Key: your-secret-key-here
```

#### POST /admin/corpus/build (Future)
Build corpus from CSV

#### POST /admin/processor/transform (Future)
Process data

#### GET /admin/corpus/status (Future)
Get build status

## Development

### Start Server

```bash
# Development with auto-reload
npm run dev

# Production
npm start

# Runs on http://localhost:3000
```

### Environment Variables

Create `.env`:
```
NODE_ENV=development
API_PORT=3000
ADMIN_API_KEY=your-secret-key-here
DATA_DIR=./data
```

## File Locations

- **Vocabulary files**: `backend/data/*.json`
- **Vocab practice SPA**: `backend/public/*`
- **Admin tools**: `backend/admin/*`

## Building All Apps

From root directory:

```bash
# Build vocab-practice → backend/public/
npm run build:vocab

# Build corpus-builder → backend/admin/corpus-builder/
npm run build:corpus

# Build data-processor → backend/admin/data-processor/
npm run build:processor

# Build all three
npm run build
```

## Accessing Apps

Once backend is running:

- **Vocab Practice**: http://localhost:3000
- **Vocabulary API**: http://localhost:3000/api/vocab/spanish
- **Corpus Builder** (admin): http://localhost:3000/admin/corpus-builder
- **Data Processor** (admin): http://localhost:3000/admin/data-processor

## Dependencies

- **express**: Web framework
- **cors**: CORS middleware
- **dotenv**: Environment variables
- **shared**: Shared constants and schemas

## Phase 0 Status

✓ Package structure created
✓ Placeholder files created
⏳ Implementation begins in Phase 2
