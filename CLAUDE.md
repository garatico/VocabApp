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
│       ├── ui/word-editor/          # The shared Word Editor (filter bar + paged list + edit form)
│       │                            #   used by the Admin panel AND My Content — see below
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
- **One Word Editor, two hosts.** `src/client/ui/word-editor/` is the whole
  editor (`createWordEditor`): filter bar, paged word list, and an edit form
  with collapsible sections, chip inputs and an emoji picker. It knows nothing
  about storage; a host passes a `WordEditorAdapter` (`types.ts`). The Admin
  panel's adapter (`admin/admin-editor.ts`) reads and writes the master
  database through the admin data client. My Content's
  (`modes/my-content/word-editor-adapter.ts`, the Words tab) turns an edit
  into an *override* — only the fields that
  differ from the original — via the pure `diffToOverride`, so a learner's
  edits never touch the real vocabulary. Every element id takes an `idPrefix`
  (`''` in Admin, whose e2e spec and styles use the plain ids; `mcwe-` in My
  Content) so two hosts can share a page.
- **`public/styles/app/word-editor.css` is generated** from the Admin
  stylesheets (`admin/inputs|buttons|filter-bar|word-list|edit-form.css`) by
  `scripts/word-editor-css.mjs`, with every selector scoped under
  `.word-editor`. The Admin stylesheets remain the source of truth (they style
  bare elements globally, which the main app cannot). Edit those, then run
  `npm run build:word-editor-css`; `tests/client/word-editor-css.test.ts`
  fails if the checked-in copy is stale.
- **Accessibility is a tested bar, not a wish.** `tests/e2e/a11y.spec.ts` runs
  axe-core (WCAG 2.1 A/AA + best-practice) on every tab, light and dark, with and
  without a quiz running, and expects *zero* violations. Colour pairs come from
  `variables.css` tokens — text on a solid accent fill uses `--on-accent` (white
  in light, near-black in dark), never a literal `#fff`; a user-chosen colour
  (folders) is mixed toward `--text` before being used as text. Result messages
  are `role="status"` live regions. Only real tabs carry `aria-selected` (the
  Admin link shares `.mode-tab` but is not one). Run it with
  `npx playwright test tests/e2e/a11y.spec.ts`.
- **Photos are optimized on the way out, never rewritten.** `data/images/` is
  what the app is *given* (27 MB of Wikipedia originals, the biggest 2.4 MB), so
  `lib/image-optimizer.ts` derives a resized WebP on the first request that
  accepts one (`Vary: Accept`) and caches it under the OS temp dir. `sharp` is an
  *optional* dependency — without it the originals are served. Only the
  `flatStatic` path does this: a local `public/images/` copy (gitignored) is
  served by plain `express.static` and is not optimized. The packaged Tauri app
  bundles originals as-is.
- **The whole-language vocab response is built once** (`lib/vocab-response.ts`):
  stable content-hash ETag, brotli-10/gzip-9 precompressed in the background, one job at a time (q11 cost
  ~18 s of CPU per language for 7% more, and starved the rest of the server).
  Nothing per-request (timestamps!) may go in that body, or the ETag — and the
  service worker's "vocabulary updated" check that compares it — breaks.
- **First visit asks "where are you starting?"** `utils/level-plan.ts` maps four
  plain-language levels onto the Words controls (Most Common 100, or CEFR bands
  A2 / B1+B2 / C1+C2); `ui/level-picker.ts` applies a plan by *clicking the real
  controls*, so their own handlers persist it and rebuild the pool. It lives in
  the welcome card, shown once (`s_onboarding_seen`) and re-openable from Settings.
- **Keyboard:** `ui/choice-keys.ts` (1–9 answer multiple choice), `ui/global-shortcuts.ts`
  (`g`+letter to change tab, `r` review due, arrows on the tab bar, roving tabindex).
  New shortcuts belong in the list in `ui/shortcuts-overlay.ts` too.
- **Settings is five files, not one.** `settings.ts` is the data layer everything
  imports (the `Settings` getters, `apply*` for colours/font/density, the
  change-listener setters). The Settings *screen* is `settings-ui.ts` (control
  binding, restoring state, daily goals), `settings-appearance.ts` (colour and
  language pickers), `settings-search.ts` (glossary + search) and
  `settings-streak.ts` (readouts + calendar). New code that only needs a saved
  value imports `settings.ts`; only the Settings screen imports the others.
- **My Content is a folder of sections.** `modes/my-content-mode.ts` is only the
  entry (`renderMyContent`, cross-tab navigation, the Words section);
  `modes/my-content/` holds `layout` (tabs, collapsibles), `shared` (DOM helpers,
  pager), `languages`, `trivia`, `guess-blank`, `word-search`, `pictures` and
  `csv-export`. Sections import the shared pieces, never each other's internals
  (the one exception, guess-blank reusing trivia's sort/filter helpers, is
  one-way — keep it acyclic).
- **Storage changes are guarded by a golden fixture.** `tests/helpers/storage-fixture.ts`
  seeds localStorage by calling the app's *own* writers (frozen clock, seeded
  randomness), and reads it back through the app's *own* readers into a plain
  "semantic" snapshot. `tests/client/storage-golden.test.ts` pins both
  (`tests/fixtures/storage/current.{raw,semantic}.json`) and fails if the app
  writes something different, can no longer read the old dump, or if a key family
  appears in the source that the fixture neither covers nor lists in
  `KNOWN_UNCOVERED`. **A new key or a changed value shape** fails it on purpose:
  extend the seeder, run `UPDATE_STORAGE_GOLDEN=1 npx vitest run tests/client/storage-golden.test.ts`,
  and *read the diff of the golden files* before committing. Keys labelled `raw`
  in the golden are hand-seeded (DOM-bound writers); irreplaceable data must be
  `api`. This is Phase 0 of the storage-migration plan (registry and versioned
  migrations come next); nothing about key names has changed yet.
- **Flat asset URLs, explicit index**: `data/images/` and `data/emoji/` are
  partitioned by domain on disk and flat in the URL space. `lib/flat-static.ts`
  builds one filename → path index and *reports* a name that exists in two
  domains, rather than a stack of `express.static` mounts where one file
  silently shadows the other.

---

