/**
 * routes/admin/export.ts
 *
 * Data export:
 *   POST /export  — download full vocabulary as CSV
 */

import { Router }                                         from 'express';
import { getDb, getSupportedLanguages, bandFromRank }     from '../../lib/vocab-loader.js';
import { validateLanguage }                               from './_utils.js';

const router = Router();

interface ExportRow {
  rank:          number | null;
  word:          string;
  translation:   string | null;
  glosses_raw:   string | null;
  pos:           string | null;
  difficulty:    string | null;
  tags_raw:      string | null;
  notes:         string | null;
  examples_raw:  string | null;
  ipa:           string | null;
  gender:        string | null;
  plural:        string | null;
  infinitive:    string | null;
  reflexive:     number | null;
  register:      string | null;
}

// POST /export
router.post('/export', (req, res) => {
  try {
    const db   = getDb();
    const lang = validateLanguage((req.body as { lang?: string } | undefined)?.lang);
    if (!lang)
      return res.status(400).json({ error: 'Invalid language. Must be one of: ' + getSupportedLanguages().join(', ') });

    const rows = db.prepare(`
      SELECT w.*,
        (SELECT GROUP_CONCAT(gloss,'|||') FROM (SELECT gloss FROM word_glosses WHERE word_id=w.id ORDER BY position)) AS glosses_raw,
        (SELECT GROUP_CONCAT(example,'|||') FROM (SELECT example FROM word_examples WHERE word_id=w.id ORDER BY rowid)) AS examples_raw,
        (SELECT GROUP_CONCAT(tag,'|') FROM word_tags WHERE word_id=w.id) AS tags_raw
      FROM words w WHERE w.language=? ORDER BY COALESCE(w.rank,9999), w.word
    `).all(lang) as ExportRow[];

    const esc = (v: unknown): string => {
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
        esc(row.ipa),         esc(bandFromRank(row.rank)), esc(row.gender),
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
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
