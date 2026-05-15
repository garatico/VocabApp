# Picture Guessing Quiz Mode — Setup & Usage Guide

## What's New

Your VocabApp now has a **Picture Guessing Quiz Mode** that lets users learn vocabulary by matching SVG pictures to words. SVGs live on disk, organized by language!

---

## ✅ What Was Implemented

### 1. **Filesystem-Based SVG Storage**
- SVGs stored in `data/svgs/[language]/` folders
- Auto-detected by word name: `data/svgs/spanish/manzana.svg`
- No database column needed—simple filesystem checks
- Express serves SVGs from `/svgs/` route

### 2. **SVG Loader Utility**
- `backend/src/lib/svg-loader.js` — Auto-detection functions
- `hasSvg(language, word)` — Check if SVG exists
- `getSvgUrl(language, word)` — Get serving URL
- `ensureSvgDirs()` — Create folder structure on startup

### 3. **API Updates**
- All vocabulary endpoints now include `svg_url` field
- Returns URL path for words with SVGs (e.g., `/svgs/spanish/manzana.svg`)
- Auto-detection from filesystem—no database migration needed

### 4. **Frontend Quiz Mode**
- New "Picture Quiz" tab in the quiz interface
- Multiple choice interface with 4 options per question
- Loads SVGs via `<img>` tags from server
- Real-time score tracking
- Summary screen with accuracy percentage
- Responsive design for mobile and desktop

---

## 🚀 Getting Started

### Step 1: Folder Structure

The app automatically creates SVG folders on startup:
```
data/svgs/
├── spanish/
├── portuguese/
├── italian/
└── french/
```

No manual setup needed! But you can pre-create them if you prefer.

### Step 2: Add SVG Files

1. Create SVG files with **word names as filenames**
2. Place them in the language folder

Examples:
```
data/svgs/spanish/manzana.svg
data/svgs/spanish/gato.svg
data/svgs/portuguese/maçã.svg
data/svgs/italian/casa.svg
```

### Step 3: Start Using the Quiz

1. Open the public quiz app
2. Click the **Picture Quiz** tab
3. Select your language and word count
4. Click **Start Quiz**
5. Guess the word by clicking the correct option
6. Track your score and see the final accuracy

---

## 📐 Creating SVG Files

### Simple Emoji-Based SVG (Easiest)
Save as `data/svgs/spanish/manzana.svg`:
```xml
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <text x="50" y="60" text-anchor="middle" font-size="60">🍎</text>
</svg>
```

### Colored Shapes
```xml
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <rect x="20" y="30" width="60" height="50" fill="#FF6B6B" rx="5"/>
</svg>
```

### Using Paths (More Complex)
```xml
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <path d="M50,10 L90,90 L10,90 Z" fill="#FFD700"/>
  <circle cx="50" cy="50" r="15" fill="white"/>
</svg>
```

