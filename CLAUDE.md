# VocabApp — Claude Notes

## ⚠️ Critical: Windows/Linux Mount Sync Issue

### What happens
The bash sandbox runs on Linux and mounts the Windows filesystem. When the
**Read/Write/Edit file tools** write a file, they write to the actual Windows
path. The Linux mount **does not sync immediately** — bash can see a stale,
truncated version of the file for an unpredictable amount of time afterward.

Symptoms:
- `wc -l file.js` reports far fewer lines than the file actually has
- Node.js parse errors ("Unterminated multiline comment", "Unexpected EOF")
  referencing a line number that doesn't exist in the real file
- `npm test` or `node src/...` fails on a file that looks correct in the editor

### The rule
**Never trust bash to verify a file that was just written by the file tools.**
The Read tool is authoritative. Bash is not.

### The fix — when bash needs the correct file content
Write the file *through bash* using a heredoc, not through the file tools.
This writes directly to the Linux filesystem layer and is immediately visible
to subsequent bash commands:

```bash
cat > /sessions/.../mnt/VocabApp/backend/src/some-file.js << 'ENDFILE'
// ... full file content ...
ENDFILE
```

After writing via bash, the file tools (Read/Edit) will eventually see the
updated content too, but the opposite direction (file tools → bash) can lag
by minutes.

### Workflow that avoids the problem entirely
1. Use file tools (Read/Write/Edit) for all file authoring — they're the
   source of truth and write to the real Windows files the user sees.
2. Use bash only to **run commands** (npm test, node scripts, etc.).
3. If bash reports a parse error on a recently-edited file, immediately
   mirror the file to bash using `cat > ... << 'ENDFILE'` with the correct
   content, then re-run the command.
4. Never use `wc -l` or `cat` in bash to verify file content after a
   file-tool write — use the Read tool instead.

### Null-byte truncation variant
Sometimes the Edit tool writes a file that bash sees as **correctly sized but
with 40-50 null bytes appended**. This causes "parse error at end of file" or
"unexpected EOF" errors. Detection and fix:

```python
# Detect
raw = open(path, 'rb').read()
print(raw.count(b'\x00'))  # > 0 means corrupted

# Fix
with open(path, 'wb') as f:
    f.write(raw.rstrip(b'\x00'))
```

Always run this check when tests fail with parse errors after an Edit.

---

## Project Structure

The app lives at the repo root (flattened from the old `backend/` subdir in
June 2026 — there is no root/backend split anymore, and no wrapper package.json).

