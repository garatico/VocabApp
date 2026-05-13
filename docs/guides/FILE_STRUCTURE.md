# VocabApp File Structure Guide

This document provides a complete breakdown of the project organization after the reorganization.

## Root Directory Structure

```
vocab-app/
├── docs/                    ← All documentation (moved here)
├── packages/                ← Frontend and data processing apps (monorepo)
├── backend/                 ← Express.js API server
├── shared/                  ← Shared utilities and constants
├── scripts/                 ← Data generation scripts
├── tests/                   ← Test files (future)
├── archive/                 ← Old/deprecated code (archived)
├── .github/                 ← GitHub config (when added)
├── .env.example             ← Environment variable template
├── .gitignore               ← Git ignore rules
├── package.json             ← Root monorepo config
├── package-lock.json        ← Locked dependencies
├── README.md                ← Project overview (ONLY .md at root)
├── CHANGELOG.md             ← Release history (ONLY .md at root)
└── CONTRIBUTING.md          ← Contribution guide (ONLY .md at root)
```

**Key Changes:**
- ✅ Only **3 markdown files at root** (was 15)
- ✅ All docs moved to `docs/` subfolder
- ✅ Old backups archived in `archive/`
- ✅ Clear separation of concerns

---

## Documentation Structure

```
docs/
├── getting-started/
│   ├── QUICK_START.md           ← 5-minute setup guide
│   └── GETTING_STARTED.md       ← Detailed getting started
│
├── architecture/
│   ├── ARCHITECTURE.md          ← High-level system design
│   └── DATA_ARCHITECTURE.md     ← Data flow and structures
│
├── guides/
│   ├── FILE_STRUCTURE.md        ← This file
│   ├── DATA_GENERATION_GUIDE.md ← How data is generated
│   ├── RESPONSIVE_DESIGN_SUMMARY.md
│   ├── RESPONSIVE_TESTING_GUIDE.md
│   └── ORGANIZATION_IMPROVEMENTS.md
│
└── phases/
    ├── PHASE_0_CHECKLIST.md
    ├── PHASE_1_CHECKLIST.md
    ├── PHASE_2_CHECKLIST.md
    ├── PHASE_3_CHECKLIST.md
    ├── PHASE_4B_ENHANCEMENTS.md
    ├── PHASE_4B2_CHANGELOG.md
    └── CLEANUP_NOTES.md
```

---

## Frontend App: packages/vocab-practice/

### Overall Structure

```
packages/vocab-practice/
├── src/                       ← Feature-organized source code
│   ├── core/                  ← Main app entry point
│   ├── modes/                 ← Practice modes
│   ├── features/              ← Optional features
│   ├── ui/                    ← UI state and handling
│   ├── utils/                 ← Shared utilities
│   └── ...
│
├── public/                    ← Static assets
│   ├── index.html
│   └── ...
│
├── styles/                    ← All CSS (centralized)
│   ├── base.css
│   ├── variables.css
│   ├── controls.css
│   ├── quiz.css
│   ├── table.css
│   ├── recall.css
│   ├── responsiveness.css
│   ├── enhancements.css
│   └── ...
│
├── package.json
├── build.json                 ← Build config (if any)
└── README.md                  ← Package-specific readme
```

### Detailed: src/ Directory (Feature-Based Organization)

#### core/ - Application Entry Point
```
src/core/
├── app.js              ← Main entry point, initializes everything
├── ui.js               ← UI helper functions (toasts, loading spinners)
└── data-loader.js      ← Loads vocabulary data from API/backend
```

**Responsibilities:**
- App initialization
- DOM element references
- Event listener setup
- Global state management
- Data loading pipeline

#### modes/ - Practice Modes

```
src/modes/
├── quiz/               ← Single word quiz mode
│   ├── quiz.js         ← Quiz state and logic (class Quiz)
│   └── quiz-controls.js ← Event handling, UI updates
│
├── table/              ← Multiple word table mode
│   ├── table-mode.js   ← Render table layout
│   └── table-controls.js ← Button handlers, state sync
│
└── recall/             ← Recall/memory practice
    └── recall-mode.js  ← Render and manage recall UI
```

**Design Pattern:**
- One file per concern: logic + UI handling
- Export main functions: `renderTableMode()`, `bindQuizControls()`
- Mode selectable in controls (`id="modeSelect"`)
- Each mode handles its own event listeners

#### features/ - Optional Features

```
src/features/
├── filters/            ← Word filtering system
│   ├── word-filters.js ← Build filter UI, apply filters
│   ├── filter-toggle.js ← Collapse/expand toggle
│   └── class-filter.js  ← Part-of-speech filter
│
├── theme/              ← Dark/light mode
│   └── theme-toggle.js  ← Toggle and persist theme
│
├── tooltip/            ← Word information hover cards
│   └── word-tooltip.js  ← Render conjugations, metadata
│
└── tts/                ← Text-to-speech
    └── tts.js          ← Pronunciation functionality
```

**Design Pattern:**
- Self-contained features
- Can be disabled without breaking the app
- Export public API functions
- No circular dependencies

#### ui/ - UI State and Event Handling

```
src/ui/
├── ui-state.js         ← DOM listeners for UI state changes
│                        (size select, mode select, etc.)
├── start-handler.js    ← "Start Quiz" button handler
│                        (orchestrates everything)
└── match.js            ← Utility: answer matching logic
```

**Responsibilities:**
- Track UI state (selected size, language, mode)
- Handle major app transitions
- Coordinate between modes and features
- Answer matching algorithms

#### utils/ - Shared Utilities

```
src/utils/
└── utils.js            ← Helper functions used everywhere
                         (stripDiacritics, isCorrect, etc.)
```

#### styles/ - Centralized Styling

