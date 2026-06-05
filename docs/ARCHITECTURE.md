# VocabApp Architecture

> **Read this before editing any code.** It tells you which files are real,
> what each one does, and how data flows through the app.

---

## The Golden Rule

There is exactly **one copy** of every source file. If you see duplicate files
with the same name in different folders, something went wrong — do not edit
the duplicate; delete it.

---

## Project Layout

```
VocabApp/
├── backend/                  ← The entire running application lives here
│   ├── src/                  ← Node.js server (runs on your machine)
│   │   ├── index.js          ← Entry point — starts Express, loads routes
│   │   ├── lib/
│   │   │   └── vocab-loader.js   ← Reads vocabulary.db, caches results
│   │   ├── middleware/
│   │   │   ├── cors.js
│   │   │   └── error-handler.js
│   │   └── routes/
│   │       ├── public.js         ← GET /api/vocab/:lang, /api/health, /api/languages
│   │       └── admin.routes.js   ← GET/POST /api/admin/* (dev only)
│   │
│   └── public/               ← Static files served to the browser
│       ├── index.html        ← The app's single HTML page
│       ├── admin.html        ← Admin panel (dev only)
│       ├── styles/           ← All CSS (one file per concern)
│       └── src/              ← ALL frontend JavaScript — edit here
│           ├── app.js            ← ENTRY POINT — imports and wires everything
│           ├── data-loader.js    ← fetch() from /api/vocab/:lang, caches in memory
│           ├── ui.js             ← Loading spinner, toasts, error banner
│           ├── ui-state.js       ← Custom/timer dropdowns, mode switcher
│           ├── start-handler.js  ← "Start Quiz" button — builds word list & launches mode
│           ├── quiz.js           ← Quiz class (state, scoring, localStorage)
│           ├── quiz-controls.js  ← Binds answer input, skip, mark-correct, TTS, export
│           ├── table-mode.js     ← Renders the table-fill-in mode
│           ├── table-controls.js ← Binds check-all, give-up, export for table mode
│           ├── recall-mode.js    ← Renders the recall (type-the-word) mode
│           ├── match.js          ← normalize() and levenshtein() for fuzzy matching
│           ├── utils.js          ← isCorrect(), getGlosses(), getPosLabel(), etc.
│           ├── word-filters.js   ← Dynamic filter UI (domain/band/difficulty/register)
│           ├── class-filter.js   ← Static POS checkboxes (verb/noun/adj/…)
│           ├── filter-toggle.js  ← Collapse/expand the filter panel
│           ├── word-tooltip.js   ← Hover tooltip with conjugations & glosses
│           ├── theme-toggle.js   ← Dark/light mode
│           └── tts.js            ← Speech synthesis
│
├── data/
│   ├── vocabulary.db         ← SQLite database (source of truth for all vocab)
│   └── spanish.json          ← Legacy JSON export (not used by the server)
│
├── shared/                   ← Constants and schemas shared between scripts
│   └── constants/            ← CEFR levels, domains, POS tags, etc.
│
├── docs/                     ← Extended documentation
├── ARCHITECTURE.md           ← This file
├── .gitignore
└── .env  (not in git)        ← Copy from backend/.env.example on first setup
```

---

## Data Flow

```
Browser loads index.html
  └─> <script type="module" src="/src/app.js">
        └─> app.js: initTheme(), bindModeSwitch(), bindQuizControls(),
                    bindStartHandler(), bindClassFilter(), bindDomainFilter(),
                    bindUIState(), bindTableControls(), loadAndBuildFilters()
              └─> data-loader.js: fetch /api/vocab/spanish
                    └─> Express (backend/src/routes/public.js)
                          └─> vocab-loader.js: SQLite query → JSON
                    └─> returns words[]

User clicks "Start Quiz"
  └─> start-handler.js:
        1. filterWords(currentBaseList)   ← dynamic filter checkboxes
        2. domain filter (getSelectedDomains)
        3. shuffle if randomize checked
        4. → Quiz mode   → quiz.js + quiz-controls.js
           → Table mode  → table-mode.js + table-controls.js
           → Recall mode → recall-mode.js
```

---

## Word Object Shape

Every word returned by the API looks like this:

```js
{
  word:       "hablar",          // target-language form (the quiz prompt)
  display:    "to speak",        // English gloss shown as a subtitle hint
  pos:        "verb",            // part of speech
  difficulty: 2,                 // 1–5
  notes:      "",
  glosses:    ["to speak", "to talk"],  // accepted answers for isCorrect()
  examples:   ["Ella habla español."],
  linguistic: {
    infinitive:   "hablar",
    reflexive:    false,
    gender:       null,
    plural:       null,
    register:     "neutral",
    ipa:          "aˈβlaɾ",
    syllables:    ["ha", "blar"],
    conjugations: { present: [...], preterite: [...], ... }
  },
  frequency: { band: "A1", rank: 12, corpus_frequency: 9823 },
  domains:   ["general"],
  tags:      []
}
```

---

## Rules for Contributors (Human or AI)

1. **The only frontend files that matter are in `backend/public/src/`.**
   Do not create `frontend/`, `src/core/`, `src/features/`, or any other
   parallel directory. If you see one, delete it.

2. **Always run `npm run validate` (or `npm start`) before declaring
   something fixed.** It checks for null bytes, truncated files, and syntax
   errors. If it fails, the app will not work.

3. **Run `npm run lint` after any edit to a JS file.** ESLint catches
   `no-undef` errors (missing imports, typos) before they reach the browser.

4. **The entry point is `app.js`.** Everything must be imported and wired
   there. If you add a new module, import it in `app.js`. If a function
   seems "not working", check `app.js` first — it's probably not connected.

5. **Do not edit `data/vocabulary.db` directly.** Vocabulary data is managed
   by a separate pipeline. The app only reads from the database.

6. **`backend/.env` is never committed.** Copy `backend/.env.example` to
   `backend/.env` on a fresh checkout. The server will fail to start without
   it (dotenv is loaded in `index.js`).

---

## First-Time Setup

```bash
# 1. Install dependencies
cd backend && npm install

# 2. Create .env
cp .env.example .env

# 3. Validate source files are intact
npm run validate

# 4. Start dev server
npm run dev
# → http://localhost:3000
```

---

## Common Failure Modes & Fixes

| Symptom | Likely cause | Fix |
|---|---|---|
| Blank page, no errors | `app.js` truncated or throws at import | Run `npm run validate` |
| Spinner never goes away | `ui.js` missing `hideLoading` export | Run `npm run validate` |
| Start Quiz does nothing | `filterWords` crashes (word-filters.js truncated) | Run `npm run validate` |
| TTS speaks English for all languages | `tts.js` language map uses full names not short codes | Check `LANG_TAGS` in `tts.js` |
| Domain filter has no effect | `getSelectedDomains` not passed to `bindStartHandler` | Check `app.js` line ~83 |
| Server won't start (SyntaxError) | Null bytes or truncation in a backend `.js` file | Run `npm run validate` |
