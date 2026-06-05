/**
 * routes/admin/export.js
 *
 * Data export:
 *   POST /export  — download full vocabulary as CSV
 */

import { Router }                                 from 'express';
import { getDb }                                  from '../../lib/vocab-loader.js';
import { SUPPORTED_LANGUAGES, validateLanguage }  from './_utils.js';

const router = Router();

// POST /export
router.post('/export', (req, res) => {
  try {
    const db   = getDb();
    const lang = validateLanguage(req.body?.lang);
    if (!lang)
      return res.status(400).json({ error: 'Invalid language. Must be one of: ' + SUPPORTED_LANGUAGES.join(', ') });

    const rows = db.prepare(`
      SELECT w.*,
        (SELECT GROUP_CONCAT(gloss,'|||') FROM (SELECT gloss FROM word_glosses WHERE word_id=w.id ORDER BY position)) AS glosses_raw,
        (SELECT GROUP_CONCAT(example,'|||') FROM (SELECT example FROM word_examples WHERE word_id=w.id ORDER BY rowid)) AS examples_raw,
        (SELECT GROUP_CONCAT(tag,'|') FROM word_tags WHERE word_id=w.id) AS tags_raw
      FROM words w WHERE w.language=? ORDER BY COALESCE(w.rank,9999), w.word
    `).all(lang);

    const esc = v => {
      if (v == null) return '';
      const s = String(v);
      return (s.includes(',') || s.includes('"') || s.includes('\n'))
        ? '"' + s.replace(/"/g, '""') + '"'
        : s;
    };

    const headers = [
      'rank','word','translation','glosses','pos','difficulty','tags',
      'notes','examples','ipa','frequency_band','gender','plural',
      'infinitive','reflexive','register',
    ];
    const lines = [headers.join(',')];

    for (const row of rows) {
      lines.push([
        esc(row.rank),        esc(row.word),     esc(row.translation),
        esc((row.glosses_raw  || '').replace(/\|\|\|/g, '|')),
        esc(row.pos),         esc(row.difficulty),
        esc(row.tags_raw || ''),
        esc(row.notes),
        esc((row.examples_raw || '').replace(/\|\|\|/g, '|')),
        esc(row.ipa),         esc(row.band),     esc(row.gender),
        esc(row.plural),      esc(row.infinitive),
        esc(row.reflexive ? 'true' : ''),
        esc(row.register),
      ].join(','));
    }

    const date = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${lang}_${date}.csv"`);
    res.send(lines.join('\n'));
  } catch (err) {
    console.error('POST /admin/export:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
