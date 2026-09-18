/**
 * routes/admin/words.ts
 *
 * Word CRUD:
 *   GET  /vocab          — paginated word list
 *   GET  /vocab/:word    — single word
 *   POST /vocab/:word    — update single word
 *   POST /vocab          — batch update
 */

import { Router }                             from 'express';
import Database                               from 'better-sqlite3';
import { getDb, clearCache, bandFromRank, BAND_CUTOFFS, supportsDisambiguator } from '../../lib/vocab-loader.js';
import { getSvgUrl }                          from '../../lib/svg-loader.js';
import { validateLanguage }                   from './_utils.js';
import { logger }                             from '../../lib/logger.js';

const router = Router();

// ── Shared helpers ─────────────────────────────────────────────────────────────

function replaceGlosses(db: Database.Database, wordId: number, glosses: string[]): void {
  db.prepare('DELETE FROM word_glosses WHERE word_id = ?').run(wordId);
  const ins = db.prepare('INSERT INTO word_glosses (word_id, gloss, position) VALUES (?, ?, ?)');
  glosses.map(g => g.trim()).filter(Boolean).forEach((g, i) => ins.run(wordId, g, i));
}

function replaceExamples(db: Database.Database, wordId: number, examples: string[]): void {
  db.prepare('DELETE FROM word_examples WHERE word_id = ?').run(wordId);
  const ins = db.prepare('INSERT INTO word_examples (word_id, example, position) VALUES (?, ?, ?)');
  examples.map(e => e.trim()).filter(Boolean).forEach((e, i) => ins.run(wordId, e, i));
}

/**
 * The full `words` row UPDATE, shared by the single-word PATCH endpoint and
 * the batch endpoint below — batch used to only touch translation/pos/notes/
 * domains/ipa, a much narrower set than a single word's own PATCH, which
 * meant a caller editing several fields on several words at once (the admin
 * table view) had no single call that could actually save all of them.
 */
function applyWordUpdate(db: Database.Database, wordId: number, word: string, data: WordUpdateBody): void {
  const setClauses: string[] = ['updated_at = CURRENT_TIMESTAMP'];
  const params: unknown[]    = [];

  if ('translation' in data) { setClauses.push('translation = ?');      params.push(data.translation ?? null); }
  if ('pos'         in data) { setClauses.push('pos = ?');              params.push(data.pos         ?? null); }
  if ('notes'       in data) { setClauses.push('notes = ?');            params.push(data.notes       ?? null); }
  if ('emoji'       in data) { setClauses.push('emoji = ?');            params.push(data.emoji       ?? null); }
  if ('difficulty'  in data) { setClauses.push('difficulty = ?');       params.push(data.difficulty  ?? null); }
  if ('disambiguator' in data) {
    if (supportsDisambiguator()) {
      setClauses.push('disambiguator = ?'); params.push(data.disambiguator ?? null);
    } else {
      // Column doesn't exist on this database yet — dropped rather than
      // thrown, so the rest of this word's edit still saves. See
      // supportsDisambiguator's own comment in vocab-loader.ts.
      logger.warn(`Ignoring disambiguator update for '${word}' — no disambiguator column on this database yet`);
    }
  }
  if ('domains'     in data) {
    setClauses.push('domains = ?');
    params.push(data.domains != null ? JSON.stringify(data.domains) : null);
  }

  if (data.linguistic) {
    const ling = data.linguistic;
    if ('ipa'        in ling) { setClauses.push('ipa = ?');        params.push(ling.ipa        ?? null); }
    if ('gender'     in ling) { setClauses.push('gender = ?');     params.push(ling.gender     ?? null); }
    if ('plural'     in ling) { setClauses.push('plural = ?');     params.push(ling.plural     ?? null); }
    if ('infinitive' in ling) { setClauses.push('infinitive = ?'); params.push(ling.infinitive ?? null); }
    if ('register'   in ling) { setClauses.push('register = ?');   params.push(ling.register   ?? null); }
    if ('syllables'  in ling) {
      const sv = ling.syllables != null
        ? (Array.isArray(ling.syllables) ? ling.syllables.join('-') : String(ling.syllables))
        : null;
      setClauses.push('syllables = ?');
      params.push(sv);
    }
    if ('reflexive' in ling) {
      setClauses.push('reflexive = ?');
      params.push(ling.reflexive != null ? (ling.reflexive ? 1 : 0) : null);
    }
  }

  if (data.frequency) {
    const freq = data.frequency;
    if ('rank'             in freq) { setClauses.push('rank = ?');             params.push(freq.rank             ?? null); }
    if ('corpus_frequency' in freq) { setClauses.push('corpus_frequency = ?'); params.push(freq.corpus_frequency ?? null); }
  }

  if (setClauses.length > 1) {
    db.prepare(`UPDATE words SET ${setClauses.join(', ')} WHERE id = ?`)
      .run(...params, wordId);
  }

  if (Array.isArray(data.glosses))  replaceGlosses(db, wordId, data.glosses);
  if (Array.isArray(data.examples)) replaceExamples(db, wordId, data.examples);
}

