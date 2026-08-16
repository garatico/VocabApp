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
├── .github/workflows/ci.yml        # CI: validate, lint, typecheck, test, build
├── scripts/
│   ├── validate.js                  # null-byte/syntax check — runs as pre-commit hook (npm run validate)
│   ├── test-api.js                  # manual smoke-test for the running API
│   ├── migrations/                  # One-off schema migration scripts (historical; already applied)
│   └── data/                        # Python data pipeline — ONE entry point
│       ├── pipeline.py              # the only script you run (see below)
│       ├── lib/                     # modules — no CLI, no side effects
│       │   ├── __init__.py
│       │   ├── config.py            # languages, models, paths, rank scales
│       │   ├── corpus.py            # corpus reading, spaCy tagging, conjugation
│       │   ├── curated.py           # the only reader/writer of curated JSONL,
│       │   │                        #   plus mine/dedupe/backfill/enrich logic
│       │   ├── db.py                # schema, safe open/backup, DB writes
│       │   └── visuals.py           # image/emoji fetch, coverage report
│       ├── requirements.txt         # spacy, mlconjug3, wiktionaryparser, deep_translator…
│       └── delete_all.sql           # nuclear reset — deletes all rows from every table
├── data/
│   ├── vocabulary.db                # Production SQLite DB (never touched by tests)
│   ├── curated/                     # Source-of-truth JSONL files per language
│   ├── images/                      # Wikipedia photos (animals/, food/, nature/)
│   └── emoji/                       # OpenMoji SVGs (animals/)
└── mobile/                          # Parked — not in active development; excluded from git
```

## The Data Pipeline (`scripts/data/pipeline.py`)

**There is one script.** `pipeline.py` is the only executable in the pipeline;
everything else is a module under `lib/` that it drives.

```bash
python scripts/data/pipeline.py all --langs spa            # preview
python scripts/data/pipeline.py all --langs spa --write    # apply
python scripts/data/pipeline.py                            # list the steps
```

| step       | what it does                                             | in `all`? |
|------------|----------------------------------------------------------|-----------|
| `mine`     | OpenSubtitles corpus → new curated entries (+ glosses)    | no — network, rate-limited, batched |
| `seed`     | `data/seed/<language>.txt` → new curated entries          | yes — local, offline, idempotent |
| `dedupe`   | drop duplicate and junk entries                           | yes |
| `backfill` | fill missing pos/glosses so `sync` stops skipping rows    | yes |
| `enrich`   | gender, domains, canonical domain names (Spanish)         | yes |
| `sync`     | curated JSONL → `vocabulary.db`                           | yes |
| `images`   | Wikipedia/iNaturalist photos → `data/images/`              | no — network |
| `emoji`    | OpenMoji SVGs → `data/emoji/`                              | no — network |
| `check`    | Picture Quiz coverage report                              | read-only |

npm aliases exist for each (`npm run data:all`, `data:sync`, `data:check`…);
they pass `--write` where it applies, and `npm run data:all:dry` previews.

### ⚠️ Dry run is the default

**Nothing is written unless you pass `--write`** — every step, every time. It
used to vary per script, which meant `infer_domains.py` rewrote the database on
a bare run while `dedupe_curated.py` was a no-op. `--dry-run` is still accepted
so old commands don't error, but it does nothing (it *is* the default).

Two flags, identical on every step:

| flag | meaning |
|------|---------|
| *(omitted)* | preview — reports what it would do, changes nothing |
| `--write` / `-w` | apply, after taking a backup |
| `--langs` / `-l` | `spa fra ita por deu nld`; several at once is fine; **omitted = all six** |

Every run opens with a header stating the mode, the languages and what it is
about to touch, and closes with whether anything was written:

```
======================================================================
  STEP      : sync
  MODE      : DRY RUN — nothing will be saved
              this is the default; add --write to apply
  LANGUAGES : spanish (spa)
  WOULD EDIT: data/vocabulary.db
