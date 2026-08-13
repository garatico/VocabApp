# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
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
