# Contributing to VocabApp

Thank you for your interest in contributing to VocabApp! This guide will help you understand how the project is organized and how to contribute effectively.

## Project Structure

See [docs/guides/FILE_STRUCTURE.md](docs/guides/FILE_STRUCTURE.md) for a detailed breakdown of the project organization.

### Quick Overview

```
vocab-app/
├── docs/              # All documentation (guides, architecture, phases)
├── packages/          # Frontend and data processing apps
│   ├── vocab-practice/  # Main practice app (organized by feature)
│   ├── corpus-builder/  # Language corpus analysis
│   └── data-processor/  # Data processing utilities
├── src/               # Express server (src/server) + Vite SPA (src/client)
├── shared/            # Shared code and utilities
├── scripts/           # Data generation and build scripts
├── tests/             # Test files (unit, integration, e2e)
├── archive/           # Deprecated code and old backups
├── README.md          # Project overview
├── CHANGELOG.md       # Release history
└── CONTRIBUTING.md    # This file
```

## Frontend Organization (Feature-Based)

The main app (`packages/vocab-practice/src/`) is organized by feature:

```
src/
├── core/              # Main app entry point and initialization
│   ├── app.js
│   ├── ui.js
│   └── data-loader.js
│
├── modes/             # Practice modes
│   ├── quiz/          # Single word quiz
│   ├── table/         # Table mode with multiple words
│   └── recall/        # Recall/memory mode
│
├── features/          # Optional features
│   ├── filters/       # Word filtering system
│   ├── theme/         # Dark/light mode
│   ├── tooltip/       # Word information tooltips
│   └── tts/           # Text-to-speech
│
├── ui/                # UI state and event handling
├── utils/             # Shared utilities
└── styles/            # All CSS files
```

## Getting Started

### Prerequisites
- Node.js 16+ 
- npm 8+

### Setup

1. **Clone and install**
   ```bash
   cd VocabApp
   npm install
   ```

2. **Run development server**
   ```bash
   npm run dev
   ```
   Opens http://localhost:3000 with hot reload

3. **Build for production**
   ```bash
   npm run build
   ```

## Development Workflow

### Adding a New Feature

1. **Determine feature type:**
   - Practice mode? → Create in `src/modes/your-mode/`
   - Optional feature? → Create in `src/features/your-feature/`
   - Utility? → Add to `src/utils/`

2. **Create feature folder:**
   ```bash
   mkdir packages/vocab-practice/src/features/my-feature
   touch packages/vocab-practice/src/features/my-feature/my-feature.js
   ```

3. **Update imports in app.js:**
   ```javascript
   import { myFunction } from '../features/my-feature/my-feature.js';
   ```

4. **Test thoroughly:**
   ```bash
   npm run dev
   # Test in browser at http://localhost:3000
   ```

### Adding Styles

CSS is organized by feature/mode:
- `styles/controls.css` - Control bar and filters
- `styles/quiz.css` - Quiz mode specific
- `styles/table.css` - Table mode specific
- `styles/recall.css` - Recall mode specific
- `styles/responsiveness.css` - Mobile/tablet breakpoints
- `styles/enhancements.css` - Animations and polish

For responsive styles, use these breakpoints:
- `@media (max-width: 599px)` - Small mobile
- `@media (max-width: 767px)` - Mobile/tablet
- `@media (max-width: 1023px)` - Small desktop
- `@media (min-width: 1024px)` - Large desktop

### Adding Data

1. **Update CSV source** (if needed):
   - Spanish: `data/sources/spanish.csv`
   - Portuguese: `data/sources/portuguese.csv`
   - Italian: `data/sources/italian.csv`
   - French: `data/sources/french.csv`

2. **Generate vocabulary:**
   ```bash
   npm run generate:vocab           # All languages
   npm run generate:vocab:spanish   # Spanish only
   ```

3. **Enrich (Spanish only):**
   ```bash
   npm run enrich:spanish
   ```

## Linting & Formatting

### Run ESLint
```bash
npm run lint
```

### Format Code (when configured)
```bash
npm run format
```

## Testing

Currently, the project focuses on manual testing and browser validation. Future:
- Unit tests in `tests/unit/`
- Integration tests in `tests/integration/`
- E2E tests with Cypress/Playwright

## Documentation

All documentation lives in `docs/`:
- `docs/getting-started/` - New developer guides
- `docs/architecture/` - System design docs
- `docs/guides/` - Feature guides and how-tos
- `docs/phases/` - Development phase checklists

When making changes, update relevant docs!

## Code Style

### JavaScript
- Use ES6 modules (`import`/`export`)
- Prefer `const` over `let`
- Use descriptive variable names
- Add JSDoc comments for exported functions

Example:
```javascript
/**
 * Filter words by criteria
 * @param {Array} words - Words to filter
 * @param {Object} criteria - Filter criteria
 * @returns {Array} Filtered words
 */
export function filterWords(words, criteria) {
  // implementation
}
```

### CSS
- Use CSS custom properties (variables)
- Mobile-first approach (start small, add to large screens)
- Use meaningful class names
- Document complex selectors

## Commit Messages

Use clear, descriptive commit messages:
```
feat: add dark mode toggle button
fix: resolve filter import path issue
docs: update organization structure
refactor: reorganize quiz mode files
chore: clean up console logs
```

## Pull Request Process

1. Create a feature branch: `git checkout -b feat/my-feature`
2. Make your changes
3. Update docs if needed
4. Test thoroughly
5. Commit with descriptive messages
6. Push and create a pull request
7. Link any related issues
8. Wait for review

## Reporting Issues

When reporting bugs, include:
- Browser and OS
- Steps to reproduce
- Expected vs. actual behavior
- Screenshots if visual

## Questions?

Check the documentation first:
- [Getting Started](docs/getting-started/QUICK_START.md)
- [Architecture](docs/architecture/ARCHITECTURE.md)
- [Data Generation](docs/guides/DATA_GENERATION_GUIDE.md)

## License

This project is licensed under the MIT License - see LICENSE file for details.

---

Happy contributing! 🎉
