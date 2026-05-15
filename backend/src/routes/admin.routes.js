/**
 * admin.routes.js
 *
 * Administrative routes for vocabulary editing and data management.
 * All reads and writes go directly to the SQLite database.
 * Development mode only.
 */

import express from 'express';
import { getDb, clearCache } from '../lib/vocab-loader.js';
import { getSvgUrl } from '../lib/svg-loader.js';

const router = express.Router();

const SUPPORTED_LANGUAGES = ['spanish', 'portuguese', 'italian', 'french'];

function isDevelopment(req, res, next) {
  if (process.env.NODE_ENV !== 'development') {
    return res.status(403).json({ error: 'Admin panel only available in development mode' });
  }
  next();
}

router.use(isDevelopment);

function validateLanguage(lang) {
  const l = lang?.toLowerCase();
  return SUPPORTED_LANGUAGES.includes(l) ? l : null;
}

function formatWord(row, lang = 'spanish') {
  let domains = [];
  if (row.domains) {
    try { domains = JSON.parse(row.domains); } catch (_) {}
  }
  return {
    word:       row.word,
    display:    row.display    || '',
    pos:        row.pos        || null,
    difficulty: row.difficulty || null,
    notes:      row.notes      || '',
    emoji:      row.emoji      || null,
    glosses:    row.glosses_raw  ? row.glosses_raw.split('|||').filter(Boolean)  : [],
    examples:   row.examples_raw ? row.examples_raw.split('|||').filter(Boolean) : [],
    svg_url:    getSvgUrl(lang, row.word),
    linguistic: {
      infinitive: row.infinitive || null,
      reflexive:  Boolean(row.reflexive),
      gender:     row.gender     || null,
      plural:     row.plural     || null,
      register:   row.register   || null,
      ipa:        row.ipa        || null,
      syllables:  row.syllables  ? row.syllables.split('-') : null,
    },
    frequency: {
      band:             row.band             || null,
      rank:             row.rank             || null,
      corpus_frequency: row.corpus_frequency || null,
    },
    domains,
  };
}

const WORD_SELECT = `
  SELECT
    w.*,
    (SELECT GROUP_CONCAT(gloss, '|||')
       FROM (SELECT gloss FROM word_glosses WHERE word_id = w.id ORDER BY position)
    ) AS glosses_raw,
    (SELECT GROUP_CONCAT(example, '|||')
       FROM (SELECT example FROM word_examples WHERE word_id = w.id ORDER BY rowid)
    ) AS examples_raw
  FROM words w
`;

