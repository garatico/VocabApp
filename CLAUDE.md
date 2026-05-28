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

---

## Project Structure

```
VocabApp/
├── backend/
│   ├── src/
│   │   ├── app.js               # Express app factory (no listen)
│   │   ├── index.js             # Server entry point (imports app.js)
│   │   ├── lib/
│   │   │   └── vocab-loader.js  # SQLite singleton + cache
│   │   ├── routes/
│   │   │   ├── admin.routes.js  # /api/admin/* (dev only)
│   │   │   └── public.js        # /api/vocab/:lang, /api/health, etc.
│   │   └── middleware/
│   ├── public/
│   │   ├── admin.html
│   │   ├── admin.js             # ES module entry point for admin panel
│   │   └── src/
│   │       ├── admin-api.js     # Shared fetch + status helpers
│   │       ├── admin-editor.js  # Word editor tab
│   │       ├── admin-stats.js   # Statistics tab
│   │       └── admin-db.js      # DB Admin tab (cache, export)
│   ├── tests/
│   │   ├── public.test.js
│   │   ├── admin.test.js
│   │   └── helpers/
│   │       ├── app.js           # buildTestApp() / teardownTestApp()
│   │       ├── db.js            # createTestDb() — in-memory SQLite seed
│   │       └── sqlite-shim.js   # better-sqlite3 API shim using sql.js WASM
│   └── vitest.config.js         # aliases better-sqlite3 → sqlite-shim in tests
└── data/
    └── vocabulary.db            # Production SQLite DB (never touched by tests)
```

## Running Tests

```bash
cd backend
npm test          # run once
npm run test:watch  # watch mode
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
- **Admin panel is ES modules**: `admin.js` is `type="module"`, imports from
  `public/src/admin-*.js`. No bundler required — Express serves `public/`
  as static files.
- **Admin routes guard**: `isDevelopment` middleware in `admin.routes.js`
  returns 403 unless `NODE_ENV=development`. Tests set this before building
  the app.
- **Synonyms not implemented**: `word_relations` table exists in the schema
  but is empty — synonyms were never migrated from the old JSON format.
  The admin edit form does not expose this field.

---

## TODO: Rename `display` field

The `display` field in `spanish_curated.jsonl` holds the **primary English
translation** shown to the learner (e.g., `"display": "shark"`). The name is
misleading — it sounds like a UI/formatting property.

Candidate replacement names: `english`, `translation`, `gloss`.

Renaming requires:
1. Update all entries in `spanish_curated.jsonl` (currently ~2400+)
2. Search app code for any reference to `entry.display` / `["display"]` and
   update field access accordingly.

Do this as a deliberate refactor, not mid-session.
