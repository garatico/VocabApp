/**
 * routes/admin/words.js
 *
 * Word CRUD:
 *   GET  /vocab          — paginated word list
 *   GET  /vocab/:word    — single word
 *   POST /vocab/:word    — update single word
 *   POST /vocab          — batch update
 */

import { Router }                            from 'express';
import { getDb, clearCache }                 from '../../lib/vocab-loader.js';
import { getSvgUrl }                         from '../../lib/svg-loader.js';
import { validateLanguage } from './_utils.js';

const router = Router();

// ── Shared helpers ─────────────────────────────────────────────────────────────

/** Replace all glosses for a word inside an open transaction. */
function replaceGlosses(db, wordId, glosses) {
  db.prepare('DELETE FROM word_glosses WHERE word_id = ?').run(wordId);
  const ins = db.prepare('INSERT INTO word_glosses (word_id, gloss, position) VALUES (?, ?, ?)');
  glosses.map(g => g.trim()).filter(Boolean).forEach((g, i) => ins.run(wordId, g, i));
}

/** Replace all examples for a word inside an open transaction. */
function replaceExamples(db, wordId, examples) {
  db.prepare('DELETE FROM word_examples WHERE word_id = ?').run(wordId);
  const ins = db.prepare('INSERT INTO word_examples (word_id, example, position) VALUES (?, ?, ?)');
  examples.map(e => e.trim()).filter(Boolean).forEach((e, i) => ins.run(wordId, e, i));
}

// ── Formatters ─────────────────────────────────────────────────────────────────

