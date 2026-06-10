# VocabApp

A vocabulary learning app for Romance languages (Spanish, French, Italian,
Portuguese): picture quizzes, recall practice, conjugation drills, and word
tables, backed by a curated word database with frequency rankings.

## Stack

TypeScript end to end — Express API + SQLite (better-sqlite3) on the server,
a Vite-bundled vanilla-TS SPA on the client, and a Python data pipeline
(spaCy, corpus extraction) that builds the database from curated JSONL files.

## Quick start

```bash
npm install
npm run dev        # API on :3000, Vite dev server on :5173
```

Open http://localhost:5173 (app) or http://localhost:5173/admin (admin panel,
development only).

## Common commands

```bash
npm test               # vitest (sql.js in-memory shim — never touches the real DB)
npm run lint           # eslint over src/, tests/, scripts/
npm run typecheck      # tsc for client + server
npm run validate       # truncation / null-byte pre-flight check
npm run build          # production bundle → dist/
npm run sync           # rebuild data/vocabulary.db from data/curated/*.jsonl
```

## Layout

```
src/server/    Express app, routes, middleware, SQLite loader, conjugation engine
src/client/    SPA + admin panel (Vite multi-page: index.html, admin.html)
tests/         vitest suites (server API + client utils)
scripts/data/  Python pipeline: corpus → curated JSONL → SQLite
data/          vocabulary.db, curated JSONL (source of truth), images, emoji
docs/          architecture notes, schema docs, guides
```

Configuration lives in `.env` (see `.env.example`). The data directory can be
relocated with `DATA_DIR`. Admin routes are development-only, localhost-only,
and optionally protected with `ADMIN_SECRET`.

CI (GitHub Actions) runs validate, lint, typecheck, tests, and build on every
push and PR. A husky pre-commit hook runs the validate check plus eslint on
staged files.

See `CLAUDE.md` for contributor/agent notes and `docs/` for deeper
documentation.