// ── Types ──────────────────────────────────────────────────────────────────────

interface DbWordRow {
  id:                number;
  word:              string;
  translation:       string | null;
  pos:               string | null;
  difficulty:        string | null;
  notes:             string | null;
  emoji:             string | null;
  ipa:               string | null;
  gender:            string | null;
  plural:            string | null;
  register:          string | null;
  syllables:         string | null;
  infinitive:        string | null;
  reflexive:         number;
  rank:              number | null;
  corpus_frequency:  number | null;
  domains:           string | null;
  conjugation_class: string | null;
  glosses_raw:       string | null;
  examples_raw:      string | null;
  tags_raw:          string | null;
  /** Only present when supportsDisambiguator() — WORD_SELECT is `w.*`, so an
   *  absent column just means this key is absent from the row, not an error. */
  disambiguator?:    string | null;
}

interface LinguisticBody {
  ipa?:       string | null;
  gender?:    string | null;
  plural?:    string | null;
  infinitive?: string | null;
  reflexive?: boolean | null;
  register?:  string | null;
  syllables?: string | string[] | null;
}

interface FrequencyBody {
  rank?:             number | null;
  corpus_frequency?: number | null;
}

interface WordUpdateBody {
  translation?: string | null;
  pos?:         string | null;
  notes?:       string | null;
  emoji?:       string | null;
  difficulty?:  string | null;
  domains?:     string[] | null;
  glosses?:     string[];
  examples?:    string[];
  linguistic?:  LinguisticBody;
  frequency?:   FrequencyBody;
  disambiguator?: string | null;
}

interface BatchUpdateItem {
  word: string;
  data: WordUpdateBody;
}

// ── Formatters ─────────────────────────────────────────────────────────────────

