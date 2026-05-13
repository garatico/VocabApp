# Getting Started with VocabApp

## Current Status

- ✅ **Phase 0**: Monorepo structure setup
- ✅ **Phase 1**: Shared utilities created
- ✅ **Phase 2**: Backend implemented with single-command startup
- ⏳ **Phase 3**: Code migration (upcoming)

## Quick Start

### Prerequisites

- Node.js 16+ installed
- npm installed

### Installation

```bash
# Clone/navigate to project
cd vocab-app

# Install all dependencies
npm install
```

### Start Development Server

```bash
# Start everything (backend + frontend build)
npm run dev
```

This single command will:
1. Start Express backend on **http://localhost:3000**
2. Watch and build vocab-practice app
3. Copy built files to backend/public/
4. Automatically reload on file changes

### Test the API

Open another terminal:

```bash
# Test health endpoint
curl http://localhost:3000/api/health

# List available languages
curl http://localhost:3000/api/languages

# Get vocabulary (will work after Phase 3)
curl http://localhost:3000/api/vocab/spanish
```

Or run the automated test script:

```bash
node backend/test-api.js
```

### Visit in Browser

- **Frontend**: http://localhost:3000
- **API**: http://localhost:3000/api/languages
- **Status**: http://localhost:3000 (shows backend status)

## What's Working Now

✅ Backend server running on port 3000
✅ Express middleware configured (CORS, JSON, static files)
✅ API endpoints responding
✅ Error handling in place
✅ Single-command development (`npm run dev`)
✅ Auto-reload on file changes
✅ Shared utilities available for all apps

## What's Coming in Phase 3

In Phase 3, we'll migrate existing code:
- Move vocab-practice code to packages/vocab-practice/
- Update to use new folder structure
- Connect to actual vocabulary files
- Build and serve corpus-builder and data-processor as admin tools

At that point, the entire system will be fully functional!

## Project Structure

```
vocab-app/
├── backend/                    (Express server)
│   ├── src/                   (Backend code)
│   ├── data/                  (Vocabulary JSON files)
│   ├── public/                (Frontend build output)
│   └── index.js               (Entry point)
├── packages/
│   ├── vocab-practice/        (User-facing app)
│   ├── corpus-builder/        (Admin tool)
│   └── data-processor/        (Admin tool)
├── shared/                    (Shared code & utilities)
├── package.json               (Root config)
└── ARCHITECTURE.md            (System design)
```

## Available Commands

### Development

```bash
# Start everything (recommended)
npm run dev

# Start just backend
npm run dev:backend-only

# Build all apps (one-time)
npm run build

# Build specific app
npm run build:vocab
npm run build:corpus
npm run build:processor
```

### Production

```bash
# Start production server
npm start
```

### Testing

```bash
# Run API tests
node backend/test-api.js

# Run linter
npm run lint
```

## Architecture Overview

```
Browser
   │
   ▼
http://localhost:3000
   │
   ├─ / ──────────────────────────► Vocab Practice App
   │                              (in backend/public/)
   │
   ├─ /api/vocab/:lang ───────────► Express Backend
   │                              (in backend/src/)
   │
   └─ /api/languages,
      /api/health ────────────────► API Routes
                                  (in backend/src/routes/)
```

## Folder Organization

### `backend/` - Express Server
- `src/index.js` - Server entry point
- `src/routes/public.js` - API endpoints
- `src/middleware/` - CORS, error handling
- `src/lib/vocab-loader.js` - Vocabulary loading
- `data/` - Vocabulary JSON files
- `public/` - Frontend build output

### `packages/vocab-practice/` - Main App
- `public/index.html` - HTML entry point
- `src/` - JavaScript modules
- `styles/` - CSS files

### `packages/corpus-builder/` - Admin Tool
- For building vocabularies from raw sources

### `packages/data-processor/` - Admin Tool
- For processing and enriching vocabulary data

### `shared/` - Shared Code
- `constants/` - POS, CEFR, domains, registers, languages
- `schemas/` - Word data structure definition
- `utils/` - Validation, CSV, JSON utilities
- `types.d.ts` - TypeScript definitions

## API Endpoints

### GET /api/health
Health check - use to verify server is running

### GET /api/languages
List supported languages

### GET /api/vocab/:language
Get vocabulary for a language
- Parameters: `spanish`, `portuguese`, `italian`, `french`
- Returns array of Word objects

## Environment Variables

Create `backend/.env`:

```
NODE_ENV=development
API_PORT=3000
API_BASE_URL=http://localhost:3000
ADMIN_API_KEY=dev-key-change-in-production
DATA_DIR=./data
```

## Troubleshooting

### "Cannot find module 'express'"

```bash
npm install
```

### "Port 3000 already in use"

Change port in backend/.env:
```
API_PORT=3001
```

Then access at http://localhost:3001

### "Vocabulary file not found"

This is expected before Phase 3. The backend is ready, but needs:
1. Vocabulary files in `backend/data/`
2. Frontend code moved to `packages/vocab-practice/`

### Backend not auto-reloading

Make sure you're running: `npm run dev` from the root, not the backend folder

## Next Steps

1. ✅ Verify `npm run dev` starts without errors
2. ✅ Test API endpoints with curl or test script
3. ✅ Read ARCHITECTURE.md for system design
4. ⏳ Wait for Phase 3 (code migration)
5. ⏳ Enjoy the fully integrated system!

## Documentation

- **ARCHITECTURE.md** - System design and overview
- **PHASE_0_CHECKLIST.md** - What was done in Phase 0
- **PHASE_1_CHECKLIST.md** - What was done in Phase 1
- **PHASE_2_CHECKLIST.md** - What was done in Phase 2
- **backend/README.md** - Backend-specific documentation
- **packages/*/README.md** - App-specific documentation

## Support

If something isn't working:
1. Check that Node.js 16+ is installed: `node --version`
2. Run `npm install` to ensure dependencies are installed
3. Run `npm run dev` from the root directory
4. Check http://localhost:3000/api/health for API status
5. Review the phase checklists for what was implemented

Enjoy building! 🚀
