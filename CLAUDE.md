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
- **`src/client/styles-lazy/word-editor.css` is generated** from the Admin
  stylesheets (`admin/inputs|buttons|filter-bar|word-list|edit-form.css`) by
  `scripts/word-editor-css.mjs`, with every selector scoped under
  `.word-editor`. The Admin stylesheets remain the source of truth (they style
  bare elements globally, which the main app cannot). Edit those, then run
  `npm run build:word-editor-css`; `tests/client/word-editor-css.test.ts`
  fails if the checked-in copy is stale.
- **Stylesheets are split into first-paint and lazy.** `public/styles/app/*.css` (via `styles-entry.css`) is what the first paint downloads;
  `src/client/styles-lazy/<mode>.css` holds the rules for classes that only a lazily-loaded mode renders (My Lists, My Content + Word Editor,
  Conjugation, Picture, Trivia, Guess the Blank, Sentence Scramble, History, AI Chat). Each lazy file is `import`ed by every module that uses
  its classes (Vite then ships it as that mode's own CSS chunk, fetched with the mode — first-load CSS went 50.8 -> ~31 KB gzipped).
  `my-content-bundle.css` imports `my-content.css` then `word-editor.css`: **two lazy files that can be on screen together must be
  bundled in order**, because separate CSS chunks do not guarantee a load order. **Order is the hazard:** a moved rule now loads *after*
  everything in the eager sheets, so it wins ties it used to lose. A rule may only move if no rule that stays shares one of its classes
  and comes later in the original order, and a moved `@media` block must stay after the base rules it overrides.
  `tests/client/lazy-css.test.ts` fails if a lazy rule is only about a class that `index.html` or the first-load import graph from
  `app.ts` uses (it belongs in the eager sheet) or a lazy file is imported by nothing. New styles for a lazy mode go in its lazy file.
  The split was verified with 144 screenshots (4 viewports/themes x every tab and sub-view) diffed against the pre-split build, plus a
  computed-style diff per regression: a class used on the first paint but styled only in a lazy file renders unstyled until the mode loads.
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
- **Words can travel "compact"** (`src/shared/vocab/compact-word.ts`): `compactWord` drops what the client can restore — `frequency.rank` (== `rank`), `glosses` when it is just `[translation]`, `reflexive:false`, `is_function_word:false` — and `expandWord` puts it back, so the in-memory `Word` is unchanged. It is **opt-in on the API** (`?compact=1`; the response says `compact:true` and the client expands only then) because a service-worker-cached older client cannot expand, and always on in the static JSONL. A field `shapeWordRow` always emits that is derivable or defaulted can be added to the pair; **`register` must not** (absent means unknown, not neutral). `tests/compact-word.test.js` pins the round trip on the real shaper's output and `tests/compact-api.test.js` the opt-in. Worth ~10% of the gzipped transfer.
- **The hosted web app is a static site** (`render.yaml`, `runtime: static`; the old Node web service kept exceeding a small instance's memory — ~800 MB RSS with all languages loaded, since the parsed words, raw JSON and gzip/brotli copies are held per language). `build:static` (`scripts/build-static.ts`) stages `data/{images,emoji,svgs}` into `public/`, shrinks the staged photos to 800 px (the server did this per request), runs vite, then the export. Admin and `/api` are not part of that deploy.
- **A static-only web build exists** (`npm run build:static` -> `scripts/build-static.ts`, which runs `VITE_STATIC_VOCAB=1 vite build` then `export-static-vocab.ts --static dist`): no `/api`, one rank-ordered JSONL per language written straight into `dist/data/` (never `public/`), streamed by `vocab-source.ts`'s `streamJsonl` so the first 200 words paint while the rest downloads. Packaged builds still use the whole-file JSON.
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
  `api`. This is Phase 0 of the storage-migration plan; nothing about key
  names has changed.
- **Every storage key family is declared in `utils/storage-keys.ts`** (Phase 1): its class
  (`data` / `settings` / `ui` / `bookkeeping` / `legacy`), owner file, and whether a full
  backup carries it. Classification is by entry, not prefix (`vq_history_collapsed` is UI
  under the `vq_history_` data prefix; exact keys beat prefixes, longest prefix wins).
  `full-backup.ts` asks the registry. A new key must be registered *and* seeded in the
  fixture; `tests/client/storage-keys.test.ts` fails on an unregistered family, a dead
  entry, or any change to what a backup includes (it diffs against the old hand-written
  filter, kept there as the oracle). Names are untouched — this is about knowing, not moving.
- **Stored data is versioned and migrated on startup** (`utils/storage-migrations.ts`).
  `vq_schema_version` holds the id of the last completed step; `storage-boot.ts` — imported
  *first* in `app.ts` and `admin.ts` so it finishes before any module reads storage — runs
  every newer step in order. Steps are **self-contained** (raw keys only; they must not
  import modules that evolve), **idempotent**, and **write the new value before removing the
  old**; a failing step stops the run, leaves the version where it was, and retries next start.
  To add one: append `{ id: N+1, … }` (never edit or reorder a shipped step), add a legacy
  fixture case and a per-step test in `tests/client/storage-migrations.test.ts`, and if the
  layout of a *seeded* key changes, regenerate the golden. A full backup records its `schema`;
  a restore sets the version back to it so the steps run over the restored data. The old lazy
  migrations in `mastery.ts` / `word-lists.ts` / `user-content.ts` are still there as belt and
  braces; the test file proves the two agree (hand-built and 60 fuzzed browsers).
- **Conjugation is `conjugation/{index,helpers,card}.ts` plus one file per view.** Small shared
  helpers (`verbKey`, `hiddenPronounSlots`, `missingDataSlots`, `isSingleForm`, the summary) live
  in `helpers.ts` so One at a Time / Random Table / Card Match import them without loading the
  Grid view; `card.ts` builds one verb's card; `index.ts` is the Grid/Full render function.
  Known limit: `renderConjugationMode` (~1,350 lines) is a single closure whose parts share
  state, so it cannot be split by moving lines — only by a real refactor to explicit shared
  context. Don't try a line-range split on it.
- **Folders nest by path.** A folder's name is its whole path (`Spanish/Verbs`), so the registry stays a flat `string[]` and every list's `folders` array is unchanged. `folders.ts` owns the rules (`folderParent/Leaf`, `isInFolderTree`, `moveFolderPath`, `withAncestors`); rename and delete act on the whole subtree; the sidebar draws them through `renderFolderTree` (`sidebar-folders.ts`), which the generic sections and Testing Profiles both use. A parent needn't be registered — the tree fills in missing levels.
- **Nothing-selected is a real state in My Lists**: `deselectAll(ctx)` sets `selectedList = NO_SELECTION` (a NUL-wrapped sentinel, like `BROWSE_ALL_LIST`) with every other selection null, which stops the sidebar falling back to the first list. Clicking the open card again, or the ✕ that `renderPanel` adds top-right (sticky, zero-height wrapper), does it. A test that clicks a card to "open" it must not click one that is already open (created or auto-selected) — that now closes it. The Move/Copy popover is two collapsible sections coloured from the sidebar's `--ml-accent-*` tokens; open folders are darker than their section's wash, one shade lighter per nesting level (`--fd` in `my-lists.css`).
- **Confirmations use `ui/dialog.ts`, never `window.confirm`.** `askChoice` (named buttons) and `confirmDialog` (one named action + Cancel, resolves to a boolean) are styled by `public/styles/app/dialog.css`, imported by both the app and admin entries. Handlers that confirm are `async`. In e2e, answer with `confirmNext(page)` / `cancelNext(page)` from `tests/e2e/helpers.ts` *before* the click (a Playwright locator handler only runs during a later action, so it can't answer the dialog its own click raises).
- **A merged multi-language pool is one frequency order**: `utils/merged-pool.ts` merges every chosen language's words (after the POS filter) by rank and takes the first N — not N÷languages from each. Rank Range and Level still filter each language independently.
- **Add-to-list pickers share `ui/list-sections.ts`** with My Lists' Move/Copy popover: colour-coded, collapsible Single-/Cross-Language sections, a flag per list and (unless `Settings.getListPickerCounts()` is off) its word count.
- **Drag-and-drop covers lists and folders** (`sidebar-dnd.ts`). A card dropped on a folder head is filed there (moved, if it was dragged out of another folder); a folder head dropped on another nests inside it (never inside itself); the "move out" strip at the bottom of a section (`makeRootDropTarget`) takes a card back to ungrouped and a folder back to the top level. The strip is armed only for the section being dragged and only when the dragged thing is inside a folder, and sits *below* the rows — anything that shifts layout above the pointer mid-drag makes the drop miss. `moveFolder` (in `sidebar-folders.ts`) is a rename to the new path, so it reuses the rename cascade.
- **Aggregate lists are cross-language lists with `meta.sources`** (`{lang, list}[]` on `ListMeta`). `getMultiList` / `isInMultiList` / `getMultiListCount` include the source lists' words live (tagged `via`), so quizzes and the panel need no special case; `getMultiListOwn` is only what was added directly (backups). Renaming or deleting a single-language list retargets the sources; a list with sources isn't auto-deleted when its own words run out. Derived words are read-only in the panel. Single-language lists can be aggregates too (same `meta.sources`, same-language sources only): `getList` is the effective list, `getListOwn` only what was added directly (backups, delete-undo), sources are followed through other aggregates with a visited set so a cycle can't loop, and `getListSourceCandidates` hides lists that would close one.
- **My Lists sidebar = kit factories.** `my-lists/sidebar.ts` (~300 lines) holds the header UI,
  keyboard navigation and `render()`, and wires the rest: `sidebar-menu.ts` (gear menu),
  `sidebar-pickers.ts` (emoji / folder style / hide-from), `sidebar-dnd.ts`, `sidebar-folders.ts`
  (section heads, folder groups, `renderSection`), then one module per section
  (`sidebar-single|smart|multi|profiles|visual.ts`). Each is `createXKit(deps)` / `createXSection(kit)`:
  the code sits inside the factory, dependencies are destructured from an explicit argument, and
  state that used to be per-`createSidebar()` call (menu owners, the dragged item) stays per
  factory call. `SidebarKit` (`sidebar-kit.ts`) is the shared bundle the sections receive. Add a
  section by writing a module against `SidebarKit`, not by reaching into another module's state.
  `tests/e2e/my-lists-sidebar.spec.ts` pins the behaviour and passes on both the old and new code.
- **The Settings screen is organised by what you want to change, not by mode.** The side nav has
  five headings (Quizzes / Display / Content / Progress / App) and the sections in `index.html`
  follow the same order — `tests/e2e/settings-organisation.spec.ts` fails if they drift apart.
  How things *look* (row density, columns, badges, and every colour picker under a "Colors"
  subheading) lives in **Appearance**; a quiz section keeps only what changes how the quiz behaves.
  A new colour picker or display toggle goes in Appearance. **"Changed from default"** compares each
  row with its markup as shipped (snapshotted in `bindSettings()` before saved values are painted
  on), so the `.active` button / selected option in the HTML *is* the default and must match the
  getter's fallback in `settings.ts`; the spec fails on a fresh browser if any row reads as changed.
  Rows built by JS after load (the daily-goal rows) opt out with `data-goal-row`. The same snapshot
  drives the per-row ↺ and each section's "Reset section" — they click the default button / reselect
  the default option, so the setting's own handler persists and repaints. Each section has one
  colour (`--sec`, set on the section *and* its nav link in `settings.css`); advanced-only groups sit
  together in one `.settings-fold` per section (still hidden unless Advanced mode is on); descriptions
  are one line — anything longer belongs in a Glossary entry. **Keep the default view small:** a new
  user should see only the essentials (a handful of rows per section); anything that is tuning goes in
  that section's fold. A section's fold is `#settingsFold-<section>`, and a group inside it needs an id
  starting `settingsGroup` for search to find it. **Resets are undoable**: row / section resets
  capture the controls' current state first (`captureRow`) and offer Undo in the existing
  `undo-toast`; "Reset all" reloads, so its snapshot rides through `sessionStorage` and the toast
  appears after the reload. What the markup can't describe — colour pickers, daily goals, the timed
  minutes — is `settings-extras.ts`. **Control ids are public**: `#setting=<id>` links, Glossary
  "Go to setting" buttons and `data-setting-link` (the quiz screen's ⚙ links) all use them, so don't
  rename one. Every label/description in Settings needs a `data-i18n` key with a Spanish entry
  (`tests/client/settings-i18n.test.ts`), and `tests/client/settings-defaults.test.ts` runs the real
  Settings code over the real markup and fails if any row reads as changed on empty storage. The section last read is remembered in
  `s_settings_section`. **Help & Tips** (last, under App) is explanation, not settings: a row per tip (with a
  `data-setting-link` where one helps) and the CSV guide — `settings-help.ts` draws each CSV file as a spreadsheet from
  `csv-schema.ts` and the exporter's own `vocabCsvCells`, with `renderCsvDocs`'s column reference below it. Like the Glossary
  it is exempt from the one-line description rule.
- **Flat asset URLs, explicit index**: `data/images/` and `data/emoji/` are
  partitioned by domain on disk and flat in the URL space. `lib/flat-static.ts`
  builds one filename → path index and *reports* a name that exists in two
  domains, rather than a stack of `express.static` mounts where one file
  silently shadows the other.
- **Every exact answer-matcher in `utils/utils.ts` has a prefix twin.** `isCorrect`/
  `isReverseCorrect`/their `Strict` variants (and the dispatchers `matchesAnswer`/
  `slotMatches`) share one internal impl parameterized on `exact`; the `!exact` side
  (`isCorrectPrefix`, `couldStillMatch`, `slotCouldMatch`, …) asks "could more typing
  still land on an accepted answer" rather than "does this match now" — empty input is
  always still possible, never correct. This is Sudden Death's plug-in point
  (`Settings.getSuddenDeath()`): each typed-answer mode's own `input` listener adds an
  `else if` next to its existing correct-check that marks the cell wrong the moment
  the prefix check fails, reusing whatever CSS class/state that mode's own Give Up
  already uses for "wrong" — never a new state. Multiple-choice needs nothing (a click
  already locks in immediately); Table's free-recall (Double Recall) and Trivia's
  one-at-a-time (Enter-to-submit, already single-shot) are structurally exempt, not
  omissions.
- **CSV columns are declared once, in `src/shared/vocab/csv-schema.ts`.** Every exporter (My Content, the
  Admin export, the desktop Admin export, the Table's Export CSV) takes its header row from it and quotes every
  cell with its `csvCell` (never a local escaper — there were four, none of which quoted `\r`), and
  Settings → Glossary → "CSV formats" renders its tables from it (`renderCsvDocs` in `settings-search.ts`),
  along with the rules for the one file the app reads (My Lists' Bulk import). **Adding, removing or
  reordering a CSV column, or changing what a cell holds, means editing that file** — and its `format` /
  `description` text if the meaning changed. A new CSV (import or export) gets an entry in `CSV_FORMATS` or
  `BULK_IMPORT_RULES`. `tests/client/csv-schema.test.ts` fails if an exporter drifts from the schema.
- **Portuguese, French and Italian verb tenses the database lacks are derived on load**
  (`data/derived-tenses.ts` → `pt-tenses.ts` / `fr-tenses.ts` / `it-tenses.ts`), from the forms each row
  has, and never replace a form the row does have. Anything the ending can't settle (an unlisted French -oir
  participle) is left empty rather than guessed. The real fix for a language is still to add the forms to
  VocabApp-Data; delete the deriver's tense once the data carries it.
  Portuguese and Italian also get compound tenses (`present_perfect`, `pluperfect`, `future_perfect`, `conditional_perfect`,
  `subjunctive_perfect`, `pluperfect_subjunctive`) built from the auxiliary + the row's participle — Portuguese with "ter", Italian with
  avere or essere (`italianUsesEssere`: a listed set of motion / change-of-state verbs, the `ri-` forms and -venire; masculine, plural slots
  agree) — and Portuguese the `personal_infinitive`. Italian's `preterite` is the passato remoto the rows already carry (it was never offered).
- **First paint doesn't wait for the whole vocabulary** (`loadWordsProgressive` in `data-loader.ts`): the
  most frequent 200 words arrive at once from a paged source, the rest loads in the background behind a
  corner spinner (`#vocabBgLoading`), and the filters are rebuilt when it lands. Start waits for it
  (`whenVocabComplete`), so a quiz is never drawn from the partial pool. Only `app.ts` uses the progressive
  path; every other loader still gets the whole language.
- **Starter Lists are Smart Lists with `starter: true`** (`my-lists/starter-lists.ts`), shown in their own
  section above Single-Language Lists (`createSmartSection(kit, { starter: true })` — the same code, filtered
  by the flag) and kept out of the Smart Lists section. They are rank-ordered and *capped* (Top 20 words /
  verbs / nouns / adjectives in "Most Common", 30 per topic in "By Topic"), never open-ended. Folder scope is
  `starter_<lang>`. Seeded once per language (`ml_starter_seeded_<lang>` = `v2`); the old `'true'` value means
  the unlimited v1 lists were made, and seeding removes those still exactly as made. Because they live in
  `vq_smart_*`, not `vq_lists_*`, they never count as learner data for the backup reminder.
- **Start can collapse the controls panel** (Settings → Appearance → "Collapse controls on Start", `collapse_controls_on_start`, *off* by default — opt in): `start-handler.ts` calls `setSectionOpen('controlsBody', false)` (`filters/section-collapse.ts`) once a quiz has actually been built, then scrolls to the top. `setSectionOpen` deliberately does **not** save — only a learner's own click on ▾ is remembered in `s_section_open_controlsBody`, otherwise the next visit would open with the setup form shut. The ▾ itself carries `hidden` on tabs with no filter form (`ui-state.ts`); `shortcuts.css` has an explicit `[hidden]` rule for it because its class `display` otherwise wins over the attribute.
- **Table answers can ask for several meanings** (`utils/gloss-required.ts`, `neededMeanings`/`slotMatches(..., meanings)` in `utils.ts`): a word flagged "Meanings needed: 2" in My Content's Word Editor (not in the quiz — `answerMeanings` on the editor options) (`vq_glossreq_<lang>`, word -> count, wins) or the Settings → Table Quiz "Meanings to type" default must be answered with that many *different* senses separated by `,` `;` or `/` (a sense is one element of `glosses`, so "a, an" is one; the count is capped at the word's own senses). Sudden Death requires each finished piece to be a sense and the tail to still be a prefix of one. English answers only.
- **Table can be multiple choice** (Settings → Table Quiz → Answer by, `table_answer_style`; choices per word and what a wrong pick does live in the Advanced fold). `table-mode.ts` keeps the row's `<input>` as its state carrier (value / disabled / result class) and hides it, showing `.mc-choices` instead, until the row is answered, revealed or given up on (`syncChoiceView`, run by the same `genderSyncFns` hook Give Up already calls). A correct pick goes through the one typing path (`input` event); a wrong one is `markIncorrect()` (shared with Sudden Death) or, with "Try again", a struck-out button. Wrong options come from `distractorPool` (the whole quiz) — same POS first, never a text the entry would accept. A row with nothing to contrast with falls back to typing. Standard style only.
- **My Lists is two screens on a phone (<600px)**: `my-lists-mode.ts` starts with nothing open (`initialSelection`) and sets `data-ml-phone="index|detail"` on `#myListsBar` and `#myListsWrap`; `styles-lazy/my-lists.css` ("Phones: two screens") shows only the index (page-scrolled, no nested scroller, toolbar as a button grid) or only the open list under a sticky `← Lists` strip (`deselectAll`). Fixed bottom elements (toasts, banners, popovers via `positionPopover`) add `env(safe-area-inset-bottom)` so the Android back/home/recents bar never covers them; `capacitor.config.ts` sets `SystemBars` to native insets.
- **My Content and History on a phone** follow My Lists: the language box shares the streak/dice line (History's own row; My Content moves the Words editor's language `.filter-field` into `.mc-lang-slot` on the Words tab only), the due badge is hidden on My Lists and My Content, Backup sits at the right end of the tab row as a dashed pill, and the Word Editor (`.mc-we`) is two screens (`data-we-phone="index|detail"`, `← Words` strip, set from the form card's display). Sticky strips need `overflow: clip` on `#myListsArea` / `#myContentArea` — `hidden` silently defeats `position: sticky`. The bottom notices (resume / update / undo) are a docked card on phones.
- **The word popover tucks conjugations behind "Show Conjugations"** (`buildWordDetailContent`'s `conjOnDemand`, not used by the hover tooltip or Conjugation mode), and tapping the same word again closes it (`_anchor` on the popover).
- **Phone Table is stacked by default** (word above its answer box, `body:not(.table-phone-side)` in `table.css`; Settings → Appearance → Phone layout opts back into side by side). Conjugation's pager is Table's (`.pager-btn` / `.pager-select`); verbs per page is only the Settings value, read at Start.
- **Android (Capacitor 8) builds with `npm run build:android`** -> `android/app/build/outputs/apk/debug/app-debug.apk` (~48 MB, debug-signed; fine for sideloading, not for Play). `android/` is gitignored; recreate with `npx cap add android` (`capacitor.config.ts` is tracked). It needs **JDK 21-24** on `JAVA_HOME` — Capacitor compiles to Java 21 and its Gradle 8.14 cannot *run* on 25 ("Unsupported class file major version 69"), which is what Android Studio bundles — and `ANDROID_HOME` (default `%LOCALAPPDATA%\Android\Sdk`). The web bundle inside is the whole-file JSON export, not the static JSONL one.
- **Every My Lists word list is a spreadsheet-style table** (Single-Language, Cross-Language, Smart and Browse All Words): `modes/my-lists/column-header.ts` (`createColumnHeader`) is the header over it — Word, POS, CEFR, Rank, Definition, Percent, Mastered. Each column has a sort button (ascending → descending → off), a filter (a text box; numeric columns take `>100`, `<=50`, `10-50`; POS, CEFR and Mastered are Excel-style checklists where every value starts on and unticking turns it off — an *include-set*, empty meaning all on, so `ctx.selectedPos/Bands`, which Add Vocabulary's results also narrow by, are passed in as the header's sets) and a right edge that drags to resize (`--ml-w-<column>` variables, remembered in `ml_col_widths`) and double-clicks to fit. By default every column but Definition (the flexible one) is fitted to its rows on screen (`autoSizeUnset`, grow-only while open, never saved); a learner's drag or double-click wins and is the only width stored. The `.ml-table` box has no side margin, so it is exactly as wide as the Add Vocabulary box above it. The sort/filter rules are `utils/column-view.ts` and the resize/fit logic `utils/column-resize.ts`, **both shared with the Admin Table View** — change a rule there and both grids change. A panel's part is small: `columns.attach(listEl, ACTIONS_WIDTH)`, `applyColumnFilters` in its filter step, `applyColumnSort(...) ?? ownOrder` in its sort step, `columns.sync()` after drawing. A list with no column selected keeps its own order (alphabetical, recently added, or the rule's). The old broad filter box, Sort dropdown, POS/Level dropdowns and Hide mastered button are gone — those are columns now. `attach` wraps header and list in one `.ml-table` box; rows are built by `row-shared.ts` `buildRowCells`/`buildWordRow`, one `.ml-cell-<column>` per column in every row (empty if need be) so the dividers — the cells' own right borders — run unbroken, and the row's actions are one `⋯` menu (`buildActionsCell`, `position: fixed` and self-correcting for a transformed ancestor). **The header and rows share named grid tracks**, so a row's cells must be those cells; an extra child with no column pushes everything after it out from under its header. Below ~800px of *list* width (not screen width — beside the 440px sidebar a 1024px window leaves ~570px) the header and rows go compact (`ml-cols--compact`, set by a `ResizeObserver`): a stacked header behind the Columns button, no dividers. Compact rows share one word width, `--ml-cword-w` (the widest word on screen, capped at 60% of the room word and meaning share; `fitCompactWord` in `column-header.ts`), so a short word is never ellipsized beside a half-empty meaning and the rows still line up.
- **Random Sample** is a third value of `#sizeModeToggle` (`data-mode="sample"`, saved in `vq_size_mode`): the
  pool is NOT cut to a rank window (app.ts `loadAndBuildFilters`), and Start (start-handler.ts) picks N at
  random from whatever the filters and lists leave, keeping the list's own order. Top N pool only; Conjugation
  has its own size control and does not offer it.
- **Single-Language Lists' green is a fixed value** (`--ml-accent-single` in `shared/variables.css`, light and
  dark), not `var(--accent)`, so a colour theme never recolours them; the Settings colour picker still can.
- **The Table controls bar is compact and colour-coded.** Quiz Style and Words' take-mode are dropdowns and
  Direction is a click-to-cycle button, but each is a *proxy* (`ui/toggle-proxy.ts`) for the original chip row,
  which stays in the page, hidden (`.ctl-proxied`), as the real state — every saved setting, Testing Profile
  and resume point still reads and writes those buttons. Change the options by editing the chip row. Each
  option carries `data-cc="<key>"`; `controls-bar.css` derives its tint/border/text from `--cc-<key>`
  (defaults in `variables.css`, light and dark), and Settings → Appearance → Quiz Controls Colors overrides
  them (`CTL_COLOR_DEFS` in `settings.ts`, stored as `s_ctl_color_<key>`). **A new option needs a `data-cc`, a
  `CTL_COLOR_DEFS` row and both theme defaults** — `tests/client/ctl-colors.test.ts` fails otherwise. Language,
  Words and Quiz Style/Direction have fixed widths on a desktop bar (controls-bar.css), so switching pool mode
  or picking languages never moves the group beside them; a new control that widens one must widen its basis.
  The corner cluster (`#controlsCorner`: due badge, streak, dice, Profiles, ?) is reserved by its *measured* width
  (`--corner-w`, set by a `ResizeObserver` in `streak-widget.ts`), never a fixed rem — a fixed 11rem let the corner sit on
  Direction once the badge and dice joined it. The three groups plus a 12-due corner just fit one row at 1280px
  (`tests/e2e/controls-and-lists-layout.spec.ts`); anything that widens either costs that. Its height is measured too (`--corner-h`): the phone card's top padding and a collapsed card's height come from it. Below 600px Table pairs controls up rather than one per row — Language beside "+ Languages", Words' pool button beside the take-mode dropdown (the size row is `display: contents` so its pieces can join that line), Quiz Style beside Direction. Start Quiz sits under the filters *and* the "Active filters" summary, which collapses (`data-collapse="filtersSummaryBody"`; `renderSummary` fills `#filtersSummaryBody` and the count, never the toggle). The filter pills collapse too (`.filters-section-toggle`, `data-collapse="filtersRow"`). Conjugation's View and Display pair up on phones like Quiz Style and Direction. On Settings the bar holds `.settings-toolbar` (moved there by `ui-state.ts`) and `#settingsBarCollapseBtn` collapses it — its own section (`settingsToolbar`), so it never collapses Table's controls. **On a phone only the progress line is pinned**: `#tableStickyBar` and Conjugation's `.conj-sticky-bar` (with its section and block) are `display: contents` below 600px, so their rows scroll with the page and just `.progressWrap` / `.conj-progress-bars` stick — the whole bar was 155px (Table) and 340px (Conjugation) of an 844px screen. My Lists' and My Content's language selects use the flag dropdown too (`#mlLangSelect`, `#mcwe-langSelect`); on a phone, opening a list or picking a word scrolls the panel/form into view, and My Content shows no empty editor until a word is picked. On a phone the collapse button mirrors the corner box (same top, same height from `--corner-h`), the score pills are a 2×2 grid (4 across from 480px), and Active filters' chips start on their own line. **Gloss chips are ordered**: `createChipInput({ reorderable })` numbers each chip and drags it by its ⠿ handle with pointer events (HTML drag-and-drop doesn't fire on phones; only the handle is `touch-action: none`), keeping ‹ › for the keyboard. My Content's Conjugations tab picks tenses from a Tenses dropdown (a checklist that opens in place — the card clips anything floating). The Word Editor's chip filter panels shift left to stay on screen. `tests/e2e/mobile-layout.spec.ts` pins these. A tapped control under 30px tall on a phone fails it. **History is tabs**: Progress / Due for Review / Words to Review / Recent Sessions sit in `#historyBar` (the top bar, like My Lists' and My Content's), one view at a time; Due for Review's tab hides while its Settings switch is off. `vq_history_collapsed` is no longer read or written (still registered as UI so an old value is not learner data). Below 861px Settings' sections fold behind a "Section ▾" button (`.settings-nav-toggle`, labelled by the scroll-spy) instead of a sideways chip row. My Content's Download / Export CSV / Load a file are one "Backup & export ▾" menu (`attachMoreMenu`). The controls' collapse button mirrors the corner box at every width, so it never moves when it is clicked. On desktop (768px+) Start Quiz sits in the corner column, just under the corner box (`#filtersBar > #startBtn` is absolutely placed; the column reserves at least 11rem). **On a phone every Table setting is a dropdown**: Words' pool and Direction get phone-only pickers (`#poolModeSelect`, `#directionSelect`, `.ctl-phone`, proxied like the others in `app.ts`) in place of their cycle buttons; Words reads pool | count, then the take mode. The three filters share one row, each pill only its name and count — `placePillControls` (filter-bar.ts) moves On/Off and the link into the top of each panel below 600px and back above it — and a panel opens across the whole row.
- **The installed apps keep an automatic backup that survives uninstalling** (`utils/auto-backup.ts`): the full backup, rewritten at start, every 5 minutes and on going to the background, to `Documents/VocabApp/vocabapp-backup.json` (Tauri `plugin-fs`, scoped to that folder in `src-tauri/capabilities/main.json`; Android via `@capacitor/filesystem`, with legacy storage permissions for Android ≤10 added to the generated manifest by `build-native.ts`). A fresh install that finds it offers to restore (Windows reads it; Android 11+ can't read an earlier install's file, so it asks the learner to pick it, and writes its own `vocabapp-backup-<date>.json`). Nothing is written until that first-start check is settled, and "Start fresh" never overwrites the old file. `s_auto_backup_file` (bookkeeping, never backed up) is this install's file name. The web app keeps the manual download.
- **The language dropdown is a listbox over the native select** (`ui/language-dropdown.ts`): each entry and the
  closed button show the language's flag (SVG — Windows has no flag emoji) and its `--lang-<name>-bg` tint. The
  `<select id="langSelect">` stays in the page, visually hidden, as the source of truth, so `.value`, `change`
  listeners and Playwright's `selectOption` all still work; setting `.value` from code repaints the button.
- **Simple Mode's Table nav bar is one line at 1300px and up** (end of `table.css`): the wrappers dissolve
  (`display: contents`) and the pieces are ordered Order · Jump to Top · pager · Jump to Bottom · Next Gap ·
  Give Up · Retry · timer. Below that the two-row grid layout applies. Start does not wait for the background
  vocabulary in Trivia or Guess the Blank, which use their own question banks.
- **A word can opt out of ever being "due"** (`utils/srs.ts`'s `vq_srs_exempt_<lang>`
  Set, `isDueExempt`/`setDueExempt`) without touching its schedule — `srsDueWords`
  filters it out, so the header badge, History's Due for Review and a Smart List's
  `due: 'yes'` rule all stop surfacing it for free. The toggle lives on every word row
  via `row-shared.ts`'s shared `buildWordRow`, next to the mastery button — gated by
  `Settings.getDueExemptEnabled()` (Session History section), the master switch: off
  hides the button (nothing to toggle once it has no effect) and `srsDueWords` stops
  reading the exemption set at all, rather than deleting it — a word marked exempt
  earlier resumes being excluded the moment the switch goes back on.

---