// GET /api/admin/vocab
router.get('/vocab', (req, res) => {
  try {
    const db     = getDb();
    const lang   = validateLanguage(req.query.lang) || 'spanish';
    const search = (req.query.search || '').toLowerCase().trim();
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(200, Math.max(1, parseInt(req.query.limit) || 100));
    const offset = (page - 1) * limit;

    const posFilter    = req.query.pos    || null;
    const bandFilter   = req.query.band   || null;
    const domainFilter = req.query.domain || null;

    const conditions = ['w.language = ?'];
    const params     = [lang];

    if (search) {
      const pat = '%' + search + '%';
      conditions.push(
        '(LOWER(w.word) LIKE ? OR LOWER(w.display) LIKE ? OR EXISTS ' +
        '(SELECT 1 FROM word_glosses wg WHERE wg.word_id = w.id AND LOWER(wg.gloss) LIKE ?))'
      );
      params.push(pat, pat, pat);
    }
    if (posFilter) {
      conditions.push('w.pos = ?');
      params.push(posFilter);
    }
    if (bandFilter) {
      conditions.push('w.band = ?');
      params.push(bandFilter);
    }
    if (domainFilter) {
      conditions.push('w.domains LIKE ?');
      params.push('%"' + domainFilter.replace(/"/g, '') + '"%');
    }

    const where = conditions.join(' AND ');

    const { total } = db.prepare('SELECT COUNT(*) AS total FROM words w WHERE ' + where).get(...params);
    const rows = db.prepare(
      WORD_SELECT + ' WHERE ' + where + ' ORDER BY COALESCE(w.rank,9999), w.word LIMIT ? OFFSET ?'
    ).all(...params, limit, offset);

    res.json({
      success: true, language: lang, total,
      page, pages: Math.ceil(total / limit), limit,
      words: rows.map(row => formatWord(row, lang)),
    });
  } catch (err) {
    console.error('GET /admin/vocab:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/vocab/:word
router.get('/vocab/:word', (req, res) => {
  try {
    const db   = getDb();
    const lang = validateLanguage(req.query.lang) || 'spanish';
    const row  = db.prepare(WORD_SELECT + ' WHERE w.word = ? AND w.language = ?').get(req.params.word, lang);
    if (!row) return res.status(404).json({ error: 'Word not found' });
    res.json({ success: true, word: formatWord(row, lang) });
  } catch (err) {
    console.error('GET /admin/vocab/:word:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/vocab/:word
router.post('/vocab/:word', (req, res) => {
  try {
    const db   = getDb();
    const lang = validateLanguage(req.query.lang) || 'spanish';
    const body = req.body;

    if (!body || typeof body !== 'object') return res.status(400).json({ error: 'Body must be a JSON object' });

    const errors = [];
    if (body.glosses  !== undefined && !Array.isArray(body.glosses))  errors.push('glosses must be an array');
    if (body.examples !== undefined && !Array.isArray(body.examples)) errors.push('examples must be an array');
    if (body.domains  !== undefined && !Array.isArray(body.domains))  errors.push('domains must be an array');
    if (errors.length) return res.status(400).json({ error: errors.join('; ') });

    const wordRow = db.prepare('SELECT id FROM words WHERE word = ? AND language = ?').get(req.params.word, lang);
    if (!wordRow) return res.status(404).json({ error: 'Word not found' });

    const wordId = wordRow.id;

    db.transaction(() => {
      let syllablesVal = null;
      if (body.linguistic?.syllables != null) {
        syllablesVal = Array.isArray(body.linguistic.syllables)
          ? body.linguistic.syllables.join('-')
          : String(body.linguistic.syllables);
      }

      let reflexiveVal = null;
      if (body.linguistic?.reflexive != null) {
        reflexiveVal = body.linguistic.reflexive ? 1 : 0;
      }

      db.prepare(`
        UPDATE words SET
          display          = ?,
          pos              = ?,
          notes            = ?,
          emoji            = ?,
          ipa              = ?,
          band             = ?,
          domains          = ?,
          difficulty       = ?,
          gender           = ?,
          plural           = ?,
          infinitive       = ?,
          reflexive        = ?,
          register         = ?,
          syllables        = ?,
          rank             = ?,
          corpus_frequency = ?,
          updated_at       = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        body.display                     ?? null,
        body.pos                         ?? null,
        body.notes                       ?? null,
        body.emoji                       ?? null,
        body.linguistic?.ipa             ?? null,
        body.frequency?.band             ?? null,
        body.domains != null ? JSON.stringify(body.domains) : null,
        body.difficulty                  ?? null,
        body.linguistic?.gender          ?? null,
        body.linguistic?.plural          ?? null,
        body.linguistic?.infinitive      ?? null,
        reflexiveVal,
        body.linguistic?.register        ?? null,
        syllablesVal,
        body.frequency?.rank             ?? null,
        body.frequency?.corpus_frequency ?? null,
        wordId,
      );

      if (Array.isArray(body.glosses)) {
        db.prepare('DELETE FROM word_glosses WHERE word_id = ?').run(wordId);
        const ins = db.prepare('INSERT INTO word_glosses (word_id, gloss, position) VALUES (?, ?, ?)');
        body.glosses.map(g => g.trim()).filter(Boolean).forEach((g, i) => ins.run(wordId, g, i));
      }

      if (Array.isArray(body.examples)) {
        db.prepare('DELETE FROM word_examples WHERE word_id = ?').run(wordId);
        const ins = db.prepare('INSERT INTO word_examples (word_id, example, position) VALUES (?, ?, ?)');
        body.examples.map(e => e.trim()).filter(Boolean).forEach((e, i) => ins.run(wordId, e, i));
      }
    })();

    clearCache(lang);

    const updated = db.prepare(WORD_SELECT + ' WHERE w.id = ?').get(wordId);
    res.json({ success: true, message: 'Word updated', word: formatWord(updated, lang) });
  } catch (err) {
    console.error('POST /admin/vocab/:word:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/vocab (batch update)
router.post('/vocab', (req, res) => {
  try {
    const db   = getDb();
    const lang = validateLanguage(req.query.lang) || 'spanish';
    const { updates } = req.body;

    if (!Array.isArray(updates)) return res.status(400).json({ error: 'updates must be an array' });

    let updated = 0;

    db.transaction(() => {
      for (const { word, data } of updates) {
        if (!word || !data) continue;
        const row = db.prepare('SELECT id FROM words WHERE word = ? AND language = ?').get(word, lang);
        if (!row) continue;
        const wordId = row.id;

        db.prepare(`
          UPDATE words SET
            display=?, pos=?, notes=?, ipa=?, band=?, domains=?,
            updated_at=CURRENT_TIMESTAMP
          WHERE id=?
        `).run(
          data.display ?? null, data.pos ?? null, data.notes ?? null,
          data.linguistic?.ipa ?? null, data.frequency?.band ?? null,
          data.domains != null ? JSON.stringify(data.domains) : null,
          wordId,
        );

        if (Array.isArray(data.glosses)) {
          db.prepare('DELETE FROM word_glosses WHERE word_id = ?').run(wordId);
          const ins = db.prepare('INSERT INTO word_glosses (word_id, gloss, position) VALUES (?, ?, ?)');
          data.glosses.map(g => g.trim()).filter(Boolean).forEach((g, i) => ins.run(wordId, g, i));
        }
        if (Array.isArray(data.examples)) {
          db.prepare('DELETE FROM word_examples WHERE word_id = ?').run(wordId);
          const ins = db.prepare('INSERT INTO word_examples (word_id, example, position) VALUES (?, ?, ?)');
          data.examples.map(e => e.trim()).filter(Boolean).forEach((e, i) => ins.run(wordId, e, i));
        }
        updated++;
      }
    })();

    clearCache(lang);
    res.json({ success: true, message: 'Updated ' + updated + ' of ' + updates.length + ' words', updated });
  } catch (err) {
    console.error('POST /admin/vocab:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/stats
router.get('/stats', (req, res) => {
  try {
    const db    = getDb();
    const stats = {};

    for (const lang of SUPPORTED_LANGUAGES) {
      const total   = db.prepare('SELECT COUNT(*) AS n FROM words WHERE language=?').get(lang).n;
      const withIPA = db.prepare("SELECT COUNT(*) AS n FROM words WHERE language=? AND ipa IS NOT NULL AND ipa!=''").get(lang).n;
      const withEx  = db.prepare('SELECT COUNT(DISTINCT we.word_id) AS n FROM word_examples we JOIN words w ON we.word_id=w.id WHERE w.language=?').get(lang).n;
      const verbs   = db.prepare("SELECT COUNT(*) AS n FROM words WHERE language=? AND pos='verb'").get(lang).n;
      const nouns   = db.prepare("SELECT COUNT(*) AS n FROM words WHERE language=? AND pos='noun'").get(lang).n;
      const adjs    = db.prepare("SELECT COUNT(*) AS n FROM words WHERE language=? AND pos='adjective'").get(lang).n;

      stats[lang] = {
        total, withExamples: withEx, withSynonyms: 0, withIPA,
        verbs, nouns, adjectives: adjs,
        coverage: {
          examples: total ? Math.round((withEx  / total) * 100) : 0,
          synonyms: 0,
          ipa:      total ? Math.round((withIPA / total) * 100) : 0,
        },
      };
    }

    res.json({ success: true, stats });
  } catch (err) {
    console.error('GET /admin/stats:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/meta
router.get('/meta', (req, res) => {
  try {
    const db  = getDb();
    const pos = db.prepare("SELECT DISTINCT pos FROM words WHERE pos IS NOT NULL ORDER BY pos").all().map(r => r.pos);

    const domainRows = db.prepare("SELECT DISTINCT domains FROM words WHERE domains IS NOT NULL AND domains!='[]' AND domains!=''").all();
    const domainSet  = new Set();
    for (const r of domainRows) { try { JSON.parse(r.domains).forEach(d => domainSet.add(d)); } catch (_) {} }

    const bands = db.prepare("SELECT DISTINCT band FROM words WHERE band IS NOT NULL ORDER BY band").all().map(r => r.band);

    res.json({ success: true, pos, domains: [...domainSet].sort(), bands });
  } catch (err) {
    console.error('GET /admin/meta:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/cache/clear
router.post('/cache/clear', (req, res) => {
  try {
    const lang = req.body?.lang || null;
    clearCache(lang);
    const msg = lang ? 'Cache cleared for ' + lang : 'All language caches cleared';
    console.log('[admin] ' + msg);
    res.json({ success: true, message: msg });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/export
router.post('/export', (req, res) => {
  try {
    const db   = getDb();
    const lang = validateLanguage(req.body?.lang);
    if (!lang) return res.status(400).json({ error: 'Invalid language. Must be one of: ' + SUPPORTED_LANGUAGES.join(', ') });

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
      return (s.includes(',') || s.includes('"') || s.includes('\n')) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };

    const headers = ['rank','word','display','glosses','pos','difficulty','tags','notes','examples','ipa','frequency_band','gender','plural','infinitive','reflexive','register'];
    const lines = [headers.join(',')];

    for (const row of rows) {
      lines.push([
        esc(row.rank), esc(row.word), esc(row.display),
        esc((row.glosses_raw  || '').replace(/\|\|\|/g, '|')),
        esc(row.pos), esc(row.difficulty), esc(row.tags_raw || ''), esc(row.notes),
        esc((row.examples_raw || '').replace(/\|\|\|/g, '|')),
        esc(row.ipa), esc(row.band), esc(row.gender), esc(row.plural),
        esc(row.infinitive), esc(row.reflexive ? 'true' : ''), esc(row.register),
      ].join(','));
    }

    const date = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="' + lang + '_' + date + '.csv"');
    res.send(lines.join('\n'));
  } catch (err) {
    console.error('POST /admin/export:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
