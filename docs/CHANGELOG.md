# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **`scripts/data/backfill_curated.py`** (`npm run backfill:dry` / `npm run
  backfill`): fills `pos` and `glosses` on curated entries that were being
  silently dropped at import. Sources, in order: the `data/preseed/` files,
  spaCy when installed, then the entry's own `translation`. A part of speech is
  never invented — entries that can't get a real one are left alone and
  reported. Backfilled entries are tagged `backfilled` and flagged
  `needs_review`. Idempotent; backs the file up before writing.
- **`scripts/data/dedupe_curated.py`** (`npm run dedupe:dry` / `npm run
  dedupe`): removes duplicate words from the curated files, keeping the richest
  entry (hand-curated beats corpus-sourced, then more filled fields, then the
  better rank), and drops corpus fragments via `--drop-words`.
- **Bulk import into lists** (My Lists): paste a comma- or newline-separated
  list, or load a `.csv`/`.txt` file. Words are matched against the language's
  vocabulary and the result reports how many were added, already listed, or not
  found — nothing is silently dropped. Inexact matches (inflections like
  *hablo* → *hablar*) open a picker so you choose the entry you meant.
- **Off** mode on the list filter, alongside Hide and Focus — keeps your list
  selections but stops them filtering the quiz.
- Conjugation mode has **two progress bars**: Forms (each individual
  conjugation) and Verbs (a verb counts as correct only once all its forms are).
  Both use the shared segmented bar and score pills, each labelled.
- **Ctrl + ↓ / ↑ moves between verbs** in conjugation mode, while Tab continues
  to move between forms within a verb. Both are listed in the shortcuts panel.
- **Live score line** under the table progress bar — `N correct · N revealed ·
  N left`, counted across the whole quiz.
- The progress bar now splits green/red: correct answers fill green, revealed
  and given-up words fill red immediately after them, so Give Up leaves the bar
  fully coloured in proportion (50 of 200 correct = a quarter green, rest red).
- **Jump to top / bottom** controls at both ends of table mode.
- Part of Speech, Lists and Domains are collapsible — the header arrow points
  down when open and at the label when closed, and the state is remembered.
- **Table mode pagination**: long quizzes split into pages with arrow controls
  above and below the table, showing the page number and word range. A
  **Words per page** setting (25 / 50 / 100 / 200 / All, default 100) controls
  the split and re-paginates a quiz already on screen. Answers are kept when
  paging back and forth, the progress bar and `↓ Gap` span the whole quiz
  rather than the visible page, and Give Up reveals and scores every page.
- **Leveled logging**: `src/server/lib/logger.ts` (debug/info/warn/error/silent,
  stderr for warn+error) and `src/client/utils/logger.ts` (debug/info silenced in
  production builds). Every `console.*` call in `src/` now routes through them.
- `LOG_LEVEL` env var controls server verbosity; when unset it defaults per
  `NODE_ENV` — `debug` in development, `info` in production, `warn` in test.
- ESLint `no-console` is now an error across `src/**/*.ts`, with the two logger
  modules exempt, so direct console calls can't creep back in.
- Unit tests for the server logger's level resolution and sink routing —
  suite now at 206 tests.

### Changed
- Conjugation's Display, Tense and Forms controls are boxed like the quiz
  filters, share the same label styling, and each collapse independently —
  Tense is now its own section rather than an unlabelled select.
- The custom word count box is wider (76px → 128px), its native spin buttons
  are enlarged and always visible (they were suppressed entirely), and the whole
  Words row shares one control height.
- Filter sections start collapsed on a first visit, keeping the controls bar
  compact; once you open one, that choice is remembered.
- Conjugation's Display toggle spans the panel like Tense, and every filter
  block shares the same 0.5rem gap.
- Filter sections toggle from anywhere in their grey box, not just the header —
  clicks on the controls inside still do their own thing.
- Tense sits on its own full-width row beneath Display in conjugation mode.
- Removed the superseded `.conj-prog-*` bar styles.
- **Conjugation mode uses the same progress and reveal as table mode**: one
  segmented bar (green correct → yellow revealed → red missed) with the shared
  Correct/Revealed/Missed/Left pills, plus a per-form `?` reveal button that
  honours the hint-mode setting. Peeking is scored separately from giving up.
- Revealed answers are yellow — inputs and bar segment alike — sitting between
  correct green and missed red.
- Score pills are larger and title-cased; the page selection, its word range,
  and the Jump to Top/Bottom buttons are larger too.
- The page selection and jump button share one row, with the pager centred and
  the jump button right-aligned at matching spacing.
- Conjugation form buttons are much larger again (3.4rem tall, 1.2rem type).
- Part of Speech, Lists and Domains share one lighter background tint.
- The live score block is now the single place quiz counts appear:
  **correct / revealed / missed / left** as coloured pills under the bar,
  updating as you answer. The duplicate correct/missed pills have been removed
  from the end-of-quiz strip, which now carries just Practice, Export and the
  final percentage. "Revealed" (peeked with `?`) and "missed" (given up) are
  counted separately.
- Words on a list are marked with an accent edge and a corner star instead of
  being dimmed — dimming read as "disabled" and hurt legibility.
- Domains is boxed like Part of Speech and Lists, and all three section headers
  share one type style.
- The word-count mode toggle is clearer: **By rank** (words 1–N as ranked) and
  **Skip known** (N words not on any list, digging deeper as needed) replace
  "Top N" and "N New".
- The Hide/Focus list filter is available in Conjugation mode.
- Conjugation form buttons are substantially larger and easier to hit.
- Conjugation's Display and Forms sections collapse like the quiz filters.
- Progress bars are thicker (8px → 20px, with the responsive sizes raised to
  match) so they read at a glance.
- Table mode's blocks share one vertical rhythm, so the gap above the button
  row no longer shifts depending on whether the summary strip is showing.
- The table's corpus frequency number is larger and full-contrast.
- `↓ Gap` renamed to `↓ Next gap` — it jumps to the first unanswered word
  (Ctrl+/), and with paging on it now jumps to the right page too.
- The test run sets `LOG_LEVEL=silent`, so tests that exercise error paths on
  purpose no longer dump stack traces to stderr.
- Dev dependencies bumped: vite 5 → 8, concurrently 9 → 10.

### Fixed
- French, Italian and Portuguese only ever reached the database with 200 words
  each. Their curated files held thousands more, but with `pos: null` and
  `glosses: []`, which `sync_db.py` skips — silently. Backfilling from the
  preseed files and spaCy brings them to French 5,909, Italian 1,197 and
  Portuguese 1,216 importable entries (Italian and Portuguese still need their
  spaCy models installed to finish; see below).
- The Spanish curated file carried 70 duplicate words and one corpus fragment
  (`quier`) left by an earlier `corpus_to_curated.py` run — they would have
  imported as separate rows and appeared twice in a quiz.
- `npm run sync` began with `cp data/vocabulary.db data/vocabulary.db.bak`,
  which fails on a fresh clone with no DB and stops the sync before it starts.
  Dropped — `sync_db.py` already takes its own backup.
- Bulk import silently picked one spelling when a word had accent twins
  (*como* / *cómo* normalise to the same key, so one overwrote the other in the
  lookup). Both are now offered in the picker, with an exactly-typed spelling
  pre-selected.
- My Lists row actions (mastered, move/copy, remove) were `opacity: 0` until you
  hovered the row, so they looked absent — they're always visible now, as
  bordered buttons, and the mastered circle is larger.
- The Words dropdown clipped "Custom…"; Language, Words, Order and Direction now
  share one height and type scale.
- Removing a word from a list in My Lists left the row on screen — the handler
  updated the counts and sidebar but never re-rendered the word list.
- The **Off** list-filter mode was white-on-light and unreadable when active.
- The **Custom** word count was lost on refresh — the select remembered
  "Custom…" but the number box stayed hidden and empty, so the quiz silently
  fell back to 100 words. The value is now saved and restored.
- Table mode's reveal (`?`) and add-to-list (`★`) buttons no longer jump on
  hover — they were picking up the global button lift — and both are now the
  same size and aligned on the input row.
- The reveal button, add-to-list star, and frequency number now scale with the
  Appearance → font size setting instead of staying a fixed size.
- Tab in table mode moves to the next word's input instead of stopping on the
  reveal button.
- Several elements hidden via the `hidden` attribute were still visible because
  an author `display` rule outranks the browser's `[hidden]` rule — the
  add-to-list star on unanswered words, and the conjugation pronoun row on
  single-form tenses.
- Picture mode showed `function Object() { [native code] }` for the Spanish word
  *constructor* — visual lookups (and quiz seen-stats) now use prototype-free
  objects/own-property checks so words colliding with `Object.prototype` members
  resolve correctly.

## [0.2.0] - 2026-06-10

### Changed
- **Repo flattened**: the app now lives at the repo root — the `backend/` subdirectory
  and wrapper package.json are gone. Render root directory setting updated to match.
- Package renamed `vocab-app-backend` → `vocab-app`.
- Pre-commit hook lightened to validate + lint-staged (full typecheck/tests moved to CI).
- Stale documentation describing the pre-SQLite architecture removed; `docs/README.md`
  added as an index. Deprecated `scripts/data/verb_rules.py` deleted.

### Added
- **Typo tolerance setting** (Settings → All Quizzes): Off / Low / Normal / High
  controls how many misspelled letters quiz answers forgive (was hardcoded at ~25%).
- GitHub Actions CI: validate, lint, typecheck, test, build on every push/PR.
- Dependabot for npm, GitHub Actions, and pip updates.
- Client unit tests (answer matching, quiz state machine, gender/plural inference,
  diacritics/levenshtein utils) — suite now at 183 tests.
- `scripts/data/requirements.txt` pinning the Python pipeline dependencies.
- `DATA_DIR` env var to relocate the data directory.
- ESLint now covers `src/client` (was server-only).

### Security
- CORS origins matched exactly via `new URL()` (substring localhost bypass fixed);
  credentials only sent with a specific allowed origin.
- `trust proxy` enabled in production so rate limiting sees real client IPs.
- Admin bearer-token comparison made constant-time (`timingSafeEqual`).
- `helmet` security headers added (CSP pending an inline-script audit).

## [0.1.1] - 2026-05-15

### Added
- Collapsible filter section with toggle button
- Mobile & responsive design with 4 breakpoints (360px, 600px, 768px, 1024px)
- Touch-friendly interface with 44px minimum touch targets
- Filter state persistence using localStorage
- Dark mode support across all screen sizes
- Comprehensive testing guide for mobile responsiveness

### Changed
- Reorganized frontend code by feature instead of flat structure
- Moved documentation to docs/ subfolder
- Improved filter spacing for desktop view
- Enhanced CSS architecture with responsive breakpoints

### Improved
- Code organization and maintainability
- Mobile user experience on small phones
- Visual feedback with smooth animations
- Documentation hierarchy and accessibility

## [0.1.0] - 2026-05-13

### Initial Release
- Multi-language vocabulary practice app (Spanish, Portuguese, Italian, French)
- Three practice modes: Single word quiz, Table mode, Recall mode
- Dynamic filtering system (CEFR level, difficulty, domain, register, POS)
- Text-to-speech functionality
- Comprehensive word tooltips with conjugations
- Dark/light theme toggle
- Rules-based vocabulary data generation
- Express.js backend with vocabulary API
- Monorepo structure with npm workspaces

## [0.0.1] - Pre-Release

Initial project scaffolding and setup.

---

## Migration Log

### May 13, 2026 - Major Reorganization

**Archived:**
- `_old-files-backup/` → `archive/old-files-backup/`
- `src/backup/` → `archive/src-backup/`

**Moved to docs/**
- QUICK_START.md → docs/getting-started/
- GETTING_STARTED.md → docs/getting-started/
- ARCHITECTURE.md → docs/architecture/
- DATA_ARCHITECTURE.md → docs/architecture/
- DATA_GENERATION_GUIDE.md → docs/guides/
- RESPONSIVE_*.md → docs/guides/
- PHASE_*.md → docs/phases/
- CLEANUP_NOTES.md → docs/phases/

**Reorganized Frontend Structure**
- Grouped code by feature (quiz, table, recall, filters, theme, tooltip, tts)
- Updated all import paths
- Maintained full backward compatibility with build system
- No functionality changes, pure organization improvement

**Root Files**
- Kept: README.md, CHANGELOG.md, CONTRIBUTING.md
- Removed: 15 documentation files (moved to docs/)
- New: CHANGELOG.md, CONTRIBUTING.md