```
VocabApp/
├── src/
│   ├── server/
│   │   ├── app.ts                   # Express app factory (no listen; trust proxy in prod)
│   │   ├── index.ts                 # Server entry point
│   │   ├── lib/
│   │   │   ├── vocab-loader.ts      # SQLite singleton + cache
│   │   │   ├── svg-loader.ts        # SVG URL resolver
│   │   │   └── verb-rules.ts        # Spanish conjugation engine
│   │   ├── routes/
│   │   │   ├── admin.routes.ts      # Mounts admin sub-routes (dev-only + localhost + auth)
│   │   │   ├── admin/
│   │   │   │   ├── _utils.ts        # validateLanguage helper
│   │   │   │   ├── words.ts         # GET/POST /api/admin/vocab
│   │   │   │   ├── db.ts            # /api/admin/stats, /meta, /cache/clear, /db/reload
│   │   │   │   └── export.ts        # POST /api/admin/export (CSV)
│   │   │   └── public.ts            # /api/vocab/:lang, /api/health, etc.
│   │   └── middleware/
│   │       ├── cors.ts              # CORS — exact-origin matching via new URL()
│   │       ├── admin-auth.ts        # Bearer ADMIN_SECRET, timingSafeEqual compare
│   │       ├── rate-limit.ts        # express-rate-limit on /api/vocab
│   │       └── error-handler.ts     # Global error handler
│   └── client/                      # TypeScript frontend (compiled by Vite)
│       ├── app.ts                   # Entry point
│       ├── types.ts                 # Shared type definitions
│       ├── start-handler.ts         # Quiz start logic
│       ├── admin/                   # Admin panel TypeScript (all in one subdir)
│       │   ├── admin.ts             # Entry point (Vite MPA, loaded by admin.html)
│       │   ├── admin-api.ts         # Shared fetch/status utilities
│       │   ├── admin-editor.ts      # Word Editor tab
│       │   ├── admin-stats.ts       # Statistics tab
│       │   ├── admin-db.ts          # DB Admin tab (cache clear, CSV export)
│       │   └── admin-conjugation.ts # Conjugation Practice tab
│       ├── data/
│       │   ├── visual-map.ts        # Word → image/emoji fallback map
│       │   └── data-loader.ts
│       ├── modes/
│       │   ├── picture-mode.ts      # Picture Quiz (type/flashcard/click modes)
│       │   └── …
│       └── …
├── admin.html                       # Admin panel Vite entry (dev: /admin, prod: dist/admin.html)
├── public/
│   └── styles/
├── tests/
│   ├── public.test.js
│   ├── admin.test.js
│   ├── svg-loader.test.js
│   ├── verb-rules.test.js
│   ├── client/                      # client unit tests (pure utils)
│   │   ├── match.test.ts
│   │   └── gender.test.ts
│   └── helpers/
│       ├── app.js                   # buildTestApp() / teardownTestApp()
│       ├── db.js                    # createTestDb() — in-memory SQLite seed
│       └── sqlite-shim.js           # better-sqlite3 shim using sql.js WASM
├── vitest.config.js                 # aliases better-sqlite3 → sqlite-shim in tests
├── .github/workflows/ci.yml        # CI: validate, lint, typecheck, test, build
├── scripts/
│   ├── validate.js                  # null-byte/syntax check — runs as pre-commit hook (npm run validate)
│   ├── test-api.js                  # manual smoke-test for the running API
│   ├── migrations/                  # One-off schema migration scripts (historical; already applied)
│   └── data/                        # all Python data scripts (PROJECT_ROOT = two parents up)
│       ├── sync_db.py               # curated JSONL → vocabulary.db  (npm run sync)
│       ├── delete_all.sql           # nuclear reset — deletes all rows from every table
│       ├── download_images.py       # fetch Wikipedia photos → data/images/  (npm run download:images)
│       ├── download_emoji.py        # fetch OpenMoji SVGs → data/emoji/  (npm run download:emoji)
│       ├── check_visual_coverage.py # report picture-quiz visual gaps  (npm run check:visuals)
│       ├── verb_rules.py            # DEPRECATED — safe to delete; see verb-rules.js
│       ├── corpus_to_curated.py     # corpus words → curated JSONL
│       ├── corpus_builder.py        # spaCy corpus extraction helpers
│       ├── lang_config.py           # shared language codes / tense maps
│       └── review_glosses.py        # gloss cache review helper
├── data/
│   ├── vocabulary.db                # Production SQLite DB (never touched by tests)
│   ├── curated/                     # Source-of-truth JSONL files per language
│   ├── images/                      # Wikipedia photos (animals/, food/, nature/)
│   └── emoji/                       # OpenMoji SVGs (animals/)
└── mobile/                          # Parked — not in active development; excluded from git
```

## Running Tests

```bash
npm test              # run once
npm run test:watch    # watch mode
npm run test:coverage # run with V8 coverage report (outputs to coverage/)
```

Tests use `sql.js` (pure WASM) instead of `better-sqlite3` so no native
compilation is needed. The alias lives in `vitest.config.js`. Tests never
read from or write to `vocabulary.db`.

## Key Architecture Decisions

- **SQLite singleton**: `vocab-loader.js` holds the one DB connection. Admin
  routes import `getDb()` from it rather than opening their own connection.
- **`setDb(testDb)`**: escape hatch added to `vocab-loader.js` so tests can
  inject an in-memory DB without touching the filesystem.
- **Cache invalidation**: every admin write calls `clearCache(lang)` so the
  public API immediately reflects changes without a restart.
- **Admin panel is a Vite MPA entry**: `admin.html` at the project root is a
  second Vite entry point (alongside `index.html`). In dev, `/admin` is served
  by Vite directly (rewrite plugin). In production, Express serves
  `dist/admin.html`. All admin TypeScript is bundled and type-checked by Vite.
- **Admin routes guard**: `isDevelopment` middleware in `admin.routes.js`
  returns 403 unless `NODE_ENV=development`. Tests set this before building
  the app.
- **Conjugation is JS-owned**: `src/server/lib/verb-rules.js` is the single conjugation engine. `vocab-loader.js` calls `conjugate()` at language-load time for Spanish verbs (result cached in memory). The DB stores only `conjugation_class`, `conjugation_overrides`, and `future_stem` — not the computed tense forms. For irregular verbs (e.g. ser, estar), all forms live in `conjugation_overrides`; the JS engine returns those directly. French/Italian/Portuguese predate this system and still have pre-stored `conjugations` JSON in the DB, which `vocab-loader.js` reads as a fallback when `conjugation_class` is absent. `verb_rules.py` is deprecated and safe to delete.
- **Synonyms not implemented**: `word_relations` table exists in the schema
  but is empty — synonyms were never migrated from the old JSON format.
  The admin edit form does not expose this field.

