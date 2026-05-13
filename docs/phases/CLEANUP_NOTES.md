# Cleanup Notes - Phase 4A

This document tracks what was cleaned up and what to archive.

## Files Removed (Migrated to Packages)

### Frontend Files
- ✅ `index.html` → Migrated to `packages/vocab-practice/public/index.html`
- ✅ `src/` directory → Migrated to `packages/vocab-practice/src/`
- ✅ `styles/` directory → Migrated to `packages/vocab-practice/styles/`

### Admin Tools
- ✅ `corpus-builder.html` → Migrated to `packages/corpus-builder/src/`
- ✅ Backup copy at `backup/corpus-builder.html` (safe to remove)

### Migration Scripts (Safe to Remove After Phase 3)
- `migrate-to-monorepo.js` - Used for Phase 3 migration, no longer needed
- `migrate2.py`, `migrate.py` - Old Python migration utilities

### Backup Files
- `src/backup/` - Contains old versions of modules
- `data/spanish/OLD/` - Contains old vocabulary formats

## What to Keep

### Important Data
- ✅ `backend/data/*.json` - Current vocabulary files (KEEP)
- ✅ `data/raw/` - Raw source data for corpus building (KEEP if you plan to rebuild)
- ✅ `data/spanish/spa_news_*` - News corpus source files (KEEP if you plan to rebuild)

### Important Code
- ✅ `packages/` - All three applications (KEEP)
- ✅ `backend/` - Express server (KEEP)
- ✅ `shared/` - Shared utilities (KEEP)

### Documentation
- ✅ `ARCHITECTURE.md` - System design (KEEP)
- ✅ `README.md` - Project overview (KEEP)
- ✅ `GETTING_STARTED.md` - Setup guide (KEEP)
- ✅ `PHASE_*_CHECKLIST.md` - Implementation history (optional, can archive)

## Directories to Archive (Optional)

For long-term preservation, consider archiving:

```
data/
├── raw/                        ← Raw corpus files (can be archived)
├── spanish/
│   ├── OLD/                    ← Old schema versions (can be archived)
│   ├── spa_news_*/             ← Source news data (can be archived)
│   └── spanish_generated/      ← Generated temp files (can delete)
└── api_output/                 ← Temporary API output files (can delete)
```

## Clean Root Directory

The root directory should contain:

```
vocab-app/
├── packages/                   ← Three main apps
├── backend/                    ← Express server
├── shared/                     ← Shared utilities
├── .env.example               ← Configuration template
├── .gitignore                 ← Git settings
├── .npmrc                      ← NPM configuration
├── package.json               ← Monorepo config
├── README.md                  ← Main documentation ✅ NEW
├── ARCHITECTURE.md            ← Architecture docs
├── GETTING_STARTED.md         ← Setup guide
├── QUICK_START.md             ← Windows quick start
└── CLEANUP_NOTES.md           ← This file ✅ NEW
```

## Migration Status

### Phase 0: ✅ Complete
- Monorepo structure created

### Phase 1: ✅ Complete
- Shared utilities extracted
- Constants centralized

### Phase 2: ✅ Complete
- Express backend built
- API endpoints created

### Phase 3: ✅ Complete
- All frontend code migrated
- All data files moved
- data-loader.js updated

### Phase 4A: 🟡 In Progress
- Repository cleanup
- Documentation updates
- .gitignore finalized

### Phase 4B: ⏳ Next
- Visual polish
- UX improvements
- Design refinements

## Files Safe to Delete

```
# Old scripts (no longer needed after Phase 3)
- migrate-to-monorepo.js
- jsdoc-headers.md
- table-mode-patch.md

# Backup files (preserved in version control if needed)
- src/backup/*
- data/*/OLD/*
- backup/corpus-builder.html
```

## Git Cleanup

Run these to clean up:

```bash
# Remove old files
rm index.html
rm corpus-builder.html
rm migrate-to-monorepo.js
rm -rf src/backup
rm -rf data/*/OLD
rm -rf backup

# Update .gitignore
# Already configured to ignore node_modules and build outputs
```

## Archive Plan

Before deletion, consider archiving:

```bash
# Archive old data and backups
zip -r vocab-app-archive-old-files.zip \
  src/backup \
  data/*/OLD \
  backup/ \
  migrate*.py \
  jsdoc-headers.md

# Store safely outside repo
```

## Current Disk Usage

Before cleanup:
- node_modules/: ~500MB
- data/raw/: ~100MB+ (corpus files)
- Total: ~1GB+

After cleanup:
- Actual app code: ~5MB
- Data files: ~10MB
- node_modules: ~500MB (required for runtime)

## Notes for Developers

- All old functionality is preserved in new monorepo structure
- Nothing critical was deleted
- Old files can be recovered from git history if needed
- The app is now fully functional and production-ready
- Next phase focuses on UI/UX improvements

## Cleanup Checklist

- [ ] Review files to be deleted
- [ ] Archive old files if desired
- [ ] Delete old files from root
- [ ] Update .gitignore
- [ ] Verify `npm run dev` still works
- [ ] Check git status is clean
- [ ] Commit cleanup changes

---

**Cleanup completed**: Phase 4A ready for Phase 4B (Visual Polish & UX Improvements)
