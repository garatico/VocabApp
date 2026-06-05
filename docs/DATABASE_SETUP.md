# VocabApp Database Setup

## File Structure

```
VocabApp/
├── data/
│    └── vocabulary.source.db      ← Source of truth (edit here)
├── backend/
│    ├── data/
│    │    └── vocabulary.db        ← Production (app reads this)
│    └── src/
├── copy-database.js               ← Sync script
├── package.json                   ← Root scripts
└── ...
```

## Workflow

### Initial Setup
```bash
# Install dependencies
npm run setup

# This will:
# 1. Install backend npm packages
# 2. Copy source.db → production db
```

### Running the App
```bash
# Development (auto-reload)
npm run backend:dev

# Production
npm run backend:start
```

### Updating Vocabulary Data

1. **Edit the source database**
   - Use SQLite browser (DB Browser, etc.) to edit `data/vocabulary.source.db`
   - Make your changes (add words, modify glosses, etc.)

2. **Sync to production**
   ```bash
   npm run sync-db
   ```

3. **Restart the app**
   - Kill the running process (Ctrl+C)
   - Run `npm run backend:dev` again

## Migration from Old Structure

### Files to Move:
1. Copy the `vocabulary.db` from `VocabApp-DataPipeline/data/` to `VocabApp/data/vocabulary.source.db`
2. Keep a copy in `VocabApp/backend/data/vocabulary.db` for the app

### Files to Delete:
- Entire `VocabApp-DataPipeline/` folder
- `VocabApp-App/backend/scripts/setup-database.js`
- `VocabApp-App/backend/check-*.js` (verification scripts)

## Notes

- **Source DB** (`vocabulary.source.db`): Your master copy. Keep backups.
- **Production DB** (`vocabulary.db`): What the app actually uses. Replaced on `npm run sync-db`.
- Both files are identical after sync.
- The app reads from the production copy, not source.

## Commands Reference

| Command | What it does |
|---------|--------------|
| `npm run setup` | Install deps + sync database |
| `npm run sync-db` | Copy source → production |
| `npm run backend:dev` | Start app in dev mode (auto-reload) |
| `npm run backend:start` | Start app in production mode |
| `npm run backend:install` | Install backend dependencies |