```
styles/
├── variables.css       ← CSS custom properties (colors, spacing, etc.)
├── base.css            ← Reset, typography, layout
├── controls.css        ← Control bar and filters
├── quiz.css            ← Quiz mode specific
├── table.css           ← Table mode specific
├── recall.css          ← Recall mode specific
├── responsiveness.css  ← Mobile/tablet/desktop breakpoints
├── enhancements.css    ← Animations and polish (Phase 4B)
├── tooltip.css         ← Tooltip styling
└── summary.css         ← Score summary styling
```

**Key Pattern:**
- **One file per feature/mode**
- Organized by visual component
- All responsive styles in `responsiveness.css`
- Dark mode in each file (`:root.dark`)

---

## Backend: backend/

```
backend/
├── src/
│   ├── index.js                ← Express server entry
│   ├── config.js               ← Config (when added)
│   │
│   ├── api/                    ← API routes (organized by feature)
│   │   ├── vocab.routes.js     ← /api/vocab endpoints
│   │   └── health.routes.js    ← Health check
│   │
│   ├── middleware/             ← Express middleware
│   │   ├── cors.js             ← CORS configuration
│   │   └── error-handler.js    ← Error handling
│   │
│   ├── lib/                    ← Library code
│   │   └── vocab-loader.js     ← Load vocab from JSON
│   │
│   └── utils/                  ← Utilities
│       └── helpers.js          ← Shared functions
│
├── public/                     ← Built frontend (generated)
│   └── index.html
│
├── data/                       ← Vocabulary JSON files (generated)
│   ├── spanish.json
│   ├── portuguese.json
│   ├── italian.json
│   └── french.json
│
├── scripts/                    ← Utility scripts
│   └── copy-vocab-app.js       ← Build step
│
├── package.json
└── README.md
```

---

## Shared Code: shared/

```
shared/
├── constants/          ← App-wide constants
│   └── ...
│
├── schemas/            ← Data schemas and validation
│   └── ...
│
└── utils/              ← Shared utilities
    └── ...
```

---

## Data Scripts: scripts/

```
scripts/
├── data/               ← Data generation rules
│   ├── spanish-verb-conjugations.js
│   ├── spanish-gender-patterns.js
│   ├── spanish-ipa.js
│   └── index.js
│
└── data-generation/    ← Generation orchestration
    ├── generate-from-csv.js
    ├── generate-all-vocabulary.js
    └── enrich-vocabulary.js
```

---

## Archived Files: archive/

```
archive/
├── old-files-backup/   ← Old _old-files-backup folder
└── src-backup/         ← Old packages/vocab-practice/src/backup
```

**Why archived:**
- Old code from development iterations
- Backup files no longer needed
- Kept for historical reference
- Can be deleted after ensuring nothing is needed

---

## Import Paths: Quick Reference

### When in src/core/app.js:
```javascript
// Other core modules (same directory)
import { loadWords } from './data-loader.js';
import { ui } from './ui.js';

// Modes
import { Quiz } from '../modes/quiz/quiz.js';
import { renderTableMode } from '../modes/table/table-mode.js';

// Features
import { buildFilterUI } from '../features/filters/word-filters.js';
import { initTheme } from '../features/theme/theme-toggle.js';

// UI modules
import { bindStartHandler } from '../ui/start-handler.js';

// Utils
import { stripDiacritics } from '../utils/utils.js';
```

### When in src/modes/quiz/quiz.js:
```javascript
// Same mode directory
import { Quiz } from './quiz.js';

// Other areas
import { isCorrect } from '../../utils/utils.js';        // up 2, then down
import { attachTooltips } from '../../features/tooltip/word-tooltip.js';
```

**Pattern:**
```
../          ← up one level
../../       ← up two levels
./filename   ← same directory
```

---

## Key Organizational Principles

### 1. **Feature-Based Organization**
Files grouped by what they do, not by type.
- ✅ Good: `modes/quiz/`, `features/filters/`
- ❌ Bad: `components/`, `pages/`, `services/`

### 2. **Single Responsibility**
Each file has one clear job.
- Core files: initialization
- Mode files: logic + UI for one mode
- Feature files: one optional feature
- Utility files: shared helpers

### 3. **Clear Entry Points**
- `src/core/app.js` - main entry
- `src/modes/*/` - each mode entry
- `src/features/*/` - each feature entry

### 4. **Centralized Styles**
- All CSS in `styles/`
- One file per visual feature
- Responsive design in `responsiveness.css`

### 5. **Import Depth**
Max import depth: 2-3 levels
- ✅ `../../utils/utils.js`
- ❌ `../../../../shared/constants/index.js` (too deep)

---

## Adding New Code

### Adding a New Mode
```bash
mkdir packages/vocab-practice/src/modes/my-mode
touch packages/vocab-practice/src/modes/my-mode/my-mode.js
```

Update in `src/core/app.js`:
```javascript
import { renderMyMode } from '../modes/my-mode/my-mode.js';
```

### Adding a New Feature
```bash
mkdir packages/vocab-practice/src/features/my-feature
touch packages/vocab-practice/src/features/my-feature/my-feature.js
```

### Adding Styles
Create `packages/vocab-practice/styles/my-feature.css`

Link in `packages/vocab-practice/public/index.html`:
```html
<link rel="stylesheet" href="/styles/my-feature.css"/>
```

---

## Summary

| Aspect | Before | After |
|--------|--------|-------|
| Root .md files | 15 | 3 |
| Frontend file grouping | Flat (20+ files in src/) | By feature (7 groups) |
| Documentation | At root | docs/ subfolder |
| Old code | At root (_old-files-backup/) | archive/ |
| Import clarity | Unclear | Clear paths |
| New developer onboarding | Hard | Easy |

**Result:** Cleaner, more scalable, easier to maintain and extend.
