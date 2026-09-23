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
  /** One value, or several comma-separated (the admin Word Editor's POS
   *  filter is multi-select) — "noun" and "noun,verb" both work. */
  pos?:     string;
  /** Same comma-separated convention as `pos`. */
  band?:    string;
  /** Same comma-separated convention as `pos` — a word matches if any one
   *  of its `domains` array entries is in the list. */
  domain?:  string;
}

export interface WordFilterSql {
  where:  string;
  params: unknown[];
}

/** "a, b ,c" -> ["a","b","c"], "" -> []. */
function splitList(value: string | undefined): string[] {
  return (value ?? '').split(',').map(v => v.trim()).filter(Boolean);
}

/** The rank range for one CEFR band, or null for a name BAND_CUTOFFS
 *  doesn't recognize (anything but 'C2', which has no upper cutoff to
 *  list — the last band is simply "everything past the C1 line"). */
function bandRankRange(band: string): [number, number | null] | null {
  const idx = BAND_CUTOFFS.findIndex(([b]) => b === band);
  if (idx !== -1) {
    const lo = idx === 0 ? 1 : BAND_CUTOFFS[idx - 1][1] + 1;
    return [lo, BAND_CUTOFFS[idx][1]];
  }
  if (band === 'C2') return [BAND_CUTOFFS[BAND_CUTOFFS.length - 1][1] + 1, null];
  return null;
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

  const posList = splitList(filters.pos);
  if (posList.length === 1) {
    conditions.push('w.pos = ?'); params.push(posList[0]);
  } else if (posList.length > 1) {
    conditions.push(`w.pos IN (${posList.map(() => '?').join(',')})`);
    params.push(...posList);
  }

  const bandList = splitList(filters.band);
  if (bandList.length) {
    const rangeConditions: string[] = [];
    for (const band of bandList) {
      const range = bandRankRange(band);
      if (!range) continue;
      const [lo, hi] = range;
      if (hi == null) { rangeConditions.push('w.rank >= ?'); params.push(lo); }
      else             { rangeConditions.push('w.rank BETWEEN ? AND ?'); params.push(lo, hi); }
    }
    // Several bands are several non-adjacent rank ranges, OR'd together —
    // not an IN(), since what's actually being matched is w.rank, not a
    // column that ever holds "A1"/"B2" literally.
    if (rangeConditions.length) conditions.push('(' + rangeConditions.join(' OR ') + ')');
  }

  const domainList = splitList(filters.domain);
  if (domainList.length) {
    conditions.push(
      `EXISTS (SELECT 1 FROM json_each(w.domains) WHERE json_each.value IN (${domainList.map(() => '?').join(',')}))`
    );
    params.push(...domainList);
  }

  return { where: conditions.join(' AND '), params };
}
