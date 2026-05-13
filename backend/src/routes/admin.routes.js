/**
 * admin.routes.js
 *
 * Administrative routes for vocabulary editing, data management, and script execution.
 * Development mode only (localhost:3000 on dev server).
 */

import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Development mode check ────────────────────────────────────────────────────
function isDevelopment(req, res, next) {
  if (process.env.NODE_ENV !== 'development') {
    return res.status(403).json({ error: 'Admin panel only available in development mode' });
  }
  next();
}

router.use(isDevelopment);

// ── Load vocabulary data ──────────────────────────────────────────────────────

async function loadVocabulary(lang = 'spanish') {
  const vocabPath = path.join(__dirname, '../../data', `${lang}.json`);
  try {
    const data = await fs.readFile(vocabPath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error(`Error loading ${lang} vocabulary:`, err.message);
    return [];
  }
}

async function saveVocabulary(lang, words) {
  const vocabPath = path.join(__dirname, '../../data', `${lang}.json`);
  try {
    await fs.writeFile(vocabPath, JSON.stringify(words, null, 2), 'utf8');
    return { success: true, message: `Saved ${words.length} words to ${lang}.json` };
  } catch (err) {
    throw new Error(`Error saving vocabulary: ${err.message}`);
  }
}

// ── GET /api/admin/vocab ──────────────────────────────────────────────────────
// Get vocabulary with search and pagination
router.get('/vocab', async (req, res) => {
  try {
    const lang = req.query.lang || 'spanish';
    const search = req.query.search?.toLowerCase() || '';
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;

    let words = await loadVocabulary(lang);

    // Filter by search
    if (search) {
      words = words.filter(w =>
        w.word.toLowerCase().includes(search) ||
        w.display?.toLowerCase().includes(search) ||
        w.glosses?.some(g => g.toLowerCase().includes(search))
      );
    }

    // Pagination
    const total = words.length;
    const pages = Math.ceil(total / limit);
    const start = (page - 1) * limit;
    const end = start + limit;
    const paginated = words.slice(start, end);

    res.json({
      success: true,
      language: lang,
      total,
      page,
      pages,
      limit,
      words: paginated
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/admin/vocab/:word ────────────────────────────────────────────────
// Get a specific word
router.get('/vocab/:word', async (req, res) => {
  try {
    const lang = req.query.lang || 'spanish';
    const words = await loadVocabulary(lang);
    const word = words.find(w => w.word === req.params.word);

    if (!word) {
      return res.status(404).json({ error: 'Word not found' });
    }

    res.json({ success: true, word });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/admin/vocab/:word ───────────────────────────────────────────────
// Update a word
router.post('/vocab/:word', async (req, res) => {
  try {
    const lang = req.query.lang || 'spanish';
    const words = await loadVocabulary(lang);
    const index = words.findIndex(w => w.word === req.params.word);

    if (index === -1) {
      return res.status(404).json({ error: 'Word not found' });
    }

    // Deep merge the updates
    words[index] = {
      ...words[index],
      ...req.body,
      // Ensure nested objects are properly merged
      linguistic: { ...words[index].linguistic, ...req.body.linguistic },
      relations: { ...words[index].relations, ...req.body.relations },
      frequency: { ...words[index].frequency, ...req.body.frequency }
    };

    await saveVocabulary(lang, words);

    res.json({
      success: true,
      message: 'Word updated',
      word: words[index]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/admin/vocab ─────────────────────────────────────────────────────
// Batch update words
router.post('/vocab', async (req, res) => {
  try {
    const lang = req.query.lang || 'spanish';
    const updates = req.body.updates; // Array of { word, data }

    if (!Array.isArray(updates)) {
      return res.status(400).json({ error: 'updates must be an array' });
    }

    let words = await loadVocabulary(lang);
    let updated = 0;

    for (const { word, data } of updates) {
      const index = words.findIndex(w => w.word === word);
      if (index !== -1) {
        words[index] = {
          ...words[index],
          ...data,
          linguistic: { ...words[index].linguistic, ...data.linguistic },
          relations: { ...words[index].relations, ...data.relations },
          frequency: { ...words[index].frequency, ...data.frequency }
        };
        updated++;
      }
    }

    await saveVocabulary(lang, words);

    res.json({
      success: true,
      message: `Updated ${updated} of ${updates.length} words`,
      updated
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/admin/stats ──────────────────────────────────────────────────────
// Get data statistics
router.get('/stats', async (req, res) => {
  try {
    const stats = {};
    const languages = ['spanish', 'portuguese', 'italian', 'french'];

    for (const lang of languages) {
      const words = await loadVocabulary(lang);
      stats[lang] = {
        total: words.length,
        withExamples: words.filter(w => w.examples?.length > 0).length,
        withSynonyms: words.filter(w => w.relations?.synonyms?.length > 0).length,
        withIPA: words.filter(w => w.linguistic?.ipa).length,
        verbs: words.filter(w => w.pos === 'verb').length,
        nouns: words.filter(w => w.pos === 'noun').length,
        adjectives: words.filter(w => w.pos === 'adjective').length,
        coverage: {
          examples: Math.round((words.filter(w => w.examples?.length > 0).length / words.length) * 100),
          synonyms: Math.round((words.filter(w => w.relations?.synonyms?.length > 0).length / words.length) * 100),
          ipa: Math.round((words.filter(w => w.linguistic?.ipa).length / words.length) * 100)
        }
      };
    }

    res.json({ success: true, stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// NOTE: Data generation endpoints removed (scripts/enrich, scripts/generate, scripts/all, scripts/quick-wins, export)
// Data management is now handled by VocabApp-DataPipeline (separate repository)
// The VocabApp only consumes clean vocabulary data.

export default router;
