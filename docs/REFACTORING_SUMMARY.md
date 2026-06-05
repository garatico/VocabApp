# Picture Quiz Refactoring Summary

## What Changed

I've refactored the picture guessing feature to use **filesystem-based SVG storage** instead of storing raw SVG code in the database. This is much cleaner and more maintainable!

### Before (Database Approach)
- SVG code stored in `svg_code` database column
- Admin panel textarea for pasting SVG code
- Large database bloat with inline SVG strings
- Complex validation and preview logic

### After (Filesystem Approach) ✨
- SVG files live in `data/svgs/[language]/` folders
- Filename matches word key: `data/svgs/spanish/manzana.svg`
- Auto-detected on request (no database column needed)
- Simple, clean, versioning-friendly

---

## Key Files Changed/Created

### New Files
- `backend/src/lib/svg-loader.js` — SVG detection utilities
- `backend/public/styles/app/picture.css` — Picture quiz styling
- `backend/public/src/picture-mode.js` — Picture quiz logic (loads SVGs via URL)

### Updated Files
- `backend/src/lib/vocab-loader.js` — Returns `svg_url` instead of `svg_code`
- `backend/src/routes/admin.routes.js` — Auto-detects SVGs, no svg_code handling
- `backend/src/app.js` — Added `/svgs/` static route for serving SVG files
- `backend/src/index.js` — Calls `ensureSvgDirs()` on startup
- `backend/public/index.html` — Kept picture tab + area (no changes needed)
- `backend/public/src/admin-editor.js` — Removed SVG code editor
- `backend/public/admin.html` — Removed SVG picture field
- `backend/public/src/ui-state.js` — Kept picture mode switching (unchanged)
- `backend/public/src/app.js` — Imports picture-mode (already done)
- `backend/public/src/start-handler.js` — Handles picture mode (already done)

### Removed
- `backend/src/migrations/add-svg-code.js` — No longer needed
- SVG code textarea from admin panel
- SVG preview code from admin editor

---

## API Response Changes

### Before
```json
{
  "svg_code": "<svg viewBox=\"0 0 100 100\">...</svg>"
}
```

### After ✨
```json
{
  "svg_url": "/svgs/spanish/manzana.svg"
}
```

Much simpler! The client just loads the image from a URL.

---

## Folder Structure

```
data/svgs/
├── spanish/
│   ├── manzana.svg
│   ├── gato.svg
│   └── ...
├── portuguese/
│   ├── maçã.svg
│   └── ...
├── italian/
│   └── ...
└── french/
    └── ...
```

These folders are **auto-created** on app startup via `ensureSvgDirs()`.

---

## How It Works Now

### 1. File Placement
```bash
# User creates SVG file
$ cat > data/svgs/spanish/manzana.svg << 'EOF'
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <text x="50" y="65" font-size="70">🍎</text>
</svg>
EOF
```

### 2. Auto-Detection
When loading vocabulary:
```javascript
// In vocab-loader.js
export function loadVocabFile(language) {
  // For each word:
  return {
    word: 'manzana',
    svg_url: getSvgUrl('spanish', 'manzana')  // → '/svgs/spanish/manzana.svg'
  };
}
```

### 3. API Response
```
GET /api/vocab/spanish
→ { word: 'manzana', svg_url: '/svgs/spanish/manzana.svg', ... }
```

### 4. Frontend Loading
```javascript
// In picture-mode.js
const img = document.createElement('img');
img.src = word.svg_url;  // Load from server
```

### 5. Express Serving
```javascript
// In app.js
app.use('/svgs', express.static(path.join(appRoot, 'data', 'svgs')));
```

---

## Migration Notes

✅ **No database migration needed!**

The old `svg_code` column (if it exists) is simply ignored. The system auto-detects SVGs from the filesystem instead.

If you want to clean up:
```sql
ALTER TABLE words DROP COLUMN svg_code;
```

But this is optional—leaving it won't cause problems.

---

## Benefits

✨ **Cleaner Architecture**
- Separation of concerns: database ≠ media storage
- Easier to manage, version, and backup SVGs

✨ **Better Performance**
- Smaller database size
- SVGs cached by browser/CDN
- No serialization/deserialization overhead

✨ **Easier to Extend**
- Add picture upload UI later
- Convert images to SVG automatically
- Integrate with design tools

✨ **Simpler Admin**
- No need for complex form UI
- Just drop files into folders
- Works with batch imports

---

## Development Workflow

### Adding Pictures Manually
```bash
# 1. Create SVG file
echo '<svg>...</svg>' > data/svgs/spanish/word.svg

# 2. Start app (if not already running)
npm start

# 3. Test in quiz
# → Picture Quiz tab will show the word
```

### Batch Import
```bash
# Copy multiple SVGs
cp ~/my-svgs/*.svg data/svgs/spanish/
```

### Automation
```bash
# Script to convert PNG → SVG (future enhancement)
for png in *.png; do
  potrace "$png" -s -o "${png%.png}.svg"
done
```

---

## Testing

Quick sanity checks:

```bash
# 1. Check folders exist
ls -la data/svgs/spanish/

# 2. Verify SVG file
cat data/svgs/spanish/manzana.svg

# 3. Check API response
curl http://localhost:3000/api/vocab/spanish | grep svg_url

# 4. Test in browser
# → Open quiz → Picture Quiz tab → should show pictures
```

---

## Q&A

**Q: Do I need to do anything to migrate?**
A: No! Just start using the new system. Drop SVG files into `data/svgs/[lang]/`.

**Q: What about old `svg_code` data in the database?**
A: It's ignored. The system looks for files on disk, not database columns.

**Q: Can I have both SVGs and multiple choice?**
A: Yes! The quiz uses SVG files for display, but always shows 4 multiple-choice options.

**Q: How do I handle special characters in filenames?**
A: Use the word key exactly as stored in the database (usually lowercase, accents OK on most filesystems).

**Q: Can I host SVGs on a CDN instead?**
A: Future enhancement! Currently they're served locally. Easy to add proxy URLs later.

---

## Next Steps

1. **Test the system**: Add a few SVG files and run the quiz
2. **Create SVG library**: Build up a collection for your words
3. **Automate**: Write scripts to generate/import SVGs in bulk
4. **Extend**: Add picture upload UI, auto-generation, etc.

Enjoy! 🎨