function formatWord(row, lang = 'spanish') {
  let domains = [];
  if (row.domains) {
    try { domains = JSON.parse(row.domains); } catch (_) {}
  }
  return {
    word:        row.word,
    translation: row.translation    || '',
    pos:         row.pos            || null,
    difficulty:  row.difficulty     || null,
    notes:       row.notes          || '',
    emoji:       row.emoji          || null,
    glosses:     row.glosses_raw  ? row.glosses_raw.split('|||').filter(Boolean)  : [],
    examples:    row.examples_raw ? row.examples_raw.split('|||').filter(Boolean) : [],
    svg_url:     getSvgUrl(lang, row.word),
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
    tags:              row.tags_raw ? row.tags_raw.split('|||').filter(Boolean) : [],
    conjugation_class: row.conjugation_class || null,
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
    ) AS examples_raw,
    (SELECT GROUP_CONCAT(tag, '|||')
       FROM (SELECT tag FROM word_tags WHERE word_id = w.id ORDER BY rowid)
    ) AS tags_raw
  FROM words w
`;

// ── Routes ─────────────────────────────────────────────────────────────────────

// GET /vocab
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
        '(LOWER(w.word) LIKE ? OR LOWER(w.translation) LIKE ? OR EXISTS ' +
        '(SELECT 1 FROM word_glosses wg WHERE wg.word_id = w.id AND LOWER(wg.gloss) LIKE ?))'
      );
      params.push(pat, pat, pat);
    }
    if (posFilter)    { conditions.push('w.pos = ?');           params.push(posFilter); }
    if (bandFilter)   { conditions.push('w.band = ?');          params.push(bandFilter); }
    if (domainFilter) {
      conditions.push('EXISTS (SELECT 1 FROM json_each(w.domains) WHERE json_each.value = ?)');
      params.push(domainFilter);
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

// GET /vocab/:word
router.get('/vocab/:word', (req, res) => {
  try {
    const db   = getDb();
    const lang = validateLanguage(req.query.lang) || 'spanish';
    const row  = db.prepare(WORD_SELECT + ' WHERE w.word = ? AND w.language = ?')
      .get(req.params.word, lang);
    if (!row) return res.status(404).json({ error: 'Word not found' });
    res.json({ success: true, word: formatWord(row, lang) });
  } catch (err) {
    console.error('GET /admin/vocab/:word:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /vocab/:word  — update a single word
router.post('/vocab/:word', (req, res) => {
  try {
    const db   = getDb();
    const lang = validateLanguage(req.query.lang) || 'spanish';
    const body = req.body;

    if (!body || typeof body !== 'object')
      return res.status(400).json({ error: 'Body must be a JSON object' });

    const errors = [];
    if (body.glosses  !== undefined && !Array.isArray(body.glosses))  errors.push('glosses must be an array');
    if (body.examples !== undefined && !Array.isArray(body.examples)) errors.push('examples must be an array');
    if (body.domains  !== undefined && !Array.isArray(body.domains))  errors.push('domains must be an array');
    if (errors.length) return res.status(400).json({ error: errors.join('; ') });

    const wordRow = db.prepare('SELECT id FROM words WHERE word = ? AND language = ?')
      .get(req.params.word, lang);
    if (!wordRow) return res.status(404).json({ error: 'Word not found' });

    const wordId = wordRow.id;

    db.transaction(() => {
      let syllablesVal = null;
      if (body.linguistic?.syllables != null) {
        syllablesVal = Array.isArray(body.linguistic.syllables)
          ? body.linguistic.syllables.join('-')
          : String(body.linguistic.syllables);
      }
      const reflexiveVal = body.linguistic?.reflexive != null
        ? (body.linguistic.reflexive ? 1 : 0)
        : null;

      db.prepare(`
        UPDATE words SET
          translation      = ?,
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
        body.translation                     ?? null,
        body.pos                             ?? null,
        body.notes                           ?? null,
        body.emoji                           ?? null,
        body.linguistic?.ipa                 ?? null,
        body.frequency?.band                 ?? null,
        body.domains != null ? JSON.stringify(body.domains) : null,
        body.difficulty                      ?? null,
        body.linguistic?.gender              ?? null,
        body.linguistic?.plural              ?? null,
        body.linguistic?.infinitive          ?? null,
        reflexiveVal,
        body.linguistic?.register            ?? null,
        syllablesVal,
        body.frequency?.rank                 ?? null,
        body.frequency?.corpus_frequency     ?? null,
        wordId,
      );

      if (Array.isArray(body.glosses))  replaceGlosses(db, wordId, body.glosses);
      if (Array.isArray(body.examples)) replaceExamples(db, wordId, body.examples);
    })();

    clearCache(lang);
    const updated = db.prepare(WORD_SELECT + ' WHERE w.id = ?').get(wordId);
    res.json({ success: true, message: 'Word updated', word: formatWord(updated, lang) });
  } catch (err) {
    console.error('POST /admin/vocab/:word:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /vocab  — batch update
router.post('/vocab', (req, res) => {
  try {
    const db   = getDb();
    const lang = validateLanguage(req.query.lang) || 'spanish';
    const { updates } = req.body;

    if (!Array.isArray(updates))
      return res.status(400).json({ error: 'updates must be an array' });

    let updated = 0;

    db.transaction(() => {
      for (const { word, data } of updates) {
        if (!word || !data) continue;
        const row = db.prepare('SELECT id FROM words WHERE word = ? AND language = ?').get(word, lang);
        if (!row) continue;
        const wordId = row.id;

        db.prepare(`
          UPDATE words SET
            translation = ?, pos = ?, notes = ?, ipa = ?, band = ?, domains = ?,
            updated_at  = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(
          data.translation          ?? null,
          data.pos                  ?? null,
          data.notes                ?? null,
          data.linguistic?.ipa      ?? null,
          data.frequency?.band      ?? null,
          data.domains != null ? JSON.stringify(data.domains) : null,
          wordId,
        );

        if (Array.isArray(data.glosses))  replaceGlosses(db, wordId, data.glosses);
        if (Array.isArray(data.examples)) replaceExamples(db, wordId, data.examples);
        updated++;
      }
    })();

    clearCache(lang);
    res.json({ success: true, message: `Updated ${updated} of ${updates.length} words`, updated });
  } catch (err) {
    console.error('POST /admin/vocab (batch):', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
