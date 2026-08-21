# VocabApp

A vocabulary learning app for Spanish, French, Italian, Portuguese, German and
Dutch: picture quizzes, recall practice, conjugation drills, and word tables,
backed by a curated word database with frequency rankings.

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
```

## Where the data comes from

This app does not build its own vocabulary. It is handed `data/vocabulary.db`
by **VocabApp-Data**, a separate project that runs the corpus pipeline — for
now it sits in this repo as `VocabApp-Data/`, with its own README, tests and
CI, and it is meant to move out.

```bash
cd VocabApp-Data && python pipeline/pipeline.py everything --write
```

The interface is the file. `DATA_DIR` points both projects at the same
directory, so the database can live anywhere:

```bash
DATA_DIR=/srv/vocab-data npm start
```

The app checks the database it is given at startup, against what it says it
needs in `src/server/lib/data-requirements.ts`. A missing column it reads is
fatal and names the fix — it would throw on the first request anyway, and
failing at boot beats failing under a user. Data that is merely older than
expected warns and carries on.

## Layout

```
src/server/    Express app, routes, middleware, SQLite loader, conjugation engine
src/client/    SPA + admin panel (Vite multi-page: index.html, admin.html)
tests/         vitest suites (server API + client utils)
data/          vocabulary.db, images, emoji — what the app is given
docs/          architecture notes, schema docs, guides

VocabApp-Data/ separate project: builds vocabulary.db. Moving out.
```

Configuration lives in `.env` (see `.env.example`). The data directory can be
relocated with `DATA_DIR`, and server log verbosity with `LOG_LEVEL`
(`debug` | `info` | `warn` | `error` | `silent`). Admin routes are
development-only, localhost-only, and optionally protected with `ADMIN_SECRET`.

`DATA_DIR` is deliberately the same variable name VocabApp-Data reads, so one
setting points producer and consumer at the same directory.

CI (GitHub Actions) runs on every push and PR: `ci.yml` does validate, lint,
typecheck, tests and build for the app, and `data.yml` does ruff, pytest and an
end-to-end smoke test inside `VocabApp-Data/`. The two are separate files so
the second one moves out with the folder. A husky pre-commit hook runs the
validate check plus eslint on staged files.

See `CLAUDE.md` for contributor/agent notes and `docs/` for deeper
documentation.
