# Quick Start Guide

## Windows Users - Follow These Steps

### Step 1: Install Dependencies

Open PowerShell or Command Prompt in your project directory and run:

```bash
npm install
```

This installs all required packages. **This may take a few minutes.**

### Step 2: Start the Development Server

Once installation is complete, run:

```bash
npm run dev
```

You should see output like:

```
> vocab-app-monorepo@0.1.0 dev
> npm run build:vocab && concurrently "npm run dev --workspace=backend"
```

Followed by the backend startup banner:

```
╔════════════════════════════════════════════════════════════╗
║                     VocabApp Backend                       ║
╚════════════════════════════════════════════════════════════╝

  Server:  http://localhost:3000
  ...
```

### Step 3: Test It's Working

Open a new terminal and run:

```bash
curl http://localhost:3000/api/health
```

Or open your browser and visit:

- **http://localhost:3000** - Backend status page
- **http://localhost:3000/api/languages** - List of languages
- **http://localhost:3000/api/health** - Health check

## If You Get Errors

### Error: "Cannot find package 'express'"

**Solution**: Run `npm install` again
```bash
npm install
```

### Error: "The syntax of the command is incorrect"

**Solution**: This is already fixed in the updated code. Make sure you have the latest version.

### Error: "Port 3000 already in use"

**Solution**: Edit `backend/.env` and change the port:
```
API_PORT=3001
```

Then access at http://localhost:3001

### Error: Node/npm not found

**Solution**: Install Node.js from https://nodejs.org (download LTS version)

Then verify installation:
```bash
node --version
npm --version
```

## Directory Structure

```
C:\Users\tcrnk\Documents\MYSTUFF\LANGUAGES\VocabApp\
├── backend/          ← Express server
├── packages/         ← Apps (vocab-practice, corpus-builder, data-processor)
├── shared/           ← Shared utilities
├── package.json      ← Root config
└── GETTING_STARTED.md ← Full documentation
```

## Next Steps

1. ✅ Run `npm install`
2. ✅ Run `npm run dev`
3. ✅ Visit http://localhost:3000
4. 📖 Read GETTING_STARTED.md for more details
5. ⏳ Wait for Phase 3 (full app integration)

## Commands Reference

```bash
npm run dev              # Start everything (recommended)
npm run dev:backend-only # Just run backend
npm start               # Production mode
npm run build           # Build all apps
```

## Keep It Running

Once `npm run dev` is running:
- Don't close the terminal
- Changes to backend code will auto-reload
- Backend is always at http://localhost:3000

Press **Ctrl+C** to stop the server.

## Need Help?

1. Check GETTING_STARTED.md for full documentation
2. Check PHASE_2_CHECKLIST.md for what was implemented
3. Run `npm run --list` to see all available commands

Enjoy! 🚀