======================================================================
```

Before anything is replaced it is backed up: curated JSONL to `.jsonl.bak`, the
database to `vocabulary.db.bak`.

### Windows notes

`stdout` is forced to UTF-8 at the top of `pipeline.py`. The reports use box
characters and arrows, which a cp1252 console cannot encode — without that
reconfigure the very first banner raises `UnicodeEncodeError` and the run dies
before doing anything. The npm aliases call `python`, not `python3`, which
doesn't exist on Windows.

### How the modules fit together

Dependencies run one way, and `config` is the leaf:

```
config  ←  corpus  ←  curated  ←  pipeline
config  ←  db      ←────────────╯
config  ←  visuals ←───────────╯
```

- **`config.py`** — languages, model/corpus/translator codes, every path, and
  the frequency rank scales. Adding a language or moving a directory is a
  one-file change. `PROJECT_ROOT` is `Path(__file__).resolve().parents[3]`.
- **`curated.py`** — the *only* reader and the *only* writer of the curated
  JSONL. `read(lang)` / `write(lang, entries)`; `write` goes through a temp
  file and an atomic rename, so an interrupted run can't truncate the source
  of truth.
- **`db.py`** — the only module that touches `vocabulary.db`. It takes entries
  and returns counts; it never reads a file. `open_db(create=False)` fails
  loudly on a missing DB rather than silently creating an empty one and
  reporting "0 rows updated".

**Pipeline steps are pure.** `dedupe_lang`, `backfill_lang`, `enrich_*` take an
entry list, mutate or filter it, and return a report — none of them touch the
filesystem. `pipeline.py` alone decides whether to persist. That is what makes
`--write` a single reliable gate instead of a flag each step must remember to
honour, and it is why the steps compose into `all` safely.

### Mining: where the words come from, and what limits the yield

`pipeline.py mine` → `curated.mine_lang` → `curated.extract_candidates` →
`corpus.read_top_n_os` / `corpus.build_corpus_entries`.

**spaCy is a hard requirement.** Without it `extract_candidates` catches the
`ImportError` and returns an empty list, so `mine` silently yields zero words:

```bash
pip install -r scripts/data/requirements.txt
python -m spacy download es_core_news_sm    # fr_ / it_ / pt_ / de_core_news_sm too
```

The knobs, in the order they cut the candidate pool:

| flag | default | effect |
|------|---------|--------|
| `--corpus` | `50k` | `50k` reads `{iso}_50k.txt`; `full` reads `{iso}_full.txt` (1.2M lines for Spanish, 70k usable at `--min-count 100`) |
| `--min-count` | 100 | words rarer than this are ignored |
| `--top` | 0 (all) | caps how many corpus rows get scanned; every row costs one spaCy tag |
| `--batch` | 500 | caps how many entries actually get appended per language per run |

Then: already-curated words are skipped (their corpus frequency is copied onto
the existing entry rather than discarded), only noun/verb/adjective survive, and
a word with no gloss is dropped.

`corpus.load_english_blocklist` exists but **nothing calls it** — `mine` relies
on spaCy's POS tag instead. It now takes the language it is filtering for; it
used to whitelist against the Spanish corpus whatever the target, which would
delete *hand, arm, finger, wind, ball, warm, land, best, wild, rat, gift, band*
from German the moment anyone wired it up.

### Seeding a language by hand (`seed`)

`mine` needs spaCy and a network connection. `seed` needs neither: it reads
`data/seed/<language>.txt`, a hand-written `word|pos|gender|gloss;gloss` list,
and turns it into curated entries. That is how German was bootstrapped, and how
any language can be given a usable core vocabulary before mining is possible.

Only the words and their glosses are hand-written. **Rank, band, difficulty and
`corpus_frequency` are read from the OpenSubtitles corpus by the step itself**,
so the seed file carries no numbers and cannot drift out of step with the
frequency data. Entries come out ordered by real corpus frequency, so "Top 100"
in the app means the hundred commonest of them.

It is idempotent — words already in the curated file are skipped — so it is safe
to re-run, and safe to run after mining. It is in the `all` chain for that
reason, and is a no-op for the four languages with no seed file.

Part of speech and noun capitalisation are checked against **HanTa**
(`pip install HanTa`) when it is installed; disagreements are reported, not
enforced. HanTa rather than spaCy because its German model ships inside the
wheel and needs no separate download. The check tags nouns in their capitalised
form — handed lowercase, the tagger returns whichever verb or adjective the noun
collides with (*frage* for Frage, *liebe* for Liebe, *arm* for Arm) and would
report every one as an error.

Roughly a dozen genuine disagreements survive for German and all are correct as
written: `weiß` is *white* and *I know*; `ganz`, `rund` and `einfach` are
adjective and adverb both.

### German

German is mined the same way as the other four, with three differences:

- **The corpus is lowercase, German nouns are not.** `de_50k.txt` has `mann`,
  not `Mann`, and case is the only thing separating *essen* (to eat) from
  *Essen* (a meal). `analyze_word` tags German twice — once as given and once
  capitalised, since `de_core_news_sm` is trained on cased text and capital
  letters are its strongest noun signal — and `display_lemma` restores the
  capital on any word tagged NOUN. Keys stay lowercase throughout; only the
  stored `word` is cased.
- **No conjugations.** mlconjug3 covers en/es/fr/it/pt/ro and has no German, so
  German verbs import with `conjugations: null`. `LANGS_WITHOUT_CONJUGATION` in
  `config.py` makes `sync` report that once instead of failing per verb. Giving
  German real conjugations means writing a rules engine for it, the way Spanish
  has `verb-rules.ts`.
- **No plural merging.** `deduplicate_lemma_map`'s `-s`/`-es` rule is gated to
  `PLURAL_S_LANGS`. German plurals are formed by suffix, umlaut, both or neither
  (Haus→Häuser, Auto→Autos, Fenster→Fenster), so the rule does not describe the
  language — what it *would* do is merge Eis (ice) into Ei (egg) and Reis (rice)
  into Rei. spaCy already lemmatises German to the singular.

**In the app**, German is offered in Table, Recall, Single Word, Picture Quiz
and My Lists. Conjugation mode is disabled for it — the tab greys out with the
reason on hover — because there is no conjugation data to drill.
`src/client/data/languages.ts` is the single list of languages and their
capabilities; the dropdown, the ISO codes and that tab gate all read from it,
and `GET /api/languages` tells the dropdown which languages the DB actually has
rows for so an un-mined language shows as "German — no data yet" rather than
failing when picked.

Answer matching runs through `foldKey`, which lowercases, so a learner typing
*hund* is marked correct for *Hund*. Capitalisation is taught by what is shown,
not enforced by the checker.

`CONJ_VERB_SUFFIXES['deu']` is deliberately empty. Every German verb ending is
also a noun ending (`-te`: sagte, but also Tüte/Miete/Seite; `-t`: 3rd person,
but also Stadt/Welt/Wort). Fill it from observed junk in a real run — four
Spanish suffix heuristics were written from first principles and all four had to
be reverted after eating real headwords.

**Glosses are cached**, so re-mining is mostly free. `data/gloss_cache/` already
holds 26,010 Spanish lookups with a 90% hit rate, ~16,700 of which are glossed
words not yet in the curated file — those cost no network at all.

### What fills each `words` column

| column | filled by |
|--------|-----------|
| word, translation, pos, glosses | `mine` (corpus + Wiktionary/Translate) or hand-curation |
| rank, difficulty, **band** | derived from frequency rank — `rank_to_band` / `rank_to_difficulty` in `config.py` |
| **corpus_frequency** | `mine`, from the OpenSubtitles occurrence count |
| gender, domains | `enrich` (Spanish rules only) |
| conjugations, past_participle, gerund | `sync` via mlconjug3 — fra/ita/por only; **deu has no source at all** |
| conjugation_class, future_stem, overrides | Spanish verbs; consumed by `verb-rules.ts` at runtime |
| ipa, syllables, notes, register, plural, reflexive | **manual** — admin panel, no automated source |
| emoji | nothing — Picture Quiz resolves visuals through `visual-map.ts` |

**Keep `UPSERT`'s column list in sync with the table.** `band`,
`corpus_frequency`, `plural` and `reflexive` were absent from it for a long
time, so the data sat in the curated JSONL and silently never reached the app.
`band` in particular is now computed from `rank` for every row rather than only
the ~5% that carry one explicitly.

### Gotchas worth keeping

- `rank_to_band()` / `rank_to_difficulty()` live **only** in `config.py`. They
  previously existed in two places with different thresholds (rank 1200 was B1
  in one file and B2 in the other). Don't add a local copy.
- `enrich_domains` runs its output through `canonicalize()` before storing it.
  Without that, it hands out a name (`numbers_quantity`) that the canonicaliser
  then deletes, so the next run re-assigns it — the two steps flip the same
  entries forever and `all` never converges.
- Enrichment rules are Spanish-only; `enrich` skips other languages with a note
  rather than pretending to work.

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
- **Cache invalidation**: every admin 