### Online SVG Generators
- [Adobe Express](https://www.adobe.com/products/express/)
- [Gravit Designer](https://www.gravit.io/)
- [Inkscape](https://inkscape.org/) (free, desktop)
- Simple Google Drawings → Export as SVG

---

## 📊 File Structure

```
VocabApp/
├── data/
│   └── svgs/                        (SVG storage)
│       ├── spanish/                 (language folders)
│       │   ├── manzana.svg
│       │   ├── gato.svg
│       │   └── ...
│       ├── portuguese/
│       ├── italian/
│       └── french/
├── backend/
│   ├── src/
│   │   ├── lib/
│   │   │   ├── svg-loader.js        (new: SVG utilities)
│   │   │   └── vocab-loader.js      (updated: svg_url detection)
│   │   ├── routes/admin.routes.js   (updated: svg_url support)
│   │   ├── app.js                   (updated: /svgs route)
│   │   └── index.js                 (updated: ensureSvgDirs)
│   └── public/
│       ├── index.html               (updated: picture tab + area)
│       ├── src/
│       │   ├── picture-mode.js      (updated: load SVGs via <img>)
│       │   ├── ui-state.js          (updated: mode switching)
│       │   ├── app.js               (updated: picture-mode)
│       │   └── start-handler.js     (updated: picture handler)
│       └── styles/app/
│           └── picture.css          (new: styling)
```

---

## 🎮 How It Works

### Quiz Flow

1. **Selection Phase**: User picks language, word count, filters
2. **Picture Display**: SVG picture shows, 4 options appear
3. **User Input**: Click correct answer
4. **Feedback**: Instant feedback (✓ Correct / ✗ Wrong with answer)
5. **Next**: Auto-advance or click Next button
6. **Summary**: Final score and accuracy %

### Scoring

- **Correct**: Word displayed correctly
- **Incorrect**: Wrong answer or Skip
- **Accuracy**: `(Correct / Total Answered) × 100%`

---

## 🔄 Future Enhancements

Optional additions for later:

1. **Free-text input mode** instead of multiple choice
2. **Picture upload UI** in admin panel (drag & drop)
3. **Auto-convert images to SVG** (Potrace, etc.)
4. **Picture galleries** in the admin panel
5. **Adjectives/Verbs with pictures** (currently nouns only)
6. **Spaced repetition** based on picture difficulty
7. **Leaderboard** for accuracy scores

---

## ❓ Troubleshooting

### SVG Files Not Being Found

Check file naming and location:
- File: `data/svgs/spanish/manzana.svg` (lowercase, matches word key exactly)
- Restart the app so `ensureSvgDirs()` runs
- Check browser console for 404 errors on `/svgs/` requests

### No Words Appearing in Picture Quiz
- SVG files haven't been added yet
- Check that filenames match word keys exactly (case-sensitive!)
- Verify word `pos = 'noun'` in database

### Cache Issues
- Clear the language cache in **DB Admin** tab
- Restart the app
- Hard refresh browser (Ctrl+Shift+R)

### SVG Displays Broken or Doesn't Load
- Validate SVG syntax (use https://www.w3schools.com/graphics/svg_intro.asp)
- Check file permissions on SVG files
- Ensure SVG has proper XML declaration: `<?xml version="1.0"?>`
- Check browser DevTools Network tab for 404s

---

## 📝 Naming Convention

SVG files must match **word keys exactly** (case-sensitive):

| Word Key | SVG Filename | Full Path |
|----------|-------------|-----------|
| `manzana` | `manzana.svg` | `data/svgs/spanish/manzana.svg` |
| `gato` | `gato.svg` | `data/svgs/spanish/gato.svg` |
| `maçã` | `maçã.svg` | `data/svgs/portuguese/maçã.svg` |

---

## API Response Example

```json
{
  "word": "manzana",
  "display": "Manzana",
  "pos": "noun",
  "glosses": ["apple"],
  "svg_url": "/svgs/spanish/manzana.svg",
  "linguistic": {...},
  "frequency": {...},
  "domains": []
}
```

---

## Testing Checklist

- [ ] App starts and creates SVG directories
- [ ] Can place SVG files in `data/svgs/[lang]/[word].svg`
- [ ] Picture Quiz tab appears in quiz interface
- [ ] Can start a picture quiz with words that have SVGs
- [ ] SVGs load and display correctly
- [ ] Multiple choice options show
- [ ] Correct answer is marked correctly
- [ ] Score updates properly
- [ ] Summary shows accurate %
- [ ] Works on mobile (responsive)

---

## ⚡ Quick Start Example

1. Create a simple SVG file:
   ```bash
   mkdir -p data/svgs/spanish
   ```

2. Create `data/svgs/spanish/apple.svg`:
   ```xml
   <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
     <text x="50" y="65" text-anchor="middle" font-size="70">🍎</text>
   </svg>
   ```

3. Start the app—directories auto-create
4. Open quiz → Picture Quiz tab
5. Words with SVGs auto-appear!

---

## Support

For issues or questions:
1. Check browser console for errors (F12)
2. Verify SVG filename matches word key exactly
3. Check file location: `data/svgs/[language]/[word].svg`
4. Restart the app and clear cache
5. Validate SVG syntax at https://www.w3schools.com/graphics/svg_intro.asp

Enjoy visual vocabulary learning! 🎨📚
