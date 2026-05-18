/**
 * Public API Routes
 *
 * GET /api/vocab/:language - Serve vocabulary
 */

import { Router } from 'express';
import { loadVocabFile } from '../lib/vocab-loader.js';

const router = Router();

// GET /api/vocab/:language
// Returns vocabulary for a specific language
router.get('/vocab/:language', async (req, res, next) => {
  try {
    const { language } = req.params;

    // Validate language parameter
    if (!language || typeof language !== 'string') {
      return res.status(400).json({
        error: 'Invalid language parameter',
        message: 'Language parameter must be a non-empty string'
      });
    }

    const normalizedLanguage = language.toLowerCase();

    // Load vocabulary file
    const vocab = await loadVocabFile(normalizedLanguage);

    // Return vocabulary with metadata
    res.json({
      success: true,
      language: normalizedLanguage,
      count: vocab.words ? vocab.words.length : 0,
      metadata: {
        timestamp: new Date().toISOString(),
        cacheAge: vocab.cacheAge || 0
      },
      data: vocab.words || []
    });

  } catch (error) {
    next(error);
  }
});

// GET /api/health - Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// GET /api/languages - List available languages
router.get('/languages', (req, res) => {
  res.json({
    success: true,
    languages: [
      {
        code: 'es',
        name: 'Spanish',
        nativeName: 'Español',
        flag: '🇪🇸'
      },
      {
        code: 'pt',
        name: 'Portuguese',
        nativeName: 'Português',
        flag: '🇵🇹'
      },
      {
        code: 'it',
        name: 'Italian',
        nativeName: 'Italiano',
        flag: '🇮🇹'
      },
      {
        code: 'fr',
        name: 'French',
        nativeName: 'Français',
        flag: '🇫🇷'
      }
    ]
  });
});

export default router;
