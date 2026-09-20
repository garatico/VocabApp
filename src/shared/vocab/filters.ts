import { BAND_CUTOFFS } from '../band.js';

/**
 * filters.ts — the search/pos/band/domain filter conditions admin/words.ts's
 * `GET /vocab` already applies, extracted so Tauri's local word listing (and
 * later, the paginated public API) can build the exact same WHERE clause
 * instead of a second hand-maintained copy of this logic.
 */
export interface WordFilterParams {
  language: string;
  search?:  string;
  pos?:     string;
  band?:    string;
  domain?:  string;
}

export interface WordFilterSql {
  where:  string;
  params: unknown[];
}

export function buildWordFilters(filters: WordFilterParams): WordFilterSql {
  const conditions: string[] = ['w.language = ?'];
  const params: unknown[]    = [filters.language];

  if (filters.search) {
    const pat = '%' + filters.search.toLowerCase() + '%';
    conditions.push(
      '(LOWER(w.word) LIKE ? OR LOWER(w.translation) LIKE ? OR EXISTS ' +
      '(SELECT 1 FROM word_glosses wg WHERE wg.word_id = w.id AND LOWER(wg.gloss) LIKE ?))'
    );
    params.push(pat, pat, pat);
  }
  if (filters.pos) { conditions.push('w.pos = ?'); params.push(filters.pos); }
  if (filters.band) {
    const idx = BAND_CUTOFFS.findIndex(([b]) => b === filters.band);
    if (idx !== -1) {
      const lo = idx === 0 ? 1 : BAND_CUTOFFS[idx - 1][1] + 1;
      const hi = BAND_CUTOFFS[idx][1];
      conditions.push('w.rank BETWEEN ? AND ?');
      params.push(lo, hi);
    } else if (filters.band === 'C2') {
      conditions.push('w.rank > ?');
      params.push(BAND_CUTOFFS[BAND_CUTOFFS.length - 1][1]);
    }
  }
  if (filters.domain) {
    conditions.push('EXISTS (SELECT 1 FROM json_each(w.domains) WHERE json_each.value = ?)');
    params.push(filters.domain);
  }

  return { where: conditions.join(' AND '), params };
}