function formatWord(row: DbWordRow, lang: string) {
  let domains: string[] = [];
  if (row.domains) {
    try { domains = JSON.parse(row.domains) as string[]; } catch (_) {}
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
    rank:      row.rank             || null,
    frequency: {
      band:             bandFromRank(row.rank),
      rank:             row.rank             || null,
      corpus_frequency: row.corpus_frequency || null,
    },
    domains,
    tags:              row.tags_raw ? row.tags_raw.split('|||').filter(Boolean) : [],
    conjugation_class: row.conjugation_class || null,
    disambiguator:     row.disambiguator || null,
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
    const lang   = validateLanguage(req.query['lang'] as string | undefined) || 'spanish';
    const search = ((req.query['search'] as string) || '').toLowerCase().trim();
    const page   = Math.max(1, parseInt(req.query['page'] as string) || 1);
    const limit  = Math.min(200, Math.max(1, parseInt(req.query['limit'] as string) || 100));
    const offset = (page - 1) * limit;

    const posFilter    = (req.query['pos']    as string) || null;
    const bandFilter   = (req.query['band']   as string) || null;
    const domainFilter = (req.query['domain'] as string) || null;

    const conditions = ['w.language = ?'];
    const params: unknown[] = [lang];

    if (search) {
      const pat = '%' + search + '%';
      conditions.push(
        '(LOWER(w.word) LIKE ? OR LOWER(w.translation) LIKE ? OR EXISTS ' +
        '(SELECT 1 FROM word_glosses wg WHERE wg.word_id = w.id AND LOWER(wg.gloss) LIKE ?))'
      );
      params.push(pat, pat, pat);
    }
    if (posFilter)  { conditions.push('w.pos = ?'); params.push(posFilter); }
    if (bandFilter) {
      const idx  = BAND_CUTOFFS.findIndex(([b]) => b === bandFilter);
      if (idx !== -1) {
        const lo = idx === 0 ? 1 : BAND_CUTOFFS[idx - 1][1] + 1;
        const hi = BAND_CUTOFFS[idx][1];
        conditions.push('w.rank BETWEEN ? AND ?');
        params.push(lo, hi);
      } else if (bandFilter === 'C2') {
        conditions.push('w.rank > ?');
        params.push(BAND_CUTOFFS[BAND_CUTOFFS.length - 1][1]);
      }
    }
    if (domainFilter) {
      conditions.push('EXISTS (SELECT 1 FROM json_each(w.domains) WHERE json_each.value = ?)');
      params.push(domainFilter);
    }

    const where = conditions.join(' AND ');
    const { total } = db.prepare('SELECT COUNT(*) AS total FROM words w WHERE ' + where).get(...params) as { total: number };
    const rows = db.prepare(
      WORD_SELECT + ' WHERE ' + where + ' ORDER BY COALESCE(w.rank,9999), w.word LIMIT ? OFFSET ?'
    ).all(...params, limit, offset) as DbWordRow[];

    res.json({
      success: true, language: lang, total,
      page, pages: Math.ceil(total / limit), limit,
      words: rows.map(row => formatWord(row, lang)),
    });
  } catch (err) {
    logger.error('GET /admin/vocab:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /vocab/:word
router.get('/vocab/:word', (req, res) => {
  try {
    const db   = getDb();
    const lang = validateLanguage(req.query['lang'] as string | undefined) || 'spanish';
    const row  = db.prepare(WORD_SELECT + ' WHERE w.word = ? AND w.language = ?')
      .get(req.params['word'], lang) as DbWordRow | undefined;
    if (!row) return res.status(404).json({ error: 'Word not found' });
    res.json({ success: true, word: formatWord(row, lang) });
  } catch (err) {
    logger.error('GET /admin/vocab/:word:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /vocab/:word  — update a single word (PATCH semantics: only sent fields are written)
router.post('/vocab/:word', (req, res) => {
  try {
    const db   = getDb();
    const lang = validateLanguage(req.query['lang'] as string | undefined) || 'spanish';
    const body = req.body as WordUpdateBody | null;

    if (!body || typeof body !== 'object')
      return res.status(400).json({ error: 'Body must be a JSON object' });

    const errors: string[] = [];
    if (body.glosses  !== undefined && !Array.isArray(body.glosses))  errors.push('glosses must be an array');
    if (body.examples !== undefined && !Array.isArray(body.examples)) errors.push('examples must be an array');
    if (body.domains  !== undefined && !Array.isArray(body.domains))  errors.push('domains must be an array');
    if (errors.length) return res.status(400).json({ error: errors.join('; ') });

    const wordRow = db.prepare('SELECT id FROM words WHERE word = ? AND language = ?')
      .get(req.params['word'], lang) as { id: number } | undefined;
    if (!wordRow) return res.status(404).json({ error: 'Word not found' });

    const wordId = wordRow.id;

    db.transaction(() => applyWordUpdate(db, wordId, req.params['word'], body))();

    clearCache(lang);
    const updated = db.prepare(WORD_SELECT + ' WHERE w.id = ?').get(wordId) as DbWordRow;
    res.json({ success: true, message: 'Word updated', word: formatWord(updated, lang) });
  } catch (err) {
    logger.error('POST /admin/vocab/:word:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /vocab  — batch update (PATCH semantics: only sent fields are written per word)
router.post('/vocab', (req, res) => {
  try {
    const db   = getDb();
    const lang = validateLanguage(req.query['lang'] as string | undefined) || 'spanish';
    const { updates } = req.body as { updates: BatchUpdateItem[] };

    if (!Array.isArray(updates))
      return res.status(400).json({ error: 'updates must be an array' });

    let updated = 0;

    db.transaction(() => {
      for (const { word, data } of updates) {
        if (!word || !data) continue;
        const row = db.prepare('SELECT id FROM words WHERE word = ? AND language = ?').get(word, lang) as { id: number } | undefined;
        if (!row) continue;

        applyWordUpdate(db, row.id, word, data);
        updated++;
      }
    })();

    clearCache(lang);
    res.json({ success: true, message: `Updated ${updated} of ${updates.length} words`, updated });
  } catch (err) {
    logger.error('POST /admin/vocab (batch):', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
