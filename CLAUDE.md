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
│   │   ├── gender.test.ts
│   │   ├── answers.test.ts
│   │   └── quiz.test.ts
│   └── helpers/
│       ├── app.js                   # buildTestApp() / teardownTestApp()
│       ├── db.js                    # createTestDb() — in-memory SQLite seed
│       └── sqlite-shim.js           # better-sqlite3 shim using sql.js WASM
├── vitest.config.js                 # aliases better-sqlite3 → sqlite-shim in tests
├── .vscode/                         # shared run configs — the ▶ play button
├── .github/workflows/ci.yml         # CI for the app; VocabApp-Data has data.yml
├── scripts/
│   ├── validate.js                  # null-byte/syntax check — pre-commit hook (npm run validate)
│   └── test-api.js                  # manual smoke-test for the running API
├── data/                            # what the app is *given*; relocate with DATA_DIR
│   ├── vocabulary.db                # built elsewhere — see VocabApp-Data
│   ├── images/                      # Wikipedia photos (animals/, food/, nature/)
│   ├── emoji/                       # OpenMoji SVGs (animals/)
│   └── svgs/                        # shared custom SVGs
└── mobile/                          # Parked — not in active development; sources still tracked,
                                    #   only its own node_modules/ is ignored
```

VocabApp-Data — the SEPARATE PROJECT that builds the database — has moved out to sit
alongside this repo (`../VocabApp-Data`), not nested inside it. `DATA_DIR` in `.env`
points there. Nothing in `src/` or `tests/` may read a file out of it.

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
- **Cache invalidation**: every admin route that writes calls `clearCache()`
  on the languages it touched, so the next request reloads from SQLite rather
  than serving the copy from before the edit.
- **`createApp({ nodeEnv, serveStatic })` is authoritative**: CORS, rate
  limiting, error detail, cache lifetimes and the admin gate are all built from
  the value passed in. Nothing re-reads `process.env.NODE_ENV` behind it. They
  used to, which is why the test helper had to set the env var *and* pass a
  different value to `createApp` — an app told it was in two environments at
  once. `serveStatic` is separate from `nodeEnv` so a test app can be a
  *development* app that doesn't serve the SPA.
- **This app does not build its data.** VocabApp-Data does, and it is a
  separate project that happens to live in a subdirectory for now. Nothing in
  `src/` or `tests/` may read a file out of it —
  `tests/data-requirements.test.js` fails if anything starts to, because a path
  that works while the two sit side by side breaks the moment the folder moves,
  which is the entire point.
- **`src/server/lib/data-requirements.ts` says what the app needs**: which
  tables and columns, the oldest schema it can read, and the band cutoffs it
  displays. It is deliberately *not* a copy of the producer's schema. Two
  independent statements that must agree beat one shared file, because the
  disagreement is the thing worth hearing about.
- **The database says what built it**, and `checkDatabase` reads that at
  startup: it refuses to boot if a column the SELECT names is missing — the app
  would throw on the first request anyway, and failing at boot with an
  instruction is strictly better — and warns but keeps serving if the data is
  merely older. `getDbInfo` surfaces the same for the admin panel.
- **`band` is computed here and nowhere else.** The database has no band
  column. It used to: the pipeline wrote one on every sync and this app never
  selected it, recomputing the band from `rank` on every load. So it was a
  second copy of a derived value maintained across a project boundary, and the
  two disagreed for a long time — 500/1500/3000/5000/7000 here against
  200/500/1000/2000/4000 there, so a word ranked 3000 was B1 on screen and C1
  in the data. The fix was to stop shipping the derived value, which leaves
  nothing to keep in step.
- **Flat asset URLs, explicit index**: `data/images/` and `data/emoji/` are
  partitioned by domain on disk and flat in the URL space. `lib/flat-static.ts`
  builds one filename → path index and *reports* a name that exists in two
  domains, rather than a stack of `express.static` mounts where one file
  silently shadows the other.

---